import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnChanges, OnDestroy, SimpleChanges, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { WritingModelApiService, WritingModelSaveBody, WritingModelSnapshot } from '../../../api/writing-model-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { newRequestId } from '../annotation-controls/annotation-editor.logic';
import { ConfirmDialog } from '../annotation-controls/confirm-dialog';

const UNSAVED_KEY = 'writing-model-editor';
const MESSAGES: Record<string, string> = {
  WRITING_MODEL_REVISION_CONFLICT: 'Your change was not saved: the improved writing changed since you opened it (another tab). The latest version is now loaded; your typing is kept. Check it and save again.',
  WRITING_MODEL_IDEMPOTENCY_CONFLICT: 'Your change was not saved because it conflicted with an earlier save. The latest version is now loaded.',
  WRITING_MODEL_DAILY_LIMIT: 'You have used today\'s AI drafts for this student (3 per day). No credit was used. You can still write or edit the text yourself.',
  INSUFFICIENT_ASSESSMENT_CREDITS: 'You have no credits left for an AI draft. No credit was used.',
  WRITING_MODEL_AI_FAILED: 'The AI draft could not be created. No credit was used. Try again later, or write the text yourself.',
  WRITING_MODEL_AI_INSTITUTION_UNSUPPORTED: 'AI drafts are not available for classes funded by an institution yet. No credit was used.',
  WRITING_MODEL_NO_TRANSCRIPT: 'An AI draft needs this student\'s transcript, which is not ready yet. No credit was used.',
  WRITING_MODEL_CLASS_CLOSED: 'This class is closed, so the improved writing is read-only. Nothing was changed.',
  WRITING_MODEL_INVALID_TEXT: 'The text is too long or contains something that cannot be saved (HTML tags or control characters).',
  WRITING_MODEL_EMPTY: 'Write or generate the improved writing before submitting it to the student.',
  WRITING_MODEL_RATE_LIMITED: 'You are saving faster than we can keep up. Wait a few minutes, then try again.',
};
const RELOAD = new Set(['WRITING_MODEL_REVISION_CONFLICT', 'WRITING_MODEL_IDEMPOTENCY_CONFLICT', 'WRITING_MODEL_CLASS_CLOSED']);

/**
 * "Improved Writing Model" for ONE submission (teacher only; rendered only when the backend answers, i.e. the feature is on and this
 * teacher owns the submission's assignment). An improved version of this student's own writing that only this student sees: write it or
 * draft it with AI from this student's writing, "Save draft" (hidden), "Submit Improved Writing to Student" (published to this student:
 * at once with "Release manually", the default; after their second draft with the other option). Text by interpolation only.
 */
