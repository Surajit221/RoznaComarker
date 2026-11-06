import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, ElementRef, Injectable, Injector, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import {
  AnnotationAction, AnnotationBody, AnnotationSnapshot, BulkAction, BulkScope, CorrectionRow, CorrectionValue, FormErrors, HistoryItem, MESSAGE_MAX, QUOTE_MAX, RowFilter, SUGGESTION_MAX,
  allowedActions, buildRows, bulkTargets, plural, describeFailure, filterCounts, matchesFilter, needsReview, newRequestId, orphanReasonText, rowBadges,
  snapToWords, validateForm, wordSpans,
} from './annotation-editor.logic';
import { ChangeHistoryDialog } from './change-history-dialog';
import { GradeCheck } from './grade-check';
import { RowPosition, buildPositions, positionLabels, revealRow, withDrawn } from './annotation-sync.logic';
import { CorrectionSelection, SelectionSource } from './correction-selection';
import type { MarkMenuAction, MarkMenuEntry } from './annotation-mark-menu';
import { ReviewWorkspace, SyncPointer, applySyncPointer, scrollPanelTo } from './review-workspace';
import type { SharedPageImages } from '../../submission-page-review/shared-page-images';

const UNSAVED_KEY = 'teacher-annotation-editor';
const PAGE_SIZE = 50;
const FILTERS: { key: RowFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'visible', label: 'Visible to student' }, { key: 'hidden', label: 'Hidden' }, { key: 'archived', label: 'Removed' },
  { key: 'review', label: 'Needs review' }, { key: 'teacher', label: 'Yours' },
];
const DONE: Record<AnnotationAction, string> = { hide: 'Hidden from the student.', restore: 'Restored. The student can see it again.', archive: 'Removed. You can restore it from this list.', edit: 'Your edit is saved.', add: 'Your correction is added.' };

const HIDE_TEXT = 'The student will no longer see them and they will not count in their totals. They stay in your list marked Hidden and you can restore them. Each change is recorded in the change history. Scores do not change.';
/** Undo is offered this long after a bulk action. */
export const UNDO_MS = 8000;
interface BulkConfirm { action: BulkAction; scope: BulkScope; title: string; text: string; confirmLabel: string; }
interface BulkUndo { action: BulkAction; ids: string[]; label: string; }
interface FormState { mode: 'add' | 'edit'; rowKey: string | null; targetId: string | null; orphan: boolean; pageIndex: number; value: CorrectionValue; initial: string; spanNote: string; }
interface PendingAction { body: AnnotationBody; rowKey: string | null; fromForm: boolean; }
interface EditorDraft { submissionId: string; open: boolean; filter: RowFilter; limit: number; form: FormState | null; pending: PendingAction | null; conflict: boolean; showFormErrors: boolean; error: string; workspaceOpen: boolean; pinnedKey: string | null; }

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
  imports: [ChangeHistoryDialog, FormsModule, GradeCheck, ReviewWorkspace],
  providers: [CorrectionSelection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annotation-controls.html',
  styleUrl: './annotation-controls.css',
})
export class AnnotationControls implements OnInit, OnChanges, OnDestroy {
  readonly submissionId = input.required<string>();
  /** The class is archived: known from the page, and confirmed by the server on any write. */
  readonly classClosed = input(false);
  readonly saved = output<void>();
  /** The image the page already downloaded, for the review workspace. The workspace never fetches it again. */
  readonly imageUrl = input<string | null>(null);
  readonly imageLoading = input(false);
  readonly imageFailed = input(false);
  readonly activeFileId = input<string | null>(null);
  readonly isPdf = input(false);
  readonly imageStore = input<SharedPageImages | null>(null);
  readonly fileRequested = output<string>();

  private readonly api = inject(TeacherAnnotationApiService);
  private readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly drafts = inject(AnnotationDraftStore);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly selection = inject(CorrectionSelection);
  private readonly removeDialog = viewChild<ElementRef<HTMLDialogElement>>('removeDialog');
  private readonly bulkDialog = viewChild<ElementRef<HTMLDialogElement>>('bulkDialog');
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listPanel = viewChild<ElementRef<HTMLElement>>('listPanel');
  private readonly historyButton = viewChild<ElementRef<HTMLElement>>('historyButton');
  private version = 0;
  private historyRequest = 0;
  private trigger: HTMLElement | null = null;
  private readonly spansByPage = new Map<string, { start: number; end: number }[]>();

