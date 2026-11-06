import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnChanges, OnDestroy, SimpleChanges, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { WritingModelApiService, WritingModelSaveBody, WritingModelSnapshot } from '../../../api/writing-model-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { newRequestId } from '../annotation-controls/annotation-editor.logic';
import { ConfirmDialog } from '../annotation-controls/confirm-dialog';

const UNSAVED_KEY = 'writing-model-editor';
const MESSAGES: Record<string, string> = {
  WRITING_MODEL_REVISION_CONFLICT: 'Your change was not saved: the model answer changed since you opened it (another tab). The latest version is now loaded; your typing is kept. Check it and save again.',
  WRITING_MODEL_IDEMPOTENCY_CONFLICT: 'Your change was not saved because it conflicted with an earlier save. The latest version is now loaded.',
  WRITING_MODEL_DAILY_LIMIT: 'You have used today\'s AI drafts for this assignment (3 per day). No credit was used. You can still write or edit the text yourself.',
  INSUFFICIENT_ASSESSMENT_CREDITS: 'You have no credits left for an AI draft. No credit was used.',
  WRITING_MODEL_AI_FAILED: 'The AI draft could not be created. No credit was used. Try again later, or write the text yourself.',
  WRITING_MODEL_AI_INSTITUTION_UNSUPPORTED: 'AI drafts are not available for classes funded by an institution yet. No credit was used.',
  WRITING_MODEL_CLASS_CLOSED: 'This class is closed, so the model answer is read-only. Nothing was changed.',
  WRITING_MODEL_INVALID_TEXT: 'The text is too long or contains something that cannot be saved (HTML tags or control characters).',
  WRITING_MODEL_EMPTY: 'Write or generate a model answer before approving it.',
  WRITING_MODEL_RATE_LIMITED: 'You are saving faster than we can keep up. Wait a few minutes, then try again.',
};
const RELOAD = new Set(['WRITING_MODEL_REVISION_CONFLICT', 'WRITING_MODEL_IDEMPOTENCY_CONFLICT', 'WRITING_MODEL_CLASS_CLOSED']);

/**
 * "Improved Writing Model" for one assignment (teacher only; rendered only when the backend answers, i.e. the feature is on and this teacher
 * owns the assignment). Write or AI-draft a model answer, approve it, choose when students see it. Text by interpolation only.
 */
