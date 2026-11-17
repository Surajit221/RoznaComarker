import { CommonModule, DOCUMENT } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, EventEmitter, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, ViewContainerRef,
  afterNextRender, computed, effect, inject, signal, untracked
} from '@angular/core';
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal';
import type { Subscription } from 'rxjs';
import {
  REFERENCE_FILES_OFF, ReferenceFilesApiService, referenceError,
  type ReferenceFileView, type ReferenceFilesConfig, type ReferenceRubricDraft, type ReferenceScope
} from '../../../api/reference-files-api.service';
import { AlertService } from '../../../services/alert.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { RubricDesignerModal } from '../rubric-designer-modal/rubric-designer-modal';
import type { RubricDesigner } from '../../../models/submission-feedback.model';

/** A file chosen on this device and not yet stored: waiting, uploading, or refused by the server (with its reason). */
export interface PendingReferenceFile {
  key: string; file: File; name: string; sizeBytes: number; markedAsRubric: boolean;
  state: 'staged' | 'uploading' | 'failed'; progress: number; error: string | null; requestId: string;
}
export interface ReferenceUploadSummary { uploaded: ReferenceFileView[]; failed: { name: string; message: string }[] }
/** How the rubric step of a save ended: finished (or there was none), skipped by the teacher, or stopped by the time limit. */
export type RubricStepOutcome = 'done' | 'skipped' | 'timeout';

/** The rubric draft is an AI call that can take minutes: the wait shows after a second, and stops after 150 s. */
export const RUBRIC_WAIT_NOTICE_MS = 1000;
export const RUBRIC_DRAFT_TIMEOUT_MS = 150_000;
export const RUBRIC_WAIT_MESSAGE = 'Turning your file into a rubric draft… this can take a minute or two';
export const RUBRIC_DRAFT_TIMEOUT_MESSAGE = "We couldn't prepare the rubric draft in time. You can try again from Edit.";

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.pptx']);
const OLD_POWERPOINT = new Set(['.ppt', '.pps', '.pot']);
const DISMISSED_KEY = 'rubrilo.referenceRubricDismissed';
let nextId = 0;