  readonly MESSAGE_MAX = MESSAGE_MAX; readonly SUGGESTION_MAX = SUGGESTION_MAX; readonly QUOTE_MAX = QUOTE_MAX; readonly FILTERS = FILTERS;
  readonly orphanReasonText = orphanReasonText; readonly rowBadges = rowBadges; readonly needsReview = needsReview;

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
  readonly historyError = signal('');
  /** Opens only when the teacher asks; closed, none of the workspace exists. */
  readonly workspaceOpen = signal(false);
  private readonly drawn = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  /** Phase A bulk actions. Selection holds row keys of rows a hide can change. */
  readonly selectMode = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly bulkConfirm = signal<BulkConfirm | null>(null);
  readonly undo = signal<BulkUndo | null>(null);

  /** The snapshot's indicator is the authority; the page's class status covers the time before it loads, and a 409 is the backstop. */
  readonly closed = computed(() => Boolean(this.snapshot()?.readOnly) || this.classClosed() || this.closedByServer());
  readonly readOnly = computed(() => this.closed() || this.noAccess());
  readonly rows = computed(() => { const s = this.snapshot(); return s ? buildRows(s) : []; });
  readonly counts = computed(() => filterCounts(this.rows()));
  /** Where each row is. The list says so even with the workspace closed, so a missing marker on the page's image is explained. */
  readonly positions = computed<Map<string, RowPosition>>(() => { const s = this.snapshot(); return s ? buildPositions(this.rows(), s) : new Map(); });
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
  readonly hideable = computed(() => new Set(bulkTargets(this.rows(), 'hide', { all: true }).map(row => row.key)));
  readonly selectedCount = computed(() => [...this.selected()].filter(key => this.hideable().has(key)).length);
  readonly categoryOptions = computed(() => this.groups().map(group => ({ key: group.key, label: group.label, count: bulkTargets(this.rows(), 'hide', { category: group.key }).length }))
    .filter(option => option.count > 0));
  readonly hiddenCount = computed(() => bulkTargets(this.rows(), 'restore', { all: true }).length);
  readonly gradeCheckBlock = computed(() => this.saving() ? 'A correction is being saved. Wait for it to finish.'
    : this.hasUnsaved() ? 'Save or cancel your correction first: the scores should be checked against what the student will see.' : '');

  constructor() {
    // untracked: the registry's own state must not re-run this, or agreeing to discard would register the work again.
    effect(() => { const unsaved = this.hasUnsaved(); untracked(() => { if (unsaved) this.unsaved.register(UNSAVED_KEY); else this.unsaved.clear(UNSAVED_KEY); }); });
    // One set of listeners on the list, however many rows it shows, and only while the workspace is open.
    effect(onCleanup => {
      const list = this.listPanel()?.nativeElement;
      if (!list || !this.workspaceOpen()) return;
      const host = this.host.nativeElement;
      const over = (event: PointerEvent): void => this.onListPointerOver(event), out = (event: PointerEvent): void => this.onListPointerOut(event);
      const focus = (event: FocusEvent): void => this.onListFocus(event), click = (event: MouseEvent): void => this.onListClick(event);
      const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') this.selection.clear(); };
      list.addEventListener('pointerover', over); list.addEventListener('pointerout', out); list.addEventListener('focusin', focus); list.addEventListener('click', click);
      host.addEventListener('keydown', key);
      onCleanup(() => {
        list.removeEventListener('pointerover', over); list.removeEventListener('pointerout', out); list.removeEventListener('focusin', focus); list.removeEventListener('click', click);
        host.removeEventListener('keydown', key);
      });
    });
    // A selection made in the transcript or on the image: the list shows that row. Only a pinned one may change the filter or the shown limit.
    effect(() => {
      const id = this.selection.activeId(), pinned = this.selection.pinnedId(), source = this.selection.source();
      if (!id || !this.workspaceOpen()) return;
      untracked(() => {
        if (source === 'list') return;
        if (id === pinned) {
          const reveal = revealRow(this.rows(), id, this.filter(), this.limit(), PAGE_SIZE);
          if (reveal) {
            if (reveal.filter !== this.filter()) this.notice.set('Showing all corrections, so the selected one is in the list.');
            this.filter.set(reveal.filter); this.limit.set(reveal.limit);
          }
        }
        afterNextRender(() => scrollPanelTo(this.listPanel()?.nativeElement, this.listPanel()?.nativeElement.querySelector(`[data-row-key="${CSS.escape(id)}"]`)), { injector: this.injector });
      });
    });
  }