@Component({
  selector: 'app-writing-model-editor',
  imports: [ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './writing-model-editor.html',
  styleUrl: './writing-model-editor.css',
})
export class WritingModelEditor implements OnChanges, OnDestroy {
  readonly assignmentId = input<string | null>(null);
  private readonly api = inject(WritingModelApiService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private version = 0;

  readonly snapshot = signal<WritingModelSnapshot | null>(null);
  readonly text = signal('');
  readonly releaseRule = signal<'afterRevision' | 'manual'>('afterRevision');
  readonly released = signal(false);
  readonly busy = signal<'' | 'saving' | 'generating'>('');
  readonly notice = signal('');
  readonly error = signal('');
  readonly confirmGenerate = signal(false);

  readonly dirty = computed(() => {
    const s = this.snapshot();
    return Boolean(s) && (this.text() !== s!.text || this.releaseRule() !== s!.releaseRule || this.released() !== s!.released);
  });
  readonly locked = computed(() => Boolean(this.busy()) || Boolean(this.snapshot()?.readOnly));
  readonly aiBlockedReason = computed(() => {
    const s = this.snapshot();
    if (!s) return '';
    if (s.readOnly) return 'This class is closed.';
    if (!s.aiAvailable) return 'AI drafts are not available for classes funded by an institution yet.';
    if (s.generationsToday >= s.generationsPerDay) return `You have used today's ${s.generationsPerDay} AI drafts for this assignment.`;
    return '';
  });
  /** Whether students can see the saved text now (approved and the rule allows it), in words. */
  readonly visibility = computed(() => {
    const s = this.snapshot();
    if (!s || s.status !== 'approved') return 'Not visible to students (not approved).';
    if (s.releaseRule === 'manual') return s.released ? 'Visible to students now.' : 'Approved, waiting for you to release it.';
    return 'Approved: each student sees it after submitting a second draft.';
  });

  constructor() {
    effect(() => { const dirty = this.dirty(); untracked(() => { if (dirty) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['assignmentId']) return;
    this.version++;
    this.snapshot.set(null); this.busy.set(''); this.notice.set(''); this.error.set(''); this.confirmGenerate.set(false);
    void this.load();
  }
  ngOnDestroy(): void { this.version++; this.unsaved.clear(UNSAVED_KEY); }

  private async load(keepForm = false): Promise<void> {
    const version = this.version, id = this.assignmentId();
    if (!id) return;
    try {
      const snapshot = await this.api.snapshot(id);
      if (version !== this.version) return;
      this.snapshot.set(snapshot);
      if (snapshot && !keepForm) this.applyForm(snapshot);
    } catch {
      if (version === this.version) this.error.set('The Improved Writing Model could not be loaded. Reload the page to try again.');
    }
  }
  private applyForm(s: WritingModelSnapshot): void { this.text.set(s.text); this.releaseRule.set(s.releaseRule); this.released.set(s.released); }

  value(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }
  setText(event: Event): void { this.text.set(this.value(event)); }
  setRule(event: Event): void { const v = this.value(event); this.releaseRule.set(v === 'manual' ? 'manual' : 'afterRevision'); if (v !== 'manual') this.released.set(false); }
  setReleased(event: Event): void { this.released.set((event.target as HTMLInputElement).checked); }

  /** Save as a draft (hidden from students) or approve (visible as the release rule allows). */
  save(status: 'draft' | 'approved'): void {
    const s = this.snapshot(), id = this.assignmentId();
    if (!s || !id || this.locked()) return;
    if (status === 'approved' && !this.text().trim()) { this.error.set(MESSAGES['WRITING_MODEL_EMPTY']); return; }
    const body: WritingModelSaveBody = { requestId: newRequestId(), revision: s.revision, text: this.text(), status, releaseRule: this.releaseRule(),
      ...(this.releaseRule() === 'manual' ? { released: this.released() } : { released: false }) };
    void this.run('saving', () => this.api.save(id, body), status === 'approved' ? 'Approved. Students see it as the release setting allows.' : 'Saved as a draft. Students do not see it.');
  }

  askGenerate(): void { if (!this.locked() && !this.aiBlockedReason()) this.confirmGenerate.set(true); }
  generate(): void {
    this.confirmGenerate.set(false);
    const s = this.snapshot(), id = this.assignmentId();
    if (!s || !id || this.locked()) return;
    void this.run('generating', () => this.api.generate(id, { requestId: newRequestId(), revision: s.revision }),
      'AI draft ready. 1 credit was used. It is not visible to students until you approve it.');
  }

  private async run(kind: 'saving' | 'generating', call: () => Promise<{ snapshot: WritingModelSnapshot }>, done: string): Promise<void> {
    const version = this.version;
    this.busy.set(kind); this.error.set(''); this.notice.set(kind === 'generating' ? 'Generating an AI draft…' : 'Saving…');
    try {
      const result = await call();
      if (version !== this.version) return;
      this.snapshot.set(result.snapshot); this.applyForm(result.snapshot);
      this.notice.set(done);
    } catch (failure) {
      if (version !== this.version) return;
      const code = failure instanceof HttpErrorResponse ? failure.error?.code as string | undefined : undefined;
      this.notice.set('');
      this.error.set((code && MESSAGES[code]) || (failure instanceof HttpErrorResponse && failure.status === 0
        ? 'We could not reach the server. Nothing you typed was lost. Try again.' : 'The change could not be saved. Try again.'));
      if (code && RELOAD.has(code)) await this.load(true);
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-wm-error]')?.focus(), { injector: this.injector });
    } finally {
      if (version === this.version) this.busy.set('');
    }
  }
}
