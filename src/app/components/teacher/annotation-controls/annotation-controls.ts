import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injectable, Injector, OnChanges, OnDestroy, OnInit, SimpleChanges, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import {
  AnnotationAction, AnnotationBody, AnnotationSnapshot, CorrectionRow, CorrectionValue, FormErrors, HistoryItem, MESSAGE_MAX, QUOTE_MAX, RowFilter, SUGGESTION_MAX,
  allowedActions, buildRows, describeFailure, filterCounts, historyActionLabel, historyQuote, historySummary, matchesFilter, needsReview, newRequestId, orphanReasonText, rowBadges,
  snapToWords, validateForm, wordSpans,
} from './annotation-editor.logic';
import { GradeCheck } from './grade-check';

const UNSAVED_KEY = 'teacher-annotation-editor';
const PAGE_SIZE = 50;
const FILTERS: { key: RowFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'visible', label: 'Visible to student' }, { key: 'hidden', label: 'Hidden' }, { key: 'archived', label: 'Removed' },
  { key: 'review', label: 'Needs review' }, { key: 'teacher', label: 'Yours' },
];
const DONE: Record<AnnotationAction, string> = { hide: 'Hidden from the student.', restore: 'Restored. The student can see it again.', archive: 'Removed. You can restore it from this list.', edit: 'Your edit is saved.', add: 'Your correction is added.' };

interface FormState { mode: 'add' | 'edit'; rowKey: string | null; targetId: string | null; orphan: boolean; pageIndex: number; value: CorrectionValue; initial: string; spanNote: string; }
interface PendingAction { body: AnnotationBody; rowKey: string | null; fromForm: boolean; }
interface EditorDraft { submissionId: string; open: boolean; filter: RowFilter; limit: number; form: FormState | null; pending: PendingAction | null; conflict: boolean; showFormErrors: boolean; error: string; }

/**
 * Keeps the editor's state when the page is re-created without the user leaving: the dashboard layout has separate desktop and compact
 * trees, so crossing its width breakpoint (rotating a tablet, zooming) destroys and rebuilds the page. Memory only, never browser storage.
 */
@Injectable({ providedIn: 'root' })
export class AnnotationDraftStore { draft: EditorDraft | null = null; }

/**
 * The teacher's correction list and editor (6A API). Teacher and student text is shown by interpolation only. Every save carries the
 * snapshot's revision and a request id; an unconfirmed save keeps its exact body, so Retry can never apply twice (the server replays it).
 */