  ngOnInit(): void {
    const draft = this.drafts.draft;
    this.drafts.draft = null;
    if (!draft || draft.submissionId !== this.submissionId()) return;
    this.open.set(draft.open); this.filter.set(draft.filter); this.limit.set(draft.limit); this.form.set(draft.form); this.pending.set(draft.pending);
    this.conflict.set(draft.conflict); this.showFormErrors.set(draft.showFormErrors); this.error.set(draft.error);
    // A save that was running when the page was rebuilt is unconfirmed: Retry is offered, and is safe because the server replays it.
    if (draft.pending && !draft.error) this.error.set(describeFailure(0, undefined).message);
    this.workspaceOpen.set(draft.workspaceOpen);
    if (draft.pinnedKey) this.selection.pin(draft.pinnedKey, 'list');
    if (draft.open) void this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['submissionId'] || changes['submissionId'].firstChange) return;
    this.version++;
    this.spansByPage.clear();
    this.open.set(false); this.loading.set(false); this.snapshot.set(null); this.saving.set(false); this.notice.set(''); this.error.set(''); this.closedByServer.set(false);
    this.noAccess.set(false); this.filter.set('all'); this.limit.set(PAGE_SIZE); this.form.set(null); this.conflict.set(false); this.pending.set(null); this.confirmRow.set(null);
    this.historyRequest++; this.historyOpen.set(false); this.historyLoading.set(false); this.historyItems.set([]); this.historyNext.set(null); this.historyError.set('');
    this.workspaceOpen.set(false); this.drawn.set(new Map()); this.selection.clear();
    this.selectMode.set(false); this.selected.set(new Set()); this.closeBulk(); this.clearUndo();
  }

  ngOnDestroy(): void {
    this.version++;   // anything still running belongs to this instance and must not touch it any more
    this.clearUndo();
    // Registered and unsaved means the user did not agree to leave (the guard clears it when they do): the page is being rebuilt.
    const keep = this.hasUnsaved() && this.unsaved.has(UNSAVED_KEY);
    if (keep || this.open()) {
      this.drafts.draft = { submissionId: this.submissionId(), open: this.open(), filter: this.filter(), limit: this.limit(), form: keep ? this.form() : null, pending: keep ? this.pending() : null,
        conflict: keep && this.conflict(), showFormErrors: keep && this.showFormErrors(), error: keep ? this.error() : '', workspaceOpen: this.workspaceOpen(), pinnedKey: this.selection.pinnedId() };
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
      this.drawn.set(new Map());
      // A saved change or an OCR re-run can take the selected correction away.
      const pinned = this.selection.pinnedId();
      if (pinned && !this.rows().some(row => row.key === pinned)) { this.selection.clear(); this.notice.set('The selected correction is no longer in the list.'); }
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

  /**
   * A mark the teacher clicked, tapped or pressed Enter on in the page's own image or transcript (outside the workspace). Shares the
   * selection with the list and the workspace, and loads the corrections once if the editor was never opened, so menuFor can answer.
   */
  markActivated(id: string, source: SelectionSource): void {
    if (!id) return;
    this.selection.pin(id, source);
    if (!this.snapshot() && !this.loading() && !this.noAccess()) void this.reload();
  }
  /** The teacher rows a mark's correction ids belong to, with their allowed actions; empty when the teacher cannot change them. */
  menuFor(ids: readonly string[] | null | undefined): MarkMenuEntry[] {
    if (this.readOnly() || !this.snapshot() || !ids?.length) return [];
    const byKey = new Map(this.rows().map(row => [row.key, row]));
    return [...new Set(ids)].map(id => byKey.get(id)).filter((row): row is CorrectionRow => Boolean(row))
      .map(row => ({ row, actions: this.actionsFor(row) })).filter(entry => entry.actions.length > 0);
  }

  /** A mark's menu (workspace, page image or page transcript) runs the same actions as the list's buttons. */
  onMenuAction(event: MarkMenuAction): void {
    const row = this.rows().find(r => r.key === event.key);
    if (!row) return;
    // The form lives inside the editor body: open it first so Edit has somewhere to appear.
    if (event.action === 'edit' && !this.open()) this.open.set(true);
    if (event.action === 'edit') this.openForm(row, event.event);
    else if (event.action === 'archive') this.askRemove(row, event.event);
    else this.run(event.action, row);
  }

  toggleSelectMode(): void { this.selectMode.update(on => !on); this.selected.set(new Set()); }
  toggleSelected(key: string): void {
    this.selected.update(set => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  askHideSelected(event: Event): void {
    const ids = this.rows().filter(row => this.selected().has(row.key) && this.hideable().has(row.key)).map(row => row.targetId);
    if (ids.length) this.askBulk({ action: 'hide', scope: { ids }, title: `Hide ${plural(ids.length, 'correction')} from the student?`, confirmLabel: 'Hide', text: HIDE_TEXT }, event);
  }
  askHideCategory(option: { key: string; label: string; count: number }, event: Event): void {
    this.askBulk({ action: 'hide', scope: { category: option.key }, title: `Hide all ${option.label} corrections (${option.count}) from the student?`, confirmLabel: 'Hide all', text: HIDE_TEXT }, event);
  }
  askRestoreAll(event: Event): void {
    this.askBulk({ action: 'restore', scope: { all: true }, title: `Restore ${plural(this.hiddenCount(), 'hidden correction')}?`, confirmLabel: 'Restore all',
      text: 'The student will see them again. Removed corrections stay removed. Each change is recorded in the change history. Scores do not change.' }, event);
  }
  private askBulk(confirm: BulkConfirm, event: Event): void {
    if (this.locked() || this.form()) return;
    this.trigger = event.currentTarget as HTMLElement;
    this.bulkConfirm.set(confirm);
    this.bulkDialog()?.nativeElement.showModal();
  }
  confirmBulk(): void {
    const confirm = this.bulkConfirm();
    this.closeBulk();
    if (confirm) void this.sendBulk(confirm.action, confirm.scope, true);
  }
  closeBulk(): void {
    const dialog = this.bulkDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.bulkConfirm.set(null);
  }
  undoBulk(): void {
    const undo = this.undo();
    this.clearUndo();
    if (undo && !this.locked()) void this.sendBulk(undo.action, { ids: undo.ids }, false);
  }
  private clearUndo(): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoTimer = null; this.undo.set(null);
  }

  /** One request for many items. Undo sends the opposite action for exactly the ids the server changed. */
  private async sendBulk(action: BulkAction, scope: BulkScope, offerUndo: boolean): Promise<void> {
    const snapshot = this.snapshot();
    if (this.locked() || !snapshot || this.form()) return;
    const version = this.version;
    this.clearUndo();
    this.saving.set(true); this.error.set(''); this.notice.set('Saving…');
    try {
      const result = await this.api.bulk(this.submissionId(), { action, ...scope, revision: snapshot.revision, sourceHash: snapshot.sourceHash, requestId: newRequestId() });
      if (version !== this.version) return;
      this.selectMode.set(false); this.selected.set(new Set());
      await this.reload();
      if (version !== this.version) return;
      const n = result.changedIds.length;
      const label = !n ? 'Nothing to change: they were already in that state.' : action === 'hide' ? `${plural(n, 'correction')} hidden from the student.` : `${plural(n, 'correction')} restored. The student can see them again.`;
      this.notice.set(n && offerUndo ? `${label} Undo is available for a few seconds.` : label);
      if (n) this.saved.emit();
      if (n && offerUndo) {
        this.undo.set({ action: action === 'hide' ? 'restore' : 'hide', ids: result.changedIds, label });
        // Outside the zone: an 8-second timer must not hold the app "unstable" (whenStable, hydration, tests). The signal still re-renders.
        this.undoTimer = this.zone.runOutsideAngular(() => setTimeout(() => { this.undoTimer = null; this.undo.set(null); }, UNDO_MS));
      }
      if (this.historyOpen()) await this.loadHistory(true);
      afterNextRender(() => {
        const trigger = this.trigger;
        (this.host.nativeElement.querySelector<HTMLElement>('[data-bulk-undo] button') || (trigger?.isConnected ? trigger : null)
          || this.host.nativeElement.querySelector<HTMLElement>('[data-list-heading]'))?.focus({ preventScroll: true });
      }, { injector: this.injector });
    } catch (failure) {
      if (version !== this.version) return;
      // Nothing is kept for Retry: the list is reloaded to show the truth, and running the action again is safe (it skips what already changed).
      const { status, code } = this.parseError(failure), described = describeFailure(status, code);
      this.notice.set('');
      this.error.set(described.kind === 'unconfirmed' ? 'We could not confirm this change (connection problem). The latest version is now loaded; check it and try again if needed.' : described.message);
      if (described.kind === 'closed') this.closedByServer.set(true);
      if (described.kind === 'notFound') this.noAccess.set(true);
      else await this.reload();
    } finally {
      if (version === this.version) this.saving.set(false);
    }
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

  toggleWorkspace(): void {
    const opening = !this.workspaceOpen();
    if (!opening) { this.selection.clear(); this.drawn.set(new Map()); }
    this.workspaceOpen.set(opening);
  }
  /** The row's position words, using what the overlay really drew. */
  positionWords(row: CorrectionRow): string[] {
    return positionLabels(withDrawn(this.positions().get(row.key), this.drawn(), row.key));
  }
  onDrawn(event: { key: string; ids: Set<string> }): void { this.drawn.update(map => new Map(map).set(event.key, event.ids)); }

  private rowKeyAt(event: Event): string | null {
    return (event.target as Element | null)?.closest?.('[data-row-key]')?.getAttribute('data-row-key') ?? null;
  }
  private fromList(event: SyncPointer): void { applySyncPointer(this.selection, event, 'list' satisfies SelectionSource); }
  private onListPointerOver(event: PointerEvent): void {
    const key = event.pointerType === 'mouse' ? this.rowKeyAt(event) : null;
    if (key) this.fromList({ ids: [key], kind: 'hover' });
  }
  private onListPointerOut(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && this.rowKeyAt(event)) this.fromList({ ids: [], kind: 'leave' });
  }
  private onListFocus(event: FocusEvent): void {
    if (!(event.target as Element).matches?.(':focus-visible')) return;
    const key = this.rowKeyAt(event);
    if (key) this.fromList({ ids: [key], kind: 'focus' });
  }
  private onListClick(event: MouseEvent): void {
    if ((event.target as Element).closest?.('button, a, input, select, textarea, label')) return;
    const key = this.rowKeyAt(event);
    if (key) this.fromList({ ids: [key], kind: 'activate' });
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

  /** Always from the start: the list may have changed since it was last open. */
  async openHistory(): Promise<void> {
    this.historyOpen.set(true); this.historyItems.set([]); this.historyNext.set(null);
    await this.loadHistory(true);
  }
  /** Called once per close: Escape reaches both this dialog and the bottom sheet's own listener. */
  closeHistory(): void {
    if (!this.historyOpen()) return;
    this.historyRequest++;
    this.historyOpen.set(false); this.historyLoading.set(false); this.historyError.set('');
    afterNextRender(() => this.historyButton()?.nativeElement.focus(), { injector: this.injector });
  }
  /** The page that failed: the first one when nothing is listed yet, otherwise the next one. */
  async retryHistory(): Promise<void> { await this.loadHistory(!this.historyItems().length); }
  async loadHistory(fromStart: boolean): Promise<void> {
    if (!fromStart && this.historyLoading()) return;
    const version = this.version, request = ++this.historyRequest, offset = fromStart ? 0 : this.historyNext() ?? 0;
    const current = () => version === this.version && request === this.historyRequest;
    this.historyLoading.set(true); this.historyError.set('');
    try {
      const page = await this.api.history(this.submissionId(), offset);
      if (!current()) return;
      this.historyItems.update(items => fromStart ? page.items : [...items, ...page.items]);
      this.historyNext.set(page.nextOffset);
    } catch (failure) {
      if (current()) this.showHistoryFailure(failure);
    } finally {
      if (current()) this.historyLoading.set(false);
    }
  }
  private showHistoryFailure(failure: unknown): void {
    const { status, code } = this.parseError(failure);
    const described = describeFailure(status, code);
    if (described.kind === 'notFound') this.noAccess.set(true);
    this.historyError.set(described.kind === 'unconfirmed' ? 'The change history could not be loaded. Check your connection and try again.' : described.message);
  }

  /** The grade check recorded a decision. No score changed, so the page's results are not refreshed and the preview is not reloaded. */
  async onGradeChecked(): Promise<void> {
    await this.reload();
    if (this.historyOpen()) await this.loadHistory(true);
  }
}