@Component({
  selector: 'app-writing-model-editor',
  imports: [ConfirmDialog, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './writing-model-editor.html',
  styleUrl: './writing-model-editor.css',
})
export class WritingModelEditor implements OnChanges, OnDestroy {
  readonly submissionId = input<string | null>(null);
  private readonly api = inject(WritingModelApiService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private version = 0;

  readonly snapshot = signal<WritingModelSnapshot | null>(null);
  readonly text = signal('');
  readonly releaseRule = signal<'manual' | 'afterRevision'>('manual');
  readonly busy = signal<'' | 'saving' | 'submitting' | 'generating'>('');
  readonly notice = signal('');
  readonly error = signal('');
  readonly confirmGenerate = signal(false);

  readonly dirty = computed(() => {
    const s = this.snapshot();
    return Boolean(s) && (this.text() !== s!.text || this.releaseRule() !== s!.releaseRule);
  });
  readonly locked = computed(() => Boolean(this.busy()) || Boolean(this.snapshot()?.readOnly));
  readonly aiBlockedReason = computed(() => {
    const s = this.snapshot();
    if (!s) return '';
    if (s.readOnly) return 'This class is closed.';
    if (!s.aiAvailable) return 'AI drafts are not available for classes funded by an institution yet.';
    if (!s.hasTranscript) return 'An AI draft needs this student\'s transcript, which is not ready yet.';
    if (s.generationsToday >= s.generationsPerDay) return `You have used today's ${s.generationsPerDay} AI drafts for this student.`;
    return '';
  });
  /** The status chip: exactly what this student sees now. */
  readonly status = computed(() => {
    const s = this.snapshot();
    if (!s || s.visibility === 'draft') return { kind: 'draft' as const, label: 'Draft' };
    if (s.visibility === 'waiting') return { kind: 'waiting' as const, label: 'Waiting for second draft' };
    return { kind: 'released' as const, label: 'Released to this student' };
  });
  /** One line under the chip, in words. */
  readonly statusHelp = computed(() => {
    const s = this.snapshot();
    if (!s || !s.published) return 'This student does not see anything yet. Submit it when it is ready.';
    const pending = !s.published.sameAsDraft || this.dirty() ? ' The text in the box has changes this student does not see yet: submit again to update it.' : '';
    if (s.visibility === 'waiting') return `Submitted. This student sees it after submitting a second draft.${pending}`;
    return `This student sees the submitted version.${pending}`;
  });
  readonly ruleHelp = computed(() => this.releaseRule() === 'manual'
    ? 'Submit shows it to this student straight away.'
    : 'Submit approves it; this student sees it after submitting a second draft.');

  constructor() {
    effect(() => { const dirty = this.dirty(); untracked(() => { if (dirty) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['submissionId']) return;
    this.version++;
    this.snapshot.set(null); this.busy.set(''); this.notice.set(''); this.error.set(''); this.confirmGenerate.set(false);
    void this.load();
  }
  ngOnDestroy(): void { this.version++; this.unsaved.clear(UNSAVED_KEY); }

  private async load(keepForm = false): Promise<void> {
    const version = this.version, id = this.submissionId();
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
  private applyForm(s: WritingModelSnapshot): void { this.text.set(s.text); this.releaseRule.set(s.releaseRule); }

  value(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }
  setText(event: Event): void { this.text.set(this.value(event)); }
  setRule(event: Event): void { this.releaseRule.set(this.value(event) === 'afterRevision' ? 'afterRevision' : 'manual'); }
  /** The old assignment-wide model as a starting point (put in the box; nothing is saved until the teacher saves or submits). */
  useLegacy(): void { const legacy = this.snapshot()?.legacyAssignmentModel; if (legacy && !this.locked()) this.text.set(legacy.text); }

  /** "Save draft" keeps the working text hidden; "Submit" publishes it to this student under the chosen release option. */
  save(action: 'save' | 'submit'): void {
    const s = this.snapshot(), id = this.submissionId();
    if (!s || !id || this.locked()) return;
    if (action === 'submit' && !this.text().trim()) { this.error.set(MESSAGES['WRITING_MODEL_EMPTY']); return; }
    const body: WritingModelSaveBody = { requestId: newRequestId(), revision: s.revision, action, text: this.text(), releaseRule: this.releaseRule() };
    void this.run(action === 'submit' ? 'submitting' : 'saving', () => this.api.save(id, body),
      action === 'submit' ? '' : 'Saved as a draft. This student does not see it.');
  }

  askGenerate(): void { if (!this.locked() && !this.aiBlockedReason()) this.confirmGenerate.set(true); }
  generate(): void {
    this.confirmGenerate.set(false);
    const s = this.snapshot(), id = this.submissionId();
    if (!s || !id || this.locked()) return;
    void this.run('generating', () => this.api.generate(id, { requestId: newRequestId(), revision: s.revision }),
      'AI draft ready. 1 credit was used. This student does not see it until you submit it.');
  }

  private async run(kind: 'saving' | 'submitting' | 'generating', call: () => Promise<{ snapshot: WritingModelSnapshot }>, done: string): Promise<void> {
    const version = this.version;
    this.busy.set(kind); this.error.set(''); this.notice.set(kind === 'generating' ? 'Generating an AI draft…' : kind === 'submitting' ? 'Submitting…' : 'Saving…');
    try {
      const result = await call();
      if (version !== this.version) return;
      this.snapshot.set(result.snapshot); this.applyForm(result.snapshot);
      this.notice.set(done || (result.snapshot.visibility === 'waiting' ? 'Submitted. This student sees it after their second draft.' : 'Released to this student.'));
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
