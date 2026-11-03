import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, Injectable, Injector, OnChanges, OnDestroy, OnInit, SimpleChanges, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { AuthService } from '../../../auth/auth.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { newRequestId } from './annotation-editor.logic';
import { REASON_MAX, ScoreReview, ScoreReviewBody, countLines, describeReviewFailure, reasonError, scoreLines, statusCopy } from './grade-check.logic';

const UNSAVED_KEY = 'teacher-grade-check';

interface GradeCheckDraft { submissionId: string; reason: string; pending: ScoreReviewBody | null; }
/** Keeps a typed reason, or an unconfirmed request, when the page is rebuilt without the user leaving (see AnnotationDraftStore). Memory only. */
@Injectable({ providedIn: 'root' })
export class GradeCheckDraftStore { draft: GradeCheckDraft | null = null; }

/**
 * "Grade check" (Task 7D): shows the scores and records that the teacher checked them. It never changes a score and never sends one. A request
 * keeps its id until it is confirmed, so Retry cannot record twice; nothing is ever sent again without the teacher pressing a button.
 */
@Component({
  selector: 'app-grade-check',
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grade-check.html',
  styleUrl: './grade-check.css',
})
export class GradeCheck implements OnInit, OnChanges, OnDestroy {
  readonly submissionId = input.required<string>();
  readonly review = input.required<ScoreReview>();
  readonly revision = input.required<number>();
  readonly sourceHash = input.required<string>();
  readonly readOnly = input(false);
  readonly closedNote = input('');
  /** Why the correction editor blocks this action right now (unsaved input, a save running), or empty. */
  readonly editorBlock = input('');
  /** A decision was recorded: the page reloads the snapshot and the history. */
  readonly decided = output<void>();
  readonly reloadNeeded = output<void>();
  readonly closedByServer = output<void>();
  readonly noAccess = output<void>();

  private readonly api = inject(TeacherAnnotationApiService);
  private readonly auth = inject(AuthService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly drafts = inject(GradeCheckDraftStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private version = 0;
  private meRequested = false;

  readonly REASON_MAX = REASON_MAX;
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly pending = signal<ScoreReviewBody | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  readonly fieldError = signal('');
  private readonly myId = signal<string | null>(null);

  readonly copy = computed(() => statusCopy(this.review()));
  readonly scoreLines = computed(() => scoreLines(this.review()));
  readonly countLines = computed(() => countLines(this.review()));
  readonly isCustomRubric = computed(() => this.review().scores.customRubricOverallScore != null);
  readonly decidedBy = computed(() => { const decision = this.review().decision, me = this.myId(); return !decision || !me ? 'a teacher' : decision.by === me ? 'you' : 'another teacher'; });
  readonly needed = computed(() => this.review().status === 'needed');
  /** The field stays while it holds text, so a reason is never lost to a status change. */
  readonly showReason = computed(() => !this.readOnly() && (this.needed() || this.reason().length > 0));
  /** Why the button cannot be used now. It stays focusable (aria-disabled), so keyboard focus is never lost and the reason can be read. */
  readonly blocked = computed(() => this.saving() ? 'Saving…' : this.pending() ? 'Press Retry or Discard first.' : this.editorBlock());
  readonly hasUnsaved = computed(() => this.reason().trim().length > 0 || this.pending() !== null);

  constructor() {
    // untracked: the registry's own state must not re-run this, or agreeing to discard would register the work again.
    effect(() => { const unsaved = this.hasUnsaved(); untracked(() => { if (unsaved) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
    effect(() => { if (this.review().decision && !this.meRequested) untracked(() => this.loadMe()); });
  }

  ngOnInit(): void {
    const draft = this.drafts.draft;
    this.drafts.draft = null;
    if (!draft || draft.submissionId !== this.submissionId()) return;
    this.reason.set(draft.reason); this.pending.set(draft.pending);
    if (draft.pending) this.error.set(describeReviewFailure(0, undefined).message);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['submissionId'] || changes['submissionId'].firstChange) return;
    this.version++;
    this.reason.set(''); this.pending.set(null); this.saving.set(false); this.notice.set(''); this.error.set(''); this.fieldError.set('');
  }

  ngOnDestroy(): void {
    this.version++;
    // Registered and unsaved means the user did not agree to leave (the guard clears it when they do): the page is being rebuilt.
    if (this.hasUnsaved() && this.unsaved.has(UNSAVED_KEY)) this.drafts.draft = { submissionId: this.submissionId(), reason: this.reason(), pending: this.pending() };
    else this.unsaved.clear(UNSAVED_KEY);
  }

  private loadMe(): void {
    this.meRequested = true;
    this.auth.getMeProfile().then(me => this.myId.set(me?.id ?? null)).catch(() => undefined);
  }

  setReason(value: string): void { this.reason.set(value); this.fieldError.set(reasonError(value) ?? ''); }
  clearReason(): void { this.reason.set(''); this.fieldError.set(''); }

  keep(): void {
    if (this.blocked() || this.readOnly() || !this.needed()) return;
    const problem = reasonError(this.reason());
    if (problem) {
      this.fieldError.set(problem);
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-grade-reason]')?.focus(), { injector: this.injector });
      return;
    }
    const reason = this.reason().trim() ? this.reason() : undefined;
    void this.send({ requestId: newRequestId(), revision: this.revision(), sourceHash: this.sourceHash(), scoreFingerprint: this.review().fingerprint, outcome: 'kept', ...(reason !== undefined ? { reason } : {}) });
  }

  /** The same request with the same id: if the first attempt did reach the server, it answers with the first result. */
  retry(): void {
    const pending = this.pending();
    if (pending && !this.saving()) void this.send(pending);
  }

  /** Gives up on an unconfirmed request. It may have reached the server, so the latest state is loaded. */
  discard(): void {
    if (this.saving()) return;
    this.pending.set(null); this.error.set(''); this.notice.set('');
    this.reloadNeeded.emit();
  }

  private async send(body: ScoreReviewBody): Promise<void> {
    const version = this.version;
    this.pending.set(body);
    this.saving.set(true); this.error.set(''); this.notice.set('Saving…');
    try {
      await this.api.scoreReview(this.submissionId(), body);
      if (version !== this.version) return;
      this.pending.set(null); this.reason.set(''); this.fieldError.set('');
      this.notice.set('Checked. The scores were kept and did not change.');
      this.decided.emit();
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-grade-status]')?.focus({ preventScroll: true }), { injector: this.injector });
    } catch (failure) {
      if (version === this.version) this.handleFailure(failure);
    } finally {
      if (version === this.version) this.saving.set(false);
    }
  }

  private handleFailure(failure: unknown): void {
    const status = failure instanceof HttpErrorResponse ? failure.status : 0;
    const code = failure instanceof HttpErrorResponse ? failure.error?.code : undefined;
    const described = describeReviewFailure(status, code);
    this.notice.set('');
    this.error.set(described.message);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-grade-error]')?.focus({ preventScroll: true }), { injector: this.injector });
    if (described.kind === 'retry') return;   // the exact request is kept for Retry; it is never sent again by itself
    this.pending.set(null);
    if (described.kind === 'closed') this.closedByServer.emit();
    if (described.kind === 'notFound') this.noAccess.emit();
    if (described.kind === 'reload' || described.kind === 'closed') this.reloadNeeded.emit();
  }
}
