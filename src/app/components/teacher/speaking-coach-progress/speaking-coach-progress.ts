import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { SpeakingCoachApiService, type TeacherCoachAttempt, type TeacherCoachProgress, type TeacherCoachTask } from '../../../api/speaking-coach-api.service';
import { COACH_TASK_TYPE_LABEL } from '../../../utils/speaking-coach-messages';

interface HistoryState { open: boolean; loading: boolean; error: string; attempts: readonly TeacherCoachAttempt[]; page: number; hasMore: boolean; }

const REASON: Readonly<Record<string, string>> = { not_enough_speech: 'Not enough speech to check', not_english: 'Mostly not in English',
  unintelligible: 'Could not be understood', off_topic: 'Did not answer the task', too_long: 'Too long to check' };

/**
 * The teacher's read-only Speaking Coach progress for one speaking submission (like the essay "Adaptive Practice Progress" card): tasks passed,
 * recordings used, and per task the level in the graded result, the latest practice level, pass or not, and the pass rule in words; the
 * attempt history on request (the student's answer as text, the level, the feedback). Not shown at all while the coach is off (404).
 */
@Component({
  selector: 'app-speaking-coach-progress',
  imports: [CommonModule],
  templateUrl: './speaking-coach-progress.html',
  styleUrl: './speaking-coach-progress.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpeakingCoachProgress {
  private readonly api = inject(SpeakingCoachApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private submissionIdValue = '';
  private version = 0;
  readonly typeLabel = COACH_TASK_TYPE_LABEL;

  @Input({ required: true }) set submissionId(value: string | null | undefined) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next === this.submissionIdValue) return;
    this.submissionIdValue = next;
    this.reset();
    if (next) void this.load(next);
  }
  get submissionId(): string { return this.submissionIdValue; }

  loading = false;
  error = '';
  progress: TeacherCoachProgress | null = null;
  histories: Readonly<Record<string, HistoryState>> = {};

  get percent(): number {
    const s = this.progress?.summary;
    return s && s.totalTasks ? Math.round(s.passedTasks / s.totalTasks * 100) : 0;
  }

  statusText(task: TeacherCoachTask): string { return task.passed ? 'Passed' : task.status === 'locked' ? 'Not started' : 'Keep practising'; }
  reasonText(reason: string | null): string { return reason ? REASON[reason] || 'Could not be checked' : ''; }
  history(taskId: string): HistoryState { return this.histories[taskId] || { open: false, loading: false, error: '', attempts: [], page: 0, hasMore: false }; }

  toggle(task: TeacherCoachTask): void {
    const current = this.history(task.taskId);
    const open = !current.open;
    this.histories = { ...this.histories, [task.taskId]: { ...current, open } };
    if (open && !current.attempts.length && !current.loading) void this.loadHistory(task.taskId, 1);
    else this.cdr.markForCheck();
  }

  loadMore(taskId: string): void {
    const state = this.history(taskId);
    if (state.hasMore && !state.loading) void this.loadHistory(taskId, state.page + 1);
  }

  private reset(): void { this.version++; this.loading = false; this.error = ''; this.progress = null; this.histories = {}; }

  private async load(submissionId: string): Promise<void> {
    const version = ++this.version;
    this.loading = true;
    try {
      const progress = await this.api.getTeacherProgress(submissionId);
      if (version !== this.version) return;
      this.progress = progress;
    } catch {
      if (version !== this.version) return;
      this.error = 'Speaking practice progress could not be loaded.';
    } finally {
      if (version === this.version) { this.loading = false; this.cdr.markForCheck(); }
    }
  }

  private async loadHistory(taskId: string, page: number): Promise<void> {
    const sessionId = this.progress?.sessionId;
    if (!sessionId) return;
    const version = this.version;
    this.histories = { ...this.histories, [taskId]: { ...this.history(taskId), open: true, loading: true, error: '' } };
    this.cdr.markForCheck();
    try {
      const response = await this.api.getTeacherAttempts(sessionId, taskId, page, 10);
      if (version !== this.version) return;
      const latest = this.history(taskId);
      this.histories = { ...this.histories, [taskId]: { ...latest, loading: false, attempts: page === 1 ? response.attempts : [...latest.attempts, ...response.attempts],
        page: response.pagination.page, hasMore: response.pagination.hasMore } };
    } catch {
      if (version !== this.version) return;
      this.histories = { ...this.histories, [taskId]: { ...this.history(taskId), loading: false, error: 'Attempt history could not be loaded.' } };
    }
    this.cdr.markForCheck();
  }
}
