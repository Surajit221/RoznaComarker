import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnChanges, OnDestroy, SimpleChanges, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TeacherEvaluationApiService } from '../../../api/teacher-evaluation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { newRequestId } from '../annotation-controls/annotation-editor.logic';
import { ConfirmDialog } from '../annotation-controls/confirm-dialog';
import {
  BLOCKED_TEXT, COMMENT_MAX, DraftRow, REASON_MAX, TeacherEvaluationBody, TeacherEvaluationHistoryRow, TeacherEvaluationSnapshot,
  changedCriteria, criterionLabel, describeFailure, draftFromSnapshot, hasErrors, historySummary, liveTotals, validate,
} from './teacher-evaluation.logic';

const UNSAVED_KEY = 'teacher-evaluation-editor';

/**
 * The teacher's "Edit scores" panel (Phase B3) in the AI-assisted Evaluation section. It exists only when the backend reports the feature on
 * for this teacher (the snapshot answers 404 otherwise, and nothing is rendered). Students and guests never load it: their pages receive the
 * final values already applied. Text is rendered by interpolation only.
 */
@Component({
  selector: 'app-teacher-evaluation-editor',
  imports: [ConfirmDialog, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './teacher-evaluation-editor.html',
  styleUrl: './teacher-evaluation-editor.css',
})
export class TeacherEvaluationEditor implements OnChanges, OnDestroy {
  readonly submissionId = input.required<string>();
  readonly heading = input('');
  /** A save went through: the page reloads its scores. */
  readonly saved = output<void>();

  private readonly api = inject(TeacherEvaluationApiService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private version = 0;
  /** The request of a save whose answer never arrived: sent again unchanged (same request id) so the server replays it. */
  private pending: { body: TeacherEvaluationBody; form: string } | null = null;

  readonly COMMENT_MAX = COMMENT_MAX; readonly REASON_MAX = REASON_MAX;
  readonly snapshot = signal<TeacherEvaluationSnapshot | null>(null);
  readonly open = signal(false);
  readonly draft = signal<DraftRow[]>([]);
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly showErrors = signal(false);
  readonly confirmReset = signal(false);
  private readonly initial = signal('');

  private readonly formKey = computed(() => JSON.stringify({ draft: this.draft(), reason: this.reason() }));
  readonly dirty = computed(() => this.open() && this.formKey() !== this.initial());
  readonly errors = computed(() => { const s = this.snapshot(); return s ? validate(s, this.draft(), this.reason()) : { rows: {} }; });
  readonly totals = computed(() => {
    const s = this.snapshot();
    if (!s) return { overall: null, grade: null };
    return this.open() ? liveTotals(s, this.draft()) : { overall: s.overall?.final ?? null, grade: s.grade?.final ?? null };
  });
  /** The criteria the teacher changed (shown when the form is closed, next to the AI suggested value). */
  readonly editedRows = computed(() => (this.snapshot()?.criteria ?? []).filter(c => c.teacher.score != null || c.teacher.comment != null));

  constructor() {
    effect(() => { const dirty = this.dirty(); untracked(() => { if (dirty) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['submissionId']) return;
    this.version++;
    this.snapshot.set(null); this.open.set(false); this.draft.set([]); this.reason.set(''); this.initial.set('');
    this.saving.set(false); this.notice.set(''); this.error.set(''); this.showErrors.set(false); this.confirmReset.set(false); this.pending = null;
    if (this.submissionId()) void this.load();
  }
  ngOnDestroy(): void { this.version++; this.unsaved.clear(UNSAVED_KEY); }

  async load(): Promise<void> {
    const version = this.version;
    try {
      const snapshot = await this.api.snapshot(this.submissionId());
      if (version === this.version) this.snapshot.set(snapshot);
    } catch {
      if (version === this.version) this.error.set('The score editor could not be loaded. Reload the page to try again.');
    }
  }

  label(key: string): string { return criterionLabel(key); }
  blockedText(reason: string): string { return BLOCKED_TEXT[reason] ?? 'The scores cannot be edited right now.'; }
  summary(row: TeacherEvaluationHistoryRow): string { return historySummary(row); }
  criterion(key: string) { return this.snapshot()?.criteria.find(c => c.key === key) ?? null; }
  rowError(key: string, field: 'score' | 'comment'): string | null { return this.showErrors() ? this.errors().rows[key]?.[field] ?? null : null; }
  value(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }

  startEdit(): void {
    const s = this.snapshot();
    if (!s?.editable || this.open()) return;
    const draft = draftFromSnapshot(s);
    this.draft.set(draft); this.reason.set(''); this.showErrors.set(false); this.error.set(''); this.notice.set('');
    this.initial.set(JSON.stringify({ draft, reason: '' }));
    this.open.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-te-heading]')?.focus(), { injector: this.injector });
  }
  setScore(key: string, event: Event): void { const v = this.value(event); this.draft.update(rows => rows.map(r => r.key === key ? { ...r, score: v } : r)); }
  setComment(key: string, event: Event): void { const v = this.value(event); this.draft.update(rows => rows.map(r => r.key === key ? { ...r, comment: v } : r)); }
  setReason(event: Event): void { this.reason.set(this.value(event)); }
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancel(); }
  }

  cancel(): void {
    if (this.saving()) return;
    this.open.set(false); this.showErrors.set(false); this.error.set(''); this.pending = null;
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-te-edit]')?.focus(), { injector: this.injector });
  }

  save(): void {
    const s = this.snapshot();
    if (!s || this.saving()) return;
    this.showErrors.set(true);
    if (hasErrors(this.errors())) {
      this.error.set('Please fix the highlighted values.');
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }
    const criteria = changedCriteria(s, this.draft());
    if (!Object.keys(criteria).length) { this.error.set(''); this.notice.set('Nothing to save: the values are the same as now.'); return; }
    const reason = this.reason().trim();
    const body: TeacherEvaluationBody = this.pending?.form === this.formKey() ? this.pending.body
      : { requestId: newRequestId(), revision: s.revision, criteria, ...(reason ? { reason } : {}) };
    void this.send(body);
  }

  askReset(): void { if (!this.saving()) this.confirmReset.set(true); }
  doReset(): void {
    const s = this.snapshot();
    this.confirmReset.set(false);
    if (!s) return;
    const reason = this.reason().trim();
    void this.send({ requestId: newRequestId(), revision: s.revision, reset: true, ...(reason ? { reason } : {}) });
  }

  private async send(body: TeacherEvaluationBody): Promise<void> {
    const version = this.version, form = this.formKey();
    this.saving.set(true); this.error.set(''); this.notice.set('Saving…');
    try {
      const result = await this.api.save(this.submissionId(), body);
      if (version !== this.version) return;
      this.pending = null;
      this.snapshot.set(result.snapshot);
      this.open.set(false); this.showErrors.set(false);
      this.notice.set('reset' in body ? 'Scores reset to AI suggested. Students see the AI values again.' : 'Scores saved. Students see the new values.');
      this.saved.emit();
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-te-edit]')?.focus({ preventScroll: true }), { injector: this.injector });
    } catch (failure) {
      if (version !== this.version) return;
      const { status, code } = failure instanceof HttpErrorResponse ? { status: failure.status, code: failure.error?.code as string | undefined } : { status: 0, code: undefined };
      const described = describeFailure(status, code);
      this.notice.set(''); this.error.set(described.message);
      this.pending = described.retry ? { body, form } : null;
      if (described.reload) await this.reloadKeepingForm(version);
    } finally {
      if (version === this.version) this.saving.set(false);
    }
  }
  /** After a conflict: the latest snapshot (new revision), with what the teacher typed still in the form. */
  private async reloadKeepingForm(version: number): Promise<void> {
    try {
      const snapshot = await this.api.snapshot(this.submissionId());
      if (version !== this.version) return;
      this.snapshot.set(snapshot);
      if (!snapshot?.editable) this.open.set(false);
    } catch { /* the message already says what happened */ }
  }
}