@Component({
  selector: 'app-annotation-controls',
  imports: [DatePipe, FormsModule, GradeCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annotation-controls.html',
  styleUrl: './annotation-controls.css',
})
export class AnnotationControls implements OnInit, OnChanges, OnDestroy {
  readonly submissionId = input.required<string>();
  /** The class is archived: known from the page, and confirmed by the server on any write. */
  readonly classClosed = input(false);
  readonly saved = output<void>();

  private readonly api = inject(TeacherAnnotationApiService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly drafts = inject(AnnotationDraftStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly removeDialog = viewChild<ElementRef<HTMLDialogElement>>('removeDialog');
  private version = 0;
  private trigger: HTMLElement | null = null;
  private readonly spansByPage = new Map<string, { start: number; end: number }[]>();

  readonly MESSAGE_MAX = MESSAGE_MAX; readonly SUGGESTION_MAX = SUGGESTION_MAX; readonly QUOTE_MAX = QUOTE_MAX; readonly FILTERS = FILTERS;
  readonly orphanReasonText = orphanReasonText; readonly rowBadges = rowBadges; readonly needsReview = needsReview; readonly historyActionLabel = historyActionLabel;
  readonly historySummary = historySummary; readonly historyQuote = historyQuote;

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly snapshot = signal<AnnotationSnapshot | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly closedByServer = signal(false);
  readonly noAccess = signal(false);
  readonly filter = signal<RowFilter>('all');
  readonly limit = signal(PAGE_SIZE);
  readonly form = signal<FormState | null>(null);
  readonly showFormErrors = signal(false);
  readonly conflict = signal(false);
  readonly pending = signal<PendingAction | null>(null);
  readonly confirmRow = signal<CorrectionRow | null>(null);
  readonly historyOpen = signal(false);
  readonly historyLoading = signal(false);
  readonly historyItems = signal<HistoryItem[]>([]);
  readonly historyNext = signal<number | null>(null);

  /** The snapshot's indicator is the authority; the page's class status covers the time before it loads, and a 409 is the backstop. */
  readonly closed = computed(() => Boolean(this.snapshot()?.readOnly) || this.classClosed() || this.closedByServer());
  readonly readOnly = computed(() => this.closed() || this.noAccess());
  readonly rows = computed(() => { const s = this.snapshot(); return s ? buildRows(s) : []; });
  readonly counts = computed(() => filterCounts(this.rows()));
  /** The server's own student view, not a recount. */
  readonly studentVisible = computed(() => this.snapshot()?.effective?.length ?? 0);
  private readonly filtered = computed(() => { const f = this.filter(); return this.rows().filter(r => matchesFilter(r, f)); });
  readonly filteredCount = computed(() => this.filtered().length);
  /** Rendering is capped: a 300-correction essay draws PAGE_SIZE rows until the teacher asks for more. */
  readonly shownRows = computed(() => this.filtered().slice(0, this.limit()));
  readonly groups = computed(() => this.snapshot()?.legend?.groups ?? []);
  private readonly symbols = computed(() => new Map(this.groups().flatMap(g => g.symbols.map(s => [s.symbol, g.key] as [string, string]))));
  readonly formPage = computed(() => { const f = this.form(); return f ? this.snapshot()?.pages?.[f.pageIndex] : undefined; });
  readonly formErrors = computed<FormErrors>(() => { const f = this.form(); return f ? validateForm(f.value, this.formPage(), this.symbols()) : {}; });
  readonly formDirty = computed(() => { const f = this.form(); return Boolean(f && JSON.stringify(f.value) !== f.initial); });
  readonly hasUnsaved = computed(() => this.formDirty() || this.pending() !== null);
  /** What is saved now for the row being edited, shown after a conflict so the teacher can compare before saving again. */
  readonly savedVersion = computed(() => { const f = this.form(); return f?.targetId && this.conflict() ? this.rows().find(r => r.targetId === f.targetId || r.key === f.rowKey) ?? null : null; });
  /** Blocks new actions while one is running or unconfirmed. Buttons stay focusable (aria-disabled) so keyboard focus is never lost. */
  readonly locked = computed(() => this.saving() || this.pending() !== null || this.readOnly());
  /** A grade check is about what is saved: it waits for anything the editor has not saved yet. */
  readonly gradeCheckBlock = computed(() => this.saving() ? 'A correction is being saved. Wait for it to finish.'
    : this.hasUnsaved() ? 'Save or cancel your correction first: the scores should be checked against what the student will see.' : '');

  constructor() {
    // untracked: the registry's own state must not re-run this, or agreeing to discard would register the work again.
    effect(() => { const unsaved = this.hasUnsaved(); untracked(() => { if (unsaved) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
  }

  ngOnInit(): void {
    const draft = this.drafts.draft;
    this.drafts.draft = null;
    if (!draft || draft.submissionId !== this.submissionId()) return;
    this.open.set(draft.open); this.filter.set(draft.filter); this.limit.set(draft.limit); this.form.set(draft.form); this.pending.set(draft.pending);
    this.conflict.set(draft.conflict); this.showFormErrors.set(draft.showFormErrors); this.error.set(draft.error);
    // A save that was running when the page was rebuilt is unconfirmed: Retry is offered, and is safe because the server replays it.
    if (draft.pending && !draft.error) this.error.set(describeFailure(0, undefined).message);
    if (draft.open) void this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['submissionId'] || changes['submissionId'].firstChange) return;
    this.version++;
    this.spansByPage.clear();
    this.open.set(false); this.loading.set(false); this.snapshot.set(null); this.saving.set(false); this.notice.set(''); this.error.set(''); this.closedByServer.set(false);
    this.noAccess.set(false); this.filter.set('all'); this.limit.set(PAGE_SIZE); this.form.set(null); this.conflict.set(false); this.pending.set(null); this.confirmRow.set(null);
    this.historyOpen.set(false); this.historyItems.set([]); this.historyNext.set(null);
  }

  ngOnDestroy(): void {
    this.version++;   // anything still running belongs to this instance and must not touch it any more
    // Registered and unsaved means the user did not agree to leave (the guard clears it when they do): the page is being rebuilt.
    const keep = this.hasUnsaved() && this.unsaved.has(UNSAVED_KEY);
    if (keep || this.open()) {
      this.drafts.draft = { submissionId: this.submissionId(), open: this.open(), filter: this.filter(), limit: this.limit(), form: keep ? this.form() : null, pending: keep ? this.pending() : null,
        conflict: keep && this.conflict(), showFormErrors: keep && this.showFormErrors(), error: keep ? this.error() : '' };
    }
    if (!keep) this.unsaved.clear(UNSAVED_KEY);
  }

  async toggle(): Promise<void> {
    this.open.update(open => !open);
    if (this.open() && !this.snapshot()) await this.reload();
  }

  /** Loads the latest snapshot. The old list stays on screen until the new one arrives, so nothing jumps. */
  async reload(): Promise<void> {
    const version = this.version;
    this.loading.set(true);
    try {
      const snapshot = await this.api.snapshot(this.submissionId());
      if (version !== this.version) return;
      this.spansByPage.clear();
      this.snapshot.set(snapshot);
    } catch (failure) {
      if (version === this.version) this.showLoadFailure(failure);
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }

  private showLoadFailure(failure: unknown): void {
    const { status, code } = this.parseError(failure);
    const described = describeFailure(status, code);
    if (described.kind === 'notFound') this.noAccess.set(true);
    this.error.set(described.kind === 'unconfirmed' ? 'The corrections could not be loaded. Check your connection and try again.' : described.message);
  }

  private parseError(failure: unknown): { status: number; code: string | undefined } {
    return failure instanceof HttpErrorResponse ? { status: failure.status, code: failure.error?.code } : { status: 0, code: undefined };
  }

  actionsFor(row: CorrectionRow): AnnotationAction[] {
    const snapshot = this.snapshot();
    return snapshot ? allowedActions(row, snapshot.transitions) : [];
  }

  run(action: AnnotationAction, row: CorrectionRow): void {
    const snapshot = this.snapshot();
    if (this.locked() || !snapshot || this.form()) return;
    if (!allowedActions(row, snapshot.transitions).includes(action)) return;
    void this.send({ action, id: row.targetId, revision: snapshot.revision, sourceHash: snapshot.sourceHash, requestId: newRequestId() }, row.key, false);
  }

  askRemove(row: CorrectionRow, event: Event): void {
    if (this.locked() || this.form()) return;
    this.trigger = event.currentTarget as HTMLElement;
    this.confirmRow.set(row);
    this.removeDialog()?.nativeElement.showModal();
  }
  confirmRemove(): void {
    const row = this.confirmRow();
    this.closeRemove();
    if (row) this.run('archive', row);
  }
  closeRemove(): void {
    const dialog = this.removeDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.confirmRow.set(null);
  }

  private async send(body: AnnotationBody, rowKey: string | null, fromForm: boolean): Promise<void> {
    const version = this.version;
    this.pending.set({ body, rowKey, fromForm });
    this.saving.set(true); this.error.set(''); this.notice.set('Saving…');
    try {
      await this.api.mutate(this.submissionId(), body);
      if (version !== this.version) return;
      this.pending.set(null);
      if (fromForm) { this.form.set(null); this.conflict.set(false); this.showFormErrors.set(false); }
      await this.reload();
      if (version !== this.version) return;
      const backInReview = body.action === 'restore' && this.rows().some(r => (r.targetId === body.id || r.key === rowKey) && r.orphanReason);
      this.notice.set(backInReview ? 'Back in Needs review. It is still not shown to the student.' : DONE[body.action]);
      this.saved.emit();
      if (this.historyOpen()) await this.loadHistory(true);
      this.focusAfterSave(rowKey, body);
    } catch (failure) {
      if (version === this.version) await this.handleSaveFailure(failure);
    } finally {
      if (version === this.version) this.saving.set(false);
    }
  }

  private async handleSaveFailure(failure: unknown): Promise<void> {
    const { status, code } = this.parseError(failure);
    const described = describeFailure(status, code);
    this.notice.set('');
    this.error.set(described.message);
    // Unconfirmed (offline, 5xx) and rate-limited: the exact request is kept for Retry, with its request id. The form stays.
    if (described.kind === 'unconfirmed' || described.kind === 'rate') return;
    this.pending.set(null);
    if (described.kind === 'closed') this.closedByServer.set(true);
    if (described.kind === 'notFound') this.noAccess.set(true);
    if (described.kind === 'stale' && this.form()) this.conflict.set(true);
    if (described.kind === 'stale' || described.kind === 'state' || described.kind === 'closed') await this.reload();
  }

  /** Same request, same id: if the first attempt did reach the server, it answers with the first result instead of applying again. */
  retry(): void {
    const pending = this.pending();
    if (pending && !this.saving()) void this.send(pending.body, pending.rowKey, pending.fromForm);
  }
  /** Gives up on an unconfirmed save. It may have reached the server, so the list is reloaded to show the truth. */
  discardPending(): void {
    if (this.saving()) return;
    this.pending.set(null); this.error.set('');
    void this.reload();
  }

  private focusAfterSave(rowKey: string | null, body: AnnotationBody): void {
    afterNextRender(() => {
      const target = (rowKey && this.host.nativeElement.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(rowKey)}"]`))
        || (body.id && this.host.nativeElement.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(body.id)}"]`))
        || this.host.nativeElement.querySelector<HTMLElement>('[data-list-heading]');
      target?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  setFilter(filter: RowFilter): void { this.filter.set(filter); this.limit.set(PAGE_SIZE); }
  showMore(): void { this.limit.update(limit => limit + PAGE_SIZE); }

  openForm(row: CorrectionRow | null, event: Event): void {
    const snapshot = this.snapshot();
    if (this.locked() || this.form() || !snapshot?.pages?.length) return;
    this.trigger = event.currentTarget as HTMLElement;
    const foundPage = row ? snapshot.pages.findIndex(p => p.fileId === row.fileId && p.pageNumber === row.page) : 0;
    const pageIndex = Math.max(0, foundPage), page = snapshot.pages[pageIndex];
    // A span is reused only when it still matches the transcript (an orphan's old span does not); otherwise the teacher selects again.
    const spanValid = row && foundPage >= 0 && row.startChar !== null && row.endChar !== null
      && page.text.slice(row.startChar - page.startChar, row.endChar - page.startChar) === row.quotedText && row.quotedText.length > 0;
    const value: CorrectionValue = { fileId: page.fileId, page: page.pageNumber, startChar: spanValid ? row!.startChar! : 0, endChar: spanValid ? row!.endChar! : 0,
      quotedText: spanValid ? row!.quotedText : '', symbol: row && this.symbols().get(row.symbol) ? row.symbol : '', category: row && this.symbols().get(row.symbol) ? this.symbols().get(row.symbol)! : '',
      message: row?.message ?? '', suggestedText: row?.suggestedText ?? '' };
    this.showFormErrors.set(false); this.conflict.set(false); this.error.set('');
    this.form.set({ mode: row ? 'edit' : 'add', rowKey: row?.key ?? null, targetId: row?.targetId ?? null, orphan: Boolean(row?.orphanReason), pageIndex, value, initial: JSON.stringify(value), spanNote: '' });
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('[data-form-heading]')?.focus();
      if (spanValid) this.host.nativeElement.querySelector<HTMLTextAreaElement>('[data-source-text]')?.setSelectionRange(row!.startChar! - page.startChar, row!.endChar! - page.startChar);
    }, { injector: this.injector });
  }

  patch(patch: Partial<CorrectionValue>): void { this.form.update(f => f ? { ...f, value: { ...f.value, ...patch } } : f); }
  chooseSymbol(symbol: string): void { this.patch({ symbol, category: this.symbols().get(symbol) ?? '' }); }
  choosePage(pageIndex: number): void {
    const page = this.snapshot()?.pages?.[pageIndex];
    if (!page) return;
    this.form.update(f => f ? { ...f, pageIndex, spanNote: '', value: { ...f.value, fileId: page.fileId, page: page.pageNumber, startChar: 0, endChar: 0, quotedText: '' } } : f);
  }

  /** Takes the transcript selection, grown to whole words. */
  useSelection(textarea: HTMLTextAreaElement): void {
    const f = this.form(), page = this.formPage();
    if (!f || !page) return;
    const key = `${page.fileId}:${page.pageNumber}`;
    if (!this.spansByPage.has(key)) this.spansByPage.set(key, wordSpans(page.text, page.words));
    const snapped = snapToWords(this.spansByPage.get(key)!, textarea.selectionStart, textarea.selectionEnd);
    if (!snapped) return;
    const grown = snapped.start !== textarea.selectionStart || snapped.end !== textarea.selectionEnd;
    this.form.set({ ...f, spanNote: grown ? 'Selection extended to whole words.' : '', value: { ...f.value, fileId: page.fileId, page: page.pageNumber,
      startChar: page.startChar + snapped.start, endChar: page.startChar + snapped.end, quotedText: page.text.slice(snapped.start, snapped.end) } });
  }

  saveForm(): void {
    const f = this.form(), snapshot = this.snapshot();
    if (!f || !snapshot || this.locked()) return;
    this.showFormErrors.set(true);
    if (Object.keys(this.formErrors()).length) {
      this.error.set('Please fix the highlighted fields.');
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-form-error]')?.focus(), { injector: this.injector });
      return;
    }
    const body: AnnotationBody = { action: f.mode, revision: snapshot.revision, sourceHash: snapshot.sourceHash, requestId: newRequestId(), value: { ...f.value },
      ...(f.mode === 'edit' && f.targetId ? { id: f.targetId } : {}) };
    void this.send(body, f.rowKey, true);
  }

  cancelForm(): void {
    if (this.saving()) return;
    this.form.set(null); this.pending.set(null); this.conflict.set(false); this.showFormErrors.set(false); this.error.set(''); this.notice.set('');
    const trigger = this.trigger;
    afterNextRender(() => { (trigger?.isConnected ? trigger : this.host.nativeElement.querySelector<HTMLElement>('[data-list-heading]'))?.focus(); }, { injector: this.injector });
  }

  async toggleHistory(): Promise<void> {
    this.historyOpen.update(open => !open);
    if (this.historyOpen() && !this.historyItems().length) await this.loadHistory(true);
  }
  async loadHistory(fromStart: boolean): Promise<void> {
    const version = this.version, offset = fromStart ? 0 : this.historyNext() ?? 0;
    this.historyLoading.set(true);
    try {
      const page = await this.api.history(this.submissionId(), offset);
      if (version !== this.version) return;
      this.historyItems.update(items => fromStart ? page.items : [...items, ...page.items]);
      this.historyNext.set(page.nextOffset);
    } catch (failure) {
      if (version === this.version) this.showLoadFailure(failure);
    } finally {
      if (version === this.version) this.historyLoading.set(false);
    }
  }
  shortId(id: string | null | undefined): string { return id ? String(id).slice(-8) : ''; }

  /** The grade check recorded a decision. No score changed, so the page's results are not refreshed and the preview is not reloaded. */
  async onGradeChecked(): Promise<void> {
    await this.reload();
    if (this.historyOpen()) await this.loadHistory(true);
  }
}
