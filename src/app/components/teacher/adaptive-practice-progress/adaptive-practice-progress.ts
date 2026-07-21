import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdaptivePracticeApiService } from '../../../api/adaptive-practice-api.service';
import type { TeacherAdaptiveAttempt, TeacherAdaptiveProgressResponse, TeacherAdaptiveSkill } from './adaptive-practice-progress.types';

interface HistoryState { open: boolean; loading: boolean; error: string; attempts: readonly TeacherAdaptiveAttempt[]; page: number; hasMore: boolean; }

@Component({ selector: 'app-adaptive-practice-progress', imports: [CommonModule], templateUrl: './adaptive-practice-progress.html', styleUrl: './adaptive-practice-progress.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class AdaptivePracticeProgress {
  private readonly api = inject(AdaptivePracticeApiService); private readonly cdr = inject(ChangeDetectorRef); private readonly destroyRef = inject(DestroyRef);
  private submissionIdValue = ''; private requestVersion = 0;
  @Input({ required: true }) set submissionId(value: string | null | undefined) {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next === this.submissionIdValue) return;
    this.submissionIdValue = next; this.reset(); if (next) this.loadProgress(next);
  }
  get submissionId(): string { return this.submissionIdValue; }
  loading = false; error = ''; progress: TeacherAdaptiveProgressResponse | null = null; histories: Readonly<Record<string, HistoryState>> = {};
  toggleHistory(skill: TeacherAdaptiveSkill): void {
    const current = this.histories[skill.activityId] || this.emptyHistory();
    const open = !current.open; this.histories = { ...this.histories, [skill.activityId]: { ...current, open } };
    if (open && !current.attempts.length && !current.loading) this.loadHistory(skill.activityId, 1); else this.cdr.markForCheck();
  }
  loadMore(activityId: string): void { const state = this.histories[activityId]; if (state && state.hasMore && !state.loading) this.loadHistory(activityId, state.page + 1); }
  history(activityId: string): HistoryState { return this.histories[activityId] || this.emptyHistory(); }
  private reset(): void { this.requestVersion++; this.loading = false; this.error = ''; this.progress = null; this.histories = {}; }
  private loadProgress(submissionId: string): void {
    const version = ++this.requestVersion; this.loading = true;
    this.api.getTeacherProgress(submissionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => { if (version !== this.requestVersion || submissionId !== this.submissionId) return; this.progress = response; this.loading = false; this.cdr.markForCheck(); },
      error: () => { if (version !== this.requestVersion) return; this.error = 'Adaptive practice progress could not be loaded.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }
  private loadHistory(activityId: string, page: number): void {
    const sessionId = this.progress?.sessionId; if (!sessionId) return;
    const version = this.requestVersion; const current = this.history(activityId);
    this.histories = { ...this.histories, [activityId]: { ...current, open: true, loading: true, error: '' } };
    this.api.getTeacherActivityAttempts(sessionId, activityId, page, 10).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => { if (version !== this.requestVersion || sessionId !== this.progress?.sessionId) return; const latest = this.history(activityId); const merged = page === 1 ? response.attempts : [...latest.attempts, ...response.attempts]; this.histories = { ...this.histories, [activityId]: { ...latest, loading: false, attempts: merged, page: response.pagination.page, hasMore: response.pagination.hasMore } }; this.cdr.markForCheck(); },
      error: () => { if (version !== this.requestVersion) return; const latest = this.history(activityId); this.histories = { ...this.histories, [activityId]: { ...latest, loading: false, error: 'Attempt history could not be loaded.' } }; this.cdr.markForCheck(); }
    });
  }
  private emptyHistory(): HistoryState { return { open: false, loading: false, error: '', attempts: [], page: 0, hasMore: false }; }
}
