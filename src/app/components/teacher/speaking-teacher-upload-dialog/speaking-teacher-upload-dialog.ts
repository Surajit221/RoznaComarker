import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, type OnChanges, type OnDestroy, Output, type SimpleChanges, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Subscription } from 'rxjs';
import { ClassApiService, type BackendClassStudent } from '../../../api/class-api.service';
import type { TeacherUploadAccount, TeacherUploadItem } from '../../../api/teacher-upload-api.service';
import { SpeakingTeacherUploadApiService } from '../../../api/speaking-teacher-upload-api.service';
import type { SpeakingLimits } from '../../../api/speaking-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { MAX_STUDENTS, SAMPLE_CSV, parseStudentCsv, validateStudentRows, type StudentFieldErrors } from '../upload-student-work/student-input';
import { SpeakingUploadPicker } from '../../student/speaking-upload-picker/speaking-upload-picker';
import { speakingErrorMessage } from '../../../utils/speaking-messages';

export type StudentSource = 'manual' | 'csv' | 'class';
export type DialogStep = 'students' | 'recordings' | 'review' | 'saving' | 'done';
export type SaveState = 'pending' | 'uploading' | 'saved' | 'failed' | 'cancelled';
export interface RecordingEntry {
  id: string; name: string; email: string; errors?: StudentFieldErrors;
  account?: TeacherUploadAccount; existing?: { submissionId: string; pages: number };
  /** The recording as the student upload checks prepared it (neutral name, checked type and size). */
  file: File | null; requestKey: string; state: SaveState; progress: number; error?: string; errorCode?: string; item?: TeacherUploadItem;
}

const UPLOAD_CONCURRENCY = 4;
const UNSAVED_KEY = 'teacher-upload-speaking';
const UNSAVED_MESSAGE = 'You have student recordings that are not saved yet. Leave and discard them?';
const ALREADY_SUBMITTED = 'This student already submitted their own recording for this assignment. Open it from the submissions list.';
const uid = () => crypto.randomUUID();

/**
 * "Upload student recordings" (stage 9): the essay "Upload student work" dialog (upload-student-work-dialog.ts) for a speaking assignment, step
 * for step: students (typed, a CSV file or the class list) checked locally and then by the server; one recording per student, chosen with the
 * student's own recording picker; a review with credits, Save or Save and send; up to four uploads at a time, each with its own reference so a
 * retry never saves twice; results per student. Differences: one recording (a recording already uploaded can only be replaced), and "Save and
 * send" emails class members only (guest speaking results come later). Messages are fixed (utils/speaking-messages), never the server's text.
 */