const extensionOf = (name: string) => { const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(dot).toLowerCase() : ''; };
const requestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${nextId++}`);

/**
 * "Reference files for AI marking" in the class and assignment forms (create and edit). Teacher-only: everything shown comes from the
 * teacher's own device (names of files they chose) or from the backend's teacher responses; never any text from inside a file.
 * Before the class/assignment exists, files wait here and the form calls uploadStaged(newId) after saving.
 */
@Component({
  selector: 'app-reference-files-field',
  standalone: true,
  imports: [CommonModule, RubricDesignerModal],
  templateUrl: './reference-files-field.html',
  styleUrl: './reference-files-field.css',
})
export class ReferenceFilesField implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) scope!: ReferenceScope;
  /** The saved class or assignment; null while creating. */
  @Input() targetId: string | null = null;
  /** The rubric from a file was applied (assignment scope): the form refreshes its rubric display. */
  @Output() rubricApplied = new EventEmitter<void>();

  private api = inject(ReferenceFilesApiService);
  private document = inject(DOCUMENT);
  @ViewChild('reviewTemplate') private reviewTemplate?: TemplateRef<unknown>;
  @ViewChild('reviewAnchor', { read: ViewContainerRef }) private reviewAnchor?: ViewContainerRef;
  /** The rubric review editor lives at the end of <body>, above every dialog (the forms sit in transformed dialog panels). */
  private reviewPortal: DomPortalOutlet | null = null;
  private alert = inject(AlertService);
  private unsaved = inject(UnsavedWorkRegistry);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);
  @ViewChild('skipButton') private skipButton?: ElementRef<HTMLButtonElement>;
  private readonly uid = nextId++;
  readonly ids = { heading: `reference-files-${this.uid}`, help: `reference-files-help-${this.uid}`, input: `reference-files-input-${this.uid}` };
  readonly accept = '.pdf,.doc,.docx,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';

  readonly config = signal<ReferenceFilesConfig>(REFERENCE_FILES_OFF);
  private readonly hiddenByServer = signal(false);
  readonly visible = computed(() => this.config().enabled && !this.hiddenByServer());
  private readonly savedTarget = signal<string | null>(null);
  readonly target = computed(() => this.savedTarget());
  readonly loadState = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  readonly loadError = signal('');
  readonly files = signal<ReferenceFileView[]>([]);
  readonly classFiles = signal<ReferenceFileView[]>([]);
  readonly pending = signal<PendingReferenceFile[]>([]);
  readonly chooseError = signal('');
  readonly announcement = signal('');
  readonly waiting = signal(false);
  readonly drafting = signal<string | null>(null);
  readonly removing = signal<string | null>(null);
  readonly review = signal<{ file: ReferenceFileView; draft: RubricDesigner; hasExisting: boolean } | null>(null);
  readonly reviewSaving = signal(false);

  readonly active = computed(() => this.pending().filter(entry => entry.state !== 'failed'));
  readonly count = computed(() => this.files().length + this.active().length);
  readonly atLimit = computed(() => this.count() >= this.config().maxFiles);
  readonly staged = computed(() => this.pending().filter(entry => entry.state === 'staged'));
  readonly uploading = computed(() => this.pending().some(entry => entry.state === 'uploading'));
  /** Uploading, waiting for files to be read, or saving a reviewed rubric: the dialog around the form must not close from its backdrop. */
  readonly busy = computed(() => this.uploading() || this.waiting() || this.reviewSaving());
  readonly isAssignment = computed(() => this.scope === 'assignment');
  /** The rubric draft has taken more than a second. */
  private readonly draftSlow = signal(false);
  /** The form's save is waiting on the rubric step (runRubricStep). */
  private readonly savingStep = signal(false);
  /** A save is waiting on a slow rubric draft: the field shows the wait with Skip, and the form's Submit reads "Saving…". */
  readonly rubricWait = computed(() => this.savingStep() && this.drafting() !== null && this.draftSlow());

  private uploads = new Map<string, Subscription>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollStarted = 0;
  /** Files this teacher watched being read here: only they may prompt about a rubric on their own. */
  private watched = new Set<string>();
  private handled = new Set<string>();
  private stopWaitingNow: (() => void) | null = null;
  private reviewDone: (() => void) | null = null;
  private destroyed = false;
  /** The rubric draft in flight: aborting cancels the request, stop() ends the wait at once (Skip, time limit, form closed). */
  private activeDraft: { abort: AbortController; stop: () => void } | null = null;
  private lastDraftFileId: string | null = null;
  private stepOutcome: RubricStepOutcome = 'done';
  private waitShown = false;

  constructor() {
    // Focus follows the rubric wait: to Skip when it appears; when it goes, to the file's "Use as rubric" button if focus was left nowhere.
    effect(() => {
      const shown = this.rubricWait();
      untracked(() => {
        if (shown) {
          this.waitShown = true;
          this.announcement.set(RUBRIC_WAIT_MESSAGE);
          afterNextRender(() => this.skipButton?.nativeElement.focus(), { injector: this.injector });
        } else if (this.waitShown) {
          this.waitShown = false;
          afterNextRender(() => this.focusAfterWait(), { injector: this.injector });
        }
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.config.set(await this.api.config());
    if (this.config().enabled && this.savedTarget()) await this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['targetId'] && this.targetId !== this.savedTarget()) {
      this.savedTarget.set(this.targetId);
      this.files.set([]); this.classFiles.set([]);
      if (this.targetId && this.config().enabled) void this.reload();
    }
  }

  ngAfterViewInit(): void {
    if (this.scope !== 'assignment' || !this.reviewTemplate || !this.reviewAnchor) return;
    // Its own element: DomPortalOutlet.dispose() removes the outlet element itself (never use <body> as the outlet).
    const host = this.document.createElement('div');
    host.className = 'reference-files-review-host';
    this.document.body.appendChild(host);
    this.reviewPortal = new DomPortalOutlet(host);
    this.reviewPortal.attachTemplatePortal(new TemplatePortal(this.reviewTemplate, this.reviewAnchor));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopDraft('closed');
    this.reviewPortal?.dispose();
    for (const subscription of this.uploads.values()) subscription.unsubscribe();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.stopWaitingNow?.();
    this.reviewDone?.();
    this.unsaved.clear(this.unsavedKey);
  }

  private get unsavedKey() { return `reference-files-${this.uid}`; }
  private syncUnsaved(): void {
    if (this.active().length) this.unsaved.register(this.unsavedKey, 'Some reference files have not been uploaded yet. Leave and discard them?');
    else this.unsaved.clear(this.unsavedKey);
  }

  /** Files waiting to be uploaded (the form uploads them after saving). */
  hasStaged(): boolean { return this.visible() && this.staged().length > 0; }

  kindLabel(file: { kind?: string; name?: string }): string {
    const kind = file.kind || extensionOf(file.name || '').slice(1);
    return kind === 'pdf' ? 'PDF' : kind === 'pptx' ? 'PowerPoint' : 'Word';
  }
  sizeLabel(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return bytes >= 1024 * 1024 ? `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  limitMessage(): string { return `You can add up to ${this.config().maxFiles} files to each ${this.scope}. Remove one to add another.`; }

  async reload(): Promise<void> {
    const target = this.savedTarget();
    if (!target) return;
    this.loadState.set(this.files().length ? 'loaded' : 'loading');
    try {
      this.applyList(await this.api.list(this.scope, target));
      this.loadState.set('loaded');
    } catch (error) {
      const problem = referenceError(error);
      // 404: the feature was switched off, or this class/assignment is not one the feature applies to. Hide quietly.
      if (problem.status === 404) { this.hiddenByServer.set(true); this.loadState.set('idle'); return; }
      this.loadError.set(problem.message);
      this.loadState.set('error');
    }
  }

  private applyList(list: { files: ReferenceFileView[]; classFiles?: ReferenceFileView[] }): void {
    for (const file of list.files) if (file.status === 'processing') this.watched.add(file.id);
    this.files.set(list.files);
    this.classFiles.set(list.classFiles ?? []);
    this.schedulePoll();
    this.notifyWaiting();
    void this.offerRubric();
  }

  /** While a file is being read, refresh every 2 s for half a minute, then every 5 s. */
  private schedulePoll(): void {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    if (this.destroyed || !this.files().some(file => file.status === 'processing')) { this.pollStarted = 0; return; }
    if (!this.pollStarted) this.pollStarted = Date.now();
    this.pollTimer = setTimeout(() => { this.pollTimer = null; void this.reload(); }, Date.now() - this.pollStarted < 30000 ? 2000 : 5000);
  }

  onChoose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files || []);
    input.value = '';
    this.addFiles(chosen);
  }

  addFiles(chosen: File[]): void {
    const problems: string[] = [];
    const accepted: PendingReferenceFile[] = [];
    let room = this.config().maxFiles - this.count();
    for (const file of chosen) {
      const extension = extensionOf(file.name);
      if (OLD_POWERPOINT.has(extension)) problems.push(`${file.name}: Old PowerPoint files (.ppt) are not supported. Please save as .pptx.`);
      else if (!ALLOWED.has(extension)) problems.push(`${file.name}: Please use PDF, Word (.doc or .docx) or PowerPoint (.pptx).`);
      else if (file.size === 0) problems.push(`${file.name}: This file is empty.`);
      else if (file.size > this.config().maxFileBytes) problems.push(`${file.name}: Each file must be ${Math.round(this.config().maxFileBytes / (1024 * 1024))} MB or smaller.`);
      else if (room <= 0) { problems.push(this.limitMessage()); break; }
      else {
        room -= 1;
        accepted.push({ key: `p${nextId++}`, file, name: file.name, sizeBytes: file.size, markedAsRubric: false, state: 'staged', progress: 0, error: null, requestId: requestId() });
      }
    }
    this.chooseError.set(problems.join(' '));
    if (accepted.length) {
      this.pending.update(list => [...list, ...accepted]);
      this.announcement.set(`${accepted.length} ${accepted.length === 1 ? 'file' : 'files'} added. ${this.savedTarget() ? 'Choose Upload now, or save the form.' : 'They upload when you save.'}`);
    }
    this.syncUnsaved();
  }

  setRubricTick(key: string, checked: boolean): void {
    this.pending.update(list => list.map(entry => (entry.key === key ? { ...entry, markedAsRubric: checked } : entry)));
  }

  /** Removes a file that is not stored yet (cancels its upload if it is running). */
  discardPending(key: string): void {
    this.uploads.get(key)?.unsubscribe();
    this.uploads.delete(key);
    const entry = this.pending().find(item => item.key === key);
    this.pending.update(list => list.filter(item => item.key !== key));
    if (entry) this.announcement.set(`${entry.name} removed.`);
    this.syncUnsaved();
  }

  /** "Upload now" in edit mode. */
  async uploadNow(): Promise<void> {
    const target = this.savedTarget();
    if (target) await this.uploadStaged(target);
  }

  /** Uploads every waiting file to the saved class/assignment, one at a time. Refused files stay listed with the server's reason. */
  async uploadStaged(targetId: string): Promise<ReferenceUploadSummary> {
    const summary: ReferenceUploadSummary = { uploaded: [], failed: [] };
    if (!this.visible()) return summary;
    if (this.savedTarget() !== targetId) this.savedTarget.set(targetId);
    for (const entry of this.staged()) {
      const result = await this.uploadOne(entry, targetId);
      if (result.file) summary.uploaded.push(result.file); else summary.failed.push({ name: entry.name, message: result.error || '' });
    }
    if (summary.uploaded.length) await this.reload();
    this.syncUnsaved();
    return summary;
  }

  private uploadOne(entry: PendingReferenceFile, targetId: string): Promise<{ file?: ReferenceFileView; error?: string }> {
    const update = (patch: Partial<PendingReferenceFile>) => this.pending.update(list => list.map(item => (item.key === entry.key ? { ...item, ...patch } : item)));
    update({ state: 'uploading', progress: 0, error: null });
    return new Promise(resolve => {
      const subscription = this.api.upload(this.scope, targetId, { file: entry.file, requestId: entry.requestId, markedAsRubric: entry.markedAsRubric }).subscribe({
        next: event => {
          if (event.type === 'progress') { update({ progress: event.total ? Math.min(99, Math.round((event.loaded / event.total) * 100)) : 0 }); return; }
          this.uploads.delete(entry.key);
          this.pending.update(list => list.filter(item => item.key !== entry.key));
          this.watched.add(event.file.id);
          this.files.update(list => [...list.filter(file => file.id !== event.file.id), event.file]);
          this.announcement.set(`${entry.name} uploaded. Reading the file…`);
          this.schedulePoll();
          resolve({ file: event.file });
        },
        error: error => {
          this.uploads.delete(entry.key);
          const message = referenceError(error).message;
          update({ state: 'failed', progress: 0, error: message });
          this.announcement.set(`${entry.name} was not added. ${message}`);
          resolve({ error: message });
        }
      });
      this.uploads.set(entry.key, subscription);
    });
  }

  async removeFile(file: ReferenceFileView): Promise<void> {
    const confirmed = await this.alert.showConfirm('Remove this file?', `"${file.name}" will no longer be used for marking.`, 'Remove', 'Cancel');
    if (!confirmed) return;
    this.removing.set(file.id);
    try {
      await this.api.remove(file.id);
      this.files.update(list => list.filter(item => item.id !== file.id));
      this.announcement.set(`${file.name} removed.`);
    } catch (error) {
      this.alert.showError('File not removed', referenceError(error).message);
    } finally { this.removing.set(null); }
  }

  /** Assignment create flow: waits (at most timeoutMs, or until the teacher continues) for uploaded files to be read. */
  waitUntilRead(timeoutMs = 60000): Promise<void> {
    if (!this.files().some(file => file.status === 'processing')) return Promise.resolve();
    this.waiting.set(true);
    return new Promise(resolve => {
      const timer = setTimeout(() => finish(), timeoutMs);
      const finish = () => { clearTimeout(timer); this.waiting.set(false); this.stopWaitingNow = null; resolve(); };
      this.stopWaitingNow = finish;
    });
  }
  stopWaiting(): void { this.stopWaitingNow?.(); }
  private notifyWaiting(): void { if (this.waiting() && !this.files().some(file => file.status === 'processing')) this.stopWaitingNow?.(); }

  /**
   * Assignment create flow: offers the rubric step for a file read just now; resolves when that step is finished (or there is none).
   * A step the background refresh already started (question or review open) is waited for, not skipped.
   */
  async runRubricStep(): Promise<RubricStepOutcome> {
    this.stepOutcome = 'done';
    this.savingStep.set(true);
    try {
      // Skip or the time limit ends the step: no further file is offered, the save goes on.
      while (this.rubricFlow && this.stepOutcome === 'done') await this.rubricFlow;
      if (this.stepOutcome === 'done') await this.offerRubric();
      return this.stepOutcome;
    } finally { this.savingStep.set(false); }
  }

  /** "Skip, I'll do it later": stops waiting for the rubric draft; the file keeps "Use as rubric" for later. */
  skipRubricStep(): void { this.stopDraft('skipped'); }

  private dismissed(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); }
  }
  private remember(id: string): void {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...this.dismissed(), id].slice(-200))); } catch { /* this session only */ }
  }

  /**
   * After a watched assignment file is read: ticked "This file is a rubric" opens the review straight away; a file that looks like a rubric
   * asks first. One file at a time; a "No" is remembered on this device.
   */
  private offerRubric(): Promise<void> {
    if (!this.isAssignment() || this.rubricFlow) return this.rubricFlow ?? Promise.resolve();
    const dismissed = this.dismissed();
    const next = this.files().find(file => file.status === 'ready' && !file.rubricAppliedAt && this.watched.has(file.id) && !this.handled.has(file.id)
      && !dismissed.has(file.id) && (file.markedAsRubric || file.rubricSuggestion?.looksLikeRubric));
    if (!next) return Promise.resolve();
    this.handled.add(next.id);
    return this.track(async () => {
      if (!next.markedAsRubric) {
        const yes = await this.alert.showConfirm('This file looks like a rubric. Use it as the main rubric?',
          `"${next.name}" looks like a rubric. If you choose Yes, you can review and edit it before it is used.`, 'Yes', 'No');
        if (!yes) { this.remember(next.id); return; }
      }
      await this.reviewFile(next);
    });
  }

  /** The rubric step in progress (question, draft or review), so a save flow waits for it instead of closing the form under it. */
  private rubricFlow: Promise<void> | null = null;
  private track(step: () => Promise<void>): Promise<void> {
    const flow = step().finally(() => { if (this.rubricFlow === flow) this.rubricFlow = null; });
    this.rubricFlow = flow;
    return flow;
  }

  /** "Use as rubric": drafts the rubric (free) and opens the rubric editor to review it. Resolves when the review is closed. */
  startReview(file: ReferenceFileView): Promise<void> {
    if (this.rubricFlow) return this.rubricFlow;
    return this.track(() => this.reviewFile(file));
  }

  private async reviewFile(file: ReferenceFileView): Promise<void> {
    if (this.drafting() || this.review()) return;
    const draft = await this.fetchDraft(file);
    if (!draft) return;
    this.review.set({ file, draft: draft.rubricDesigner, hasExisting: draft.hasExistingRubric });
    if (draft.notes.includes('WEIGHTS_SET_EQUALLY')) this.announcement.set('The criteria weights were set equally. Check them before you apply the rubric.');
    await new Promise<void>(resolve => { this.reviewDone = resolve; });
  }

  /**
   * The rubric draft for a file, or null when it failed (reported here), was skipped, ran out of time, or the field closed. Those three end
   * the wait at once and cancel the request; an answer that arrives after that is ignored.
   */
  private async fetchDraft(file: ReferenceFileView): Promise<ReferenceRubricDraft | null> {
    const abort = new AbortController();
    let stop!: () => void;
    const stopped = new Promise<null>(resolve => { stop = () => resolve(null); });
    this.activeDraft = { abort, stop };
    this.lastDraftFileId = file.id;
    this.drafting.set(file.id);
    const notice = setTimeout(() => this.draftSlow.set(true), RUBRIC_WAIT_NOTICE_MS);
    const limit = setTimeout(() => this.stopDraft('timeout'), RUBRIC_DRAFT_TIMEOUT_MS);
    const request = this.api.draftRubric(file.id, abort.signal).then(draft => ({ draft }), (error: unknown) => ({ error }));
    const answer = await Promise.race([request, stopped]);
    clearTimeout(notice); clearTimeout(limit);
    if (!answer) return null;                                    // stopped: stopDraft has already cleaned up
    this.activeDraft = null;
    this.endDraft();
    if ('error' in answer) {
      this.alert.showError('This file could not be used as a rubric', referenceError(answer.error).message);
      return null;
    }
    return answer.draft;
  }

  private endDraft(): void { this.drafting.set(null); this.draftSlow.set(false); }

  /** Ends the wait for the draft in flight. During a save the form reports the outcome; otherwise a time limit is reported here. */
  private stopDraft(reason: 'skipped' | 'timeout' | 'closed'): void {
    const active = this.activeDraft;
    if (!active) return;
    this.activeDraft = null;
    active.abort.abort();
    active.stop();
    this.endDraft();
    if (this.savingStep()) this.stepOutcome = reason === 'timeout' ? 'timeout' : 'skipped';
    else if (reason === 'timeout') this.alert.showWarning('Rubric draft not ready', RUBRIC_DRAFT_TIMEOUT_MESSAGE);
  }

  /** After the wait: focus that was on Skip (now gone) goes to the file's "Use as rubric" button, or Add files. The review editor keeps its own. */
  private focusAfterWait(): void {
    if (this.destroyed || this.review()) return;
    const active = this.document.activeElement;
    if (active && active !== this.document.body) return;
    const root = this.host.nativeElement;
    const fileId = this.lastDraftFileId;
    const use = fileId ? Array.from(root.querySelectorAll<HTMLButtonElement>('[data-file] [data-use-rubric]'))
      .find(button => button.closest('[data-file]')?.getAttribute('data-file') === fileId && !button.disabled) : undefined;
    (use ?? root.querySelector<HTMLButtonElement>('[data-add]:not(:disabled)'))?.focus();
  }

  closeReview(): void {
    this.review.set(null);
    const done = this.reviewDone; this.reviewDone = null; done?.();
  }

  async applyReviewed(designer: RubricDesigner): Promise<void> {
    const current = this.review();
    if (!current || this.reviewSaving()) return;
    let replace = current.hasExisting;
    if (replace && !(await this.confirmReplace(current.file.name))) return;
    this.reviewSaving.set(true);
    try {
      try { await this.api.applyRubric(current.file.id, designer, replace); } catch (error) {
        // Someone added a rubric meanwhile: ask before replacing it.
        if (referenceError(error).code !== 'REFERENCE_RUBRIC_EXISTS' || replace || !(await this.confirmReplace(current.file.name))) throw error;
        replace = true;
        await this.api.applyRubric(current.file.id, designer, true);
      }
      this.alert.showToast(replace ? 'Rubric replaced' : 'Rubric applied', 'success');
      this.files.update(list => list.map(file => (file.id === current.file.id ? { ...file, rubricAppliedAt: new Date().toISOString() } : file)));
      this.closeReview();
      this.rubricApplied.emit();
    } catch (error) {
      this.alert.showError('Rubric not applied', referenceError(error).message);
    } finally { this.reviewSaving.set(false); }
  }

  private confirmReplace(name: string): Promise<boolean> {
    return this.alert.showConfirm('Replace the current rubric?', `This assignment already has a rubric. Replace it with the rubric from "${name}"?`, 'Replace', 'Cancel');
  }

  statusLabel(file: ReferenceFileView): string {
    return file.status === 'processing' ? 'Reading…' : file.status === 'ready' ? 'Ready' : 'Not usable';
  }
}