@Component({
  selector: 'app-speaking-teacher-upload-dialog',
  standalone: true,
  imports: [CommonModule, SpeakingUploadPicker],
  templateUrl: './speaking-teacher-upload-dialog.html',
  styleUrl: './speaking-teacher-upload-dialog.css',
})
export class SpeakingTeacherUploadDialog implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() assignmentId: string | null = null;
  @Input() assignmentTitle = '';
  @Input() classId: string | null = null;
  @Input() limits: SpeakingLimits | null = null;
  /** Closed; `saved` is how many students were saved in this session (the page refreshes when it is above 0). */
  @Output() closed = new EventEmitter<{ saved: number }>();
  @ViewChild('dialogRoot') dialogRoot?: ElementRef<HTMLElement>;
  @ViewChild('heading') heading?: ElementRef<HTMLElement>;

  private api = inject(SpeakingTeacherUploadApiService);
  private classApi = inject(ClassApiService);
  private unsaved = inject(UnsavedWorkRegistry);

  protected readonly Math = Math;
  readonly sampleCsvHref = 'data:text/csv;charset=utf-8,' + encodeURIComponent(SAMPLE_CSV);

  step = signal<DialogStep>('students');
  source = signal<StudentSource>('manual');
  students = signal<RecordingEntry[]>([]);
  formError = signal('');
  checking = signal(false);
  csvSummary = signal('');
  classStudents = signal<BackendClassStudent[] | null>(null);
  classStudentsError = signal('');
  classSearch = signal('');
  classSelected = signal<ReadonlySet<string>>(new Set());
  credits = signal<{ needed: number; available: number } | null>(null);
  confirmingReplace = signal(false);
  sendEmails = signal(false);
  liveMessage = signal('');
  /** The recordings step stays mounted once opened (hidden on other steps) so chosen files survive Back and Next. */
  recordingsOpened = signal(false);
  private batchId = '';
  private running = new Map<string, Subscription>();
  private cancelRequested = false;
  private savedThisSession = 0;
  private returnFocusTo: HTMLElement | null = null;

  readonly creditsShort = computed(() => { const c = this.credits(); return c ? Math.max(0, c.needed - c.available) : 0; });
  readonly replaceCount = computed(() => this.students().filter(s => s.existing).length);
  readonly guestCount = computed(() => this.students().filter(s => s.account === 'guest').length);
  readonly filteredClassStudents = computed(() => {
    const term = this.classSearch().trim().toLowerCase();
    return (this.classStudents() || []).filter(s => !term || s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term));
  });
  readonly listedEmails = computed(() => new Set(this.students().map(s => s.email.trim().toLowerCase())));
  readonly counts = computed(() => {
    const list = this.students();
    return { saved: list.filter(s => s.state === 'saved').length, failed: list.filter(s => s.state === 'failed' || s.state === 'cancelled').length,
      uploading: list.filter(s => s.state === 'uploading' || s.state === 'pending').length };
  });
  readonly recordingsReady = computed(() => this.students().length > 0 && this.students().every(s => !!s.file));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue && !changes['open'].previousValue) this.start();
  }

  ngOnDestroy(): void {
    for (const sub of this.running.values()) sub.unsubscribe();
    this.unsaved.clear(UNSAVED_KEY);
  }

  // ---- Opening, closing, focus (as the essay dialog) ----
  private start(): void {
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.recordingsOpened.set(false);
    this.step.set('students'); this.source.set('manual'); this.students.set([this.blankStudent()]);
    this.formError.set(''); this.csvSummary.set(''); this.credits.set(null); this.confirmingReplace.set(false);
    this.classSelected.set(new Set()); this.classSearch.set(''); this.liveMessage.set('');
    this.batchId = `batch-${uid()}`; this.savedThisSession = 0; this.cancelRequested = false;
    setTimeout(() => this.heading?.nativeElement.focus());
  }

  requestClose(): void {
    if (this.step() === 'saving' && this.counts().uploading > 0) {
      if (!window.confirm('Uploads are still in progress. Stop them and close?')) return;
      this.cancelUploads();
    } else if (this.hasUnsavedWork() && !window.confirm('Discard the student recordings you added? They have not been saved.')) return;
    this.finishClose();
  }

  private finishClose(): void {
    this.unsaved.clear(UNSAVED_KEY);
    this.students.set([]);
    this.recordingsOpened.set(false);
    this.closed.emit({ saved: this.savedThisSession });
    const target = this.returnFocusTo; this.returnFocusTo = null;
    setTimeout(() => target?.focus());
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirmingReplace()) { this.confirmingReplace.set(false); return; }
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab' || !this.dialogRoot) return;
    const focusable = [...this.dialogRoot.nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    const inside = this.dialogRoot.nativeElement.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
  }

  hasUnsavedWork(): boolean {
    return this.students().some(s => s.state !== 'saved' && (s.name.trim() || s.email.trim() || !!s.file));
  }
  private syncUnsaved(): void {
    if (this.hasUnsavedWork()) this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE); else this.unsaved.clear(UNSAVED_KEY);
  }

  // ---- Step 1: students (as the essay dialog) ----
  private blankStudent(name = '', email = ''): RecordingEntry {
    return { id: uid(), name, email, file: null, requestKey: uid(), state: 'pending', progress: 0 };
  }
  private setStudents(next: RecordingEntry[]): void { this.students.set(next); this.syncUnsaved(); }
  private patch(id: string, change: Partial<RecordingEntry> | ((s: RecordingEntry) => Partial<RecordingEntry>)): void {
    this.setStudents(this.students().map(s => s.id === id ? { ...s, ...(typeof change === 'function' ? change(s) : change) } : s));
  }

  addRow(): void {
    if (this.students().length >= MAX_STUDENTS) { this.formError.set(`Add up to ${MAX_STUDENTS} students at a time.`); return; }
    const row = this.blankStudent();
    this.setStudents([...this.students(), row]);
    setTimeout(() => document.getElementById(`student-name-${row.id}`)?.focus());
  }
  updateField(id: string, field: 'name' | 'email', value: string): void {
    this.patch(id, s => ({ [field]: value, account: undefined, existing: undefined,
      errors: s.errors ? { ...s.errors, [field]: undefined, row: undefined } : undefined }));
  }
  removeStudent(id: string): void {
    const removed = this.students().find(s => s.id === id);
    this.setStudents(this.students().filter(s => s.id !== id));
    this.liveMessage.set(removed ? `Removed ${removed.name || 'the row'}.` : '');
  }

  private appendStudents(rows: { name: string; email: string; errors?: StudentFieldErrors }[]): number {
    const current = this.students().filter(s => s.name.trim() || s.email.trim() || s.file);
    const listed = new Set(current.map(s => s.email.trim().toLowerCase()));
    const room = MAX_STUDENTS - current.length;
    const fresh = rows.filter(r => !r.email || !listed.has(r.email.toLowerCase())).slice(0, Math.max(0, room))
      .map(r => ({ ...this.blankStudent(r.name, r.email), ...(r.errors ? { errors: r.errors } : {}) }));
    if (rows.length > fresh.length && room < rows.length) this.formError.set(`Add up to ${MAX_STUDENTS} students at a time.`);
    this.setStudents([...current, ...fresh]);
    return fresh.length;
  }

  async onCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { this.csvSummary.set('This CSV file is too large. Use a file under 1 MB.'); return; }
    let text: string;
    try { text = await file.text(); } catch { this.csvSummary.set('This file could not be read. Save it as CSV (UTF-8) and try again.'); return; }
    const result = parseStudentCsv(text);
    if (!result.rows.length) { this.csvSummary.set('No students were found in this file. Use the columns name,email.'); return; }
    const added = this.appendStudents(result.rows.map(row => ({ name: row.name, email: row.email,
      ...(row.errors ? { errors: { ...row.errors, ...(row.errors.row ? { name: row.errors.row } : {}) } } : {}) })));
    const problems = result.rows.filter(r => r.errors).length;
    this.csvSummary.set([`${added} student${added === 1 ? '' : 's'} added from the file.`,
      problems ? `${problems} row${problems === 1 ? ' needs' : 's need'} fixing below, or remove ${problems === 1 ? 'it' : 'them'}.` : '',
      result.truncated ? 'Only the first 200 rows were read.' : ''].filter(Boolean).join(' '));
    this.liveMessage.set(this.csvSummary());
  }

  async showClassList(): Promise<void> {
    this.source.set('class');
    if (this.classStudents() || !this.classId) return;
    this.classStudentsError.set('');
    try { this.classStudents.set(await this.classApi.getClassStudents(this.classId)); }
    catch { this.classStudentsError.set('The class list could not be loaded. Please try again.'); }
  }
  toggleClassStudent(id: string): void {
    const next = new Set(this.classSelected());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.classSelected.set(next);
  }
  addSelectedClassStudents(): void {
    const chosen = (this.classStudents() || []).filter(s => this.classSelected().has(s.id));
    const added = this.appendStudents(chosen.map(s => ({ name: s.name, email: s.email })));
    this.classSelected.set(new Set());
    this.liveMessage.set(`${added} student${added === 1 ? '' : 's'} added from the class list.`);
  }

  /** Next from step 1: local checks, then the server's (accounts, existing recordings, credits). */
  async checkStudents(): Promise<void> {
    this.formError.set('');
    const list = this.students().filter(s => s.name.trim() || s.email.trim() || s.file);
    if (!list.length) { this.formError.set('Add at least one student.'); return; }
    const local = validateStudentRows(list.map(s => ({ ...s })));
    this.setStudents(local as RecordingEntry[]);
    if (local.some(s => s.errors)) { this.focusFirstError('Fix the highlighted rows, or remove them.'); return; }
    if (!this.assignmentId) return;
    this.checking.set(true);
    try {
      const check = await this.api.check(this.assignmentId, local.map(s => ({ name: s.name, email: s.email })));
      const merged = this.students().map((s, i) => {
        const row = check.students[i];
        // A server row error is shown in fixed words: the only one a valid row can get is "submitted their own recording".
        const errors = row?.errors && Object.keys(row.errors).length ? { email: ALREADY_SUBMITTED } : undefined;
        return { ...s, name: row?.name ?? s.name, email: row?.email ?? s.email, account: row?.account, existing: row?.existing, errors };
      });
      this.setStudents(merged);
      this.credits.set(check.credits);
      if (merged.some(s => s.errors)) { this.focusFirstError('Some students cannot be uploaded. Fix or remove the highlighted rows.'); return; }
      this.goTo('recordings');
    } catch (error) { this.formError.set(this.message(error)); }
    finally { this.checking.set(false); }
  }
  private focusFirstError(message: string): void {
    this.formError.set(message); this.liveMessage.set(message);
    const first = this.students().find(s => s.errors);
    const field = first?.errors?.name || first?.errors?.row ? 'name' : 'email';
    if (first) setTimeout(() => document.getElementById(`student-${field}-${first.id}`)?.focus());
  }

  // ---- Step 2: one recording per student (the student's own recording picker) ----
  setFile(id: string, file: File | null): void { this.patch(id, { file }); }

  // ---- Step 3: review and save ----
  async toReview(): Promise<void> {
    if (!this.recordingsReady()) { this.formError.set('Choose a recording for every student.'); return; }
    this.formError.set('');
    this.goTo('review');
    if (!this.assignmentId) return;
    try { const check = await this.api.check(this.assignmentId, this.students().map(s => ({ name: s.name, email: s.email }))); this.credits.set(check.credits); }
    catch { /* keep the figures from step 1 */ }
  }
  requestSave(send: boolean): void {
    this.sendEmails.set(send);
    if (this.replaceCount() > 0) { this.confirmingReplace.set(true); setTimeout(() => document.getElementById('confirm-replace')?.focus()); return; }
    void this.save();
  }
  confirmReplace(): void { this.confirmingReplace.set(false); void this.save(); }

  async save(): Promise<void> {
    this.cancelRequested = false;
    this.setStudents(this.students().map(s => s.state === 'saved' ? s : { ...s, state: 'pending', progress: 0, error: undefined, errorCode: undefined }));
    this.goTo('saving');
    await this.runQueue();
  }
  retry(id?: string): void {
    this.cancelRequested = false;
    this.setStudents(this.students().map(s => (id ? s.id === id : s.state === 'failed' || s.state === 'cancelled')
      ? { ...s, state: 'pending', progress: 0, error: undefined, errorCode: undefined } : s));
    this.step.set('saving');
    void this.runQueue();
  }

  private async runQueue(): Promise<void> {
    const queue = this.students().filter(s => s.state === 'pending');
    let next = 0;
    const worker = async () => {
      while (!this.cancelRequested && next < queue.length) {
        const entry = queue[next++];
        const current = this.students().find(s => s.id === entry.id);
        if (current?.state === 'pending') await this.uploadOne(current);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
    const { saved, failed } = this.counts();
    this.liveMessage.set(`${saved} saved${failed ? `, ${failed} not saved` : ''}.`);
    if (!this.counts().uploading) this.step.set('done');
  }

  private uploadOne(entry: RecordingEntry): Promise<void> {
    return new Promise(resolve => {
      this.patch(entry.id, { state: 'uploading', progress: 0 });
      const sub = this.api.upload(this.assignmentId!, { name: entry.name, email: entry.email, requestKey: entry.requestKey, batchId: this.batchId,
        mode: entry.existing ? 'replace' : 'new', send: this.sendEmails() && entry.account === 'member', file: entry.file! })
        .subscribe({
          next: event => {
            if (event.type === 'progress') this.patch(entry.id, { progress: event.total ? event.loaded / event.total : 0 });
            else { this.savedThisSession += 1; this.patch(entry.id, { state: 'saved', progress: 1, item: event.result.item }); }
          },
          error: error => {
            const code = error instanceof HttpErrorResponse && typeof error.error?.code === 'string' ? error.error.code : undefined;
            const message = this.message(error);
            this.patch(entry.id, { state: 'failed', error: message, errorCode: code });
            // Without credits the rest would fail the same way: stop and say so instead of uploading them.
            if (code === 'INSUFFICIENT_CREDITS') this.stopQueued(message, code);
          }
        });
      sub.add(() => { this.running.delete(entry.id); resolve(); });
      this.running.set(entry.id, sub);
    });
  }
  private stopQueued(message: string, code?: string): void {
    this.cancelRequested = true;
    this.setStudents(this.students().map(s => s.state === 'pending' ? { ...s, state: 'failed', error: message, errorCode: code } : s));
  }

  cancelUploads(): void {
    this.cancelRequested = true;
    for (const [id, sub] of [...this.running.entries()]) { sub.unsubscribe(); this.patch(id, { state: 'cancelled', error: 'Cancelled.' }); }
    this.setStudents(this.students().map(s => s.state === 'pending' ? { ...s, state: 'cancelled', error: 'Cancelled.' } : s));
    this.liveMessage.set('Uploads stopped.');
    this.step.set('done');
  }

  goTo(step: DialogStep): void {
    this.step.set(step); this.formError.set('');
    if (step === 'recordings') this.recordingsOpened.set(true);
    setTimeout(() => this.heading?.nativeElement.focus());
  }

  private message(error: unknown): string {
    return speakingErrorMessage(error, { maxFileBytes: this.limits?.maxFileBytes, maxRecordingSeconds: this.limits?.maxRecordingSeconds });
  }

  // ---- Template helpers ----
  stepNumber(): number { return ({ students: 1, recordings: 2, review: 3, saving: 3, done: 3 } as const)[this.step()]; }
  stateLabel(s: RecordingEntry): string {
    return ({ pending: 'Waiting', uploading: `Uploading ${Math.round(s.progress * 100)}%`, saved: 'Saved', failed: 'Not saved', cancelled: 'Cancelled' } as const)[s.state];
  }
  isListed(email: string): boolean { return this.listedEmails().has(email.trim().toLowerCase()); }
}
