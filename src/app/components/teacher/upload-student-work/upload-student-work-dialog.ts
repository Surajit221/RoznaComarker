import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChild, ViewChildren, computed, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import { ClassApiService, type BackendClassStudent } from '../../../api/class-api.service';
import { TeacherUploadApiService, friendlyError, type TeacherUploadAccount, type TeacherUploadItem, type TeacherUploadMode } from '../../../api/teacher-upload-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { MAX_STUDENTS, SAMPLE_CSV, parseStudentCsv, validateStudentRows, type StudentFieldErrors } from './student-input';
import { TeacherStudentPages } from './teacher-student-pages';

export type StudentSource = 'manual' | 'csv' | 'class';
export type DialogStep = 'students' | 'pages' | 'review' | 'saving' | 'done';
export type SaveState = 'pending' | 'uploading' | 'saved' | 'failed' | 'cancelled';
export interface StudentEntry {
  id: string; name: string; email: string; errors?: StudentFieldErrors;
  account?: TeacherUploadAccount; existing?: { submissionId: string; pages: number };
  /** The pages exactly as the student upload screen prepared them (cropped, compressed), and whether every page passed its check. */
  mode: TeacherUploadMode; files: File[]; pagesReady: boolean;
  requestKey: string; state: SaveState; progress: number; error?: string; errorCode?: string; item?: TeacherUploadItem;
}

const UPLOAD_CONCURRENCY = 4;
const RECHECK_CODE = 'TEACHER_UPLOAD_RECHECK_REQUIRED';
const UNSAVED_KEY = 'teacher-upload-student-work';
const UNSAVED_MESSAGE = 'You have student work that is not saved yet. Leave and discard it?';
const uid = () => crypto.randomUUID();

@Component({
  selector: 'app-upload-student-work-dialog',
  standalone: true,
  imports: [CommonModule, TeacherStudentPages],
  templateUrl: './upload-student-work-dialog.html',
  styleUrl: './upload-student-work-dialog.css',
})
export class UploadStudentWorkDialog implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() assignmentId: string | null = null;
  @Input() assignmentTitle = '';
  @Input() classId: string | null = null;
  /** Closed; `saved` is how many students were saved in this session (the page refreshes when it is above 0). */
  @Output() closed = new EventEmitter<{ saved: number }>();
  @ViewChild('dialogRoot') dialogRoot?: ElementRef<HTMLElement>;
  @ViewChild('heading') heading?: ElementRef<HTMLElement>;
  @ViewChildren(TeacherStudentPages) pageForms?: QueryList<TeacherStudentPages>;

  private api = inject(TeacherUploadApiService);
  private classApi = inject(ClassApiService);
  private unsaved = inject(UnsavedWorkRegistry);

  protected readonly Math = Math;
  readonly sampleCsvHref = 'data:text/csv;charset=utf-8,' + encodeURIComponent(SAMPLE_CSV);

  step = signal<DialogStep>('students');
  source = signal<StudentSource>('manual');
  students = signal<StudentEntry[]>([]);
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
  /** The pages step stays mounted once opened (hidden on other steps) so crops and checks survive Back and Next. */
  pagesOpened = signal(false);
  private batchId = '';
  private running = new Map<string, Subscription>();
  private cancelRequested = false;
  private savedThisSession = 0;
  private returnFocusTo: HTMLElement | null = null;

  readonly validStudents = computed(() => this.students().filter(s => !s.errors));
  readonly creditsShort = computed(() => { const c = this.credits(); return c ? Math.max(0, c.needed - c.available) : 0; });
  readonly replaceCount = computed(() => this.students().filter(s => s.existing && s.mode === 'replace').length);
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
  readonly pagesReady = computed(() => this.students().length > 0 && this.students().every(s => s.files.length > 0 && s.pagesReady));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue && !changes['open'].previousValue) this.start();
  }

  ngOnDestroy(): void {
    for (const sub of this.running.values()) sub.unsubscribe();
    this.unsaved.clear(UNSAVED_KEY);
  }

  // ---- Opening, closing, focus ----
  private start(): void {
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.pagesOpened.set(false);
    this.step.set('students'); this.source.set('manual'); this.students.set([this.blankStudent()]);
    this.formError.set(''); this.csvSummary.set(''); this.credits.set(null); this.confirmingReplace.set(false);
    this.classSelected.set(new Set()); this.classSearch.set(''); this.liveMessage.set('');
    this.batchId = `batch-${uid()}`; this.savedThisSession = 0; this.cancelRequested = false;
    setTimeout(() => this.heading?.nativeElement.focus());
  }

  /** Close by X, Cancel, Done or Esc. Asks before discarding unsaved work or stopping uploads. */
  requestClose(): void {
    if (this.step() === 'saving' && this.counts().uploading > 0) {
      if (!window.confirm('Uploads are still in progress. Stop them and close?')) return;
      this.cancelUploads();
    } else if (this.hasUnsavedWork() && !window.confirm('Discard the student work you added? It has not been saved.')) return;
    this.finishClose();
  }

  private finishClose(): void {
    this.unsaved.clear(UNSAVED_KEY);
    this.students.set([]);
    this.pagesOpened.set(false);
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
    return this.students().some(s => s.state !== 'saved' && (s.name.trim() || s.email.trim() || s.files.length));
  }
  private syncUnsaved(): void {
    if (this.hasUnsavedWork()) this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE); else this.unsaved.clear(UNSAVED_KEY);
  }

  // ---- Step 1: students ----
  private blankStudent(name = '', email = ''): StudentEntry {
    return { id: uid(), name, email, mode: 'new', files: [], pagesReady: false, requestKey: uid(), state: 'pending', progress: 0 };
  }
  private setStudents(next: StudentEntry[]): void { this.students.set(next); this.syncUnsaved(); }
  private patch(id: string, change: Partial<StudentEntry> | ((s: StudentEntry) => Partial<StudentEntry>)): void {
    this.setStudents(this.students().map(s => s.id === id ? { ...s, ...(typeof change === 'function' ? change(s) : change) } : s));
  }

  addRow(): void {
    if (this.students().length >= MAX_STUDENTS) { this.formError.set(`Add up to ${MAX_STUDENTS} students at a time.`); return; }
    const row = this.blankStudent();
    this.setStudents([...this.students(), row]);
    setTimeout(() => document.getElementById(`student-name-${row.id}`)?.focus());
  }
  updateField(id: string, field: 'name' | 'email', value: string): void {
    // Editing a row clears the server's verdict on it; it is checked again on Next.
    this.patch(id, s => ({ [field]: value, account: undefined, existing: undefined,
      errors: s.errors ? { ...s.errors, [field]: undefined, row: undefined } : undefined }));
  }
  removeStudent(id: string): void {
    const removed = this.students().find(s => s.id === id);
    const next = this.students().filter(s => s.id !== id);
    this.setStudents(next);
    this.liveMessage.set(removed ? `Removed ${removed.name || 'the row'}.` : '');
  }

  /** Appends students, skipping emails already listed and replacing the starting empty row. */
  private appendStudents(rows: { name: string; email: string; errors?: StudentFieldErrors }[]): number {
    const current = this.students().filter(s => s.name.trim() || s.email.trim() || s.files.length);
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
    catch (error) { this.classStudentsError.set(friendlyError(error).message); }
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

  /** Next from step 1: local checks, then the server's (accounts, existing uploads, credits). */
  async checkStudents(): Promise<void> {
    this.formError.set('');
    const list = this.students().filter(s => s.name.trim() || s.email.trim() || s.files.length);
    if (!list.length) { this.formError.set('Add at least one student.'); return; }
    const local = validateStudentRows(list.map(s => ({ ...s })));
    this.setStudents(local as StudentEntry[]);
    if (local.some(s => s.errors)) { this.focusFirstError('Fix the highlighted rows, or remove them.'); return; }
    if (!this.assignmentId) return;
    this.checking.set(true);
    try {
      const check = await this.api.check(this.assignmentId, local.map(s => ({ name: s.name, email: s.email })));
      const merged = this.students().map((s, i) => {
        const row = check.students[i];
        return { ...s, name: row?.name ?? s.name, email: row?.email ?? s.email, account: row?.account, existing: row?.existing,
          mode: row?.existing ? (s.mode === 'new' ? 'add_pages' : s.mode) : 'new' as TeacherUploadMode,
          errors: row?.errors && Object.keys(row.errors).length ? row.errors : undefined };
      });
      this.setStudents(merged);
      this.credits.set(check.credits);
      if (merged.some(s => s.errors)) { this.focusFirstError('Some students cannot be uploaded. Fix or remove the highlighted rows.'); return; }
      this.goTo('pages');
    } catch (error) { this.formError.set(friendlyError(error).message); }
    finally { this.checking.set(false); }
  }
  private focusFirstError(message: string): void {
    this.formError.set(message); this.liveMessage.set(message);
    const first = this.students().find(s => s.errors);
    const field = first?.errors?.name || first?.errors?.row ? 'name' : 'email';
    if (first) setTimeout(() => document.getElementById(`student-${field}-${first.id}`)?.focus());
  }

  // ---- Step 2: pages (the student upload screen, one per student) ----
  setFiles(id: string, files: File[]): void { this.patch(id, { files: [...files] }); }
  setPagesReady(id: string, ready: boolean): void { this.patch(id, { pagesReady: ready }); }
  /** The server said this student's check is out of date: open their pages and check every page again. */
  recheckPages(id: string): void {
    this.patch(id, { state: 'pending', error: undefined, errorCode: undefined, pagesReady: false });
    this.goTo('pages');
    this.pageForms?.find(form => form.studentId === id)?.recheck();
    setTimeout(() => document.getElementById(`pages-${id}`)?.scrollIntoView({ block: 'start' }));
  }
  setMode(id: string, mode: TeacherUploadMode): void { this.patch(id, { mode }); }

  // ---- Step 3: review and save ----
  async toReview(): Promise<void> {
    if (!this.pagesReady()) { this.formError.set('Add pages for every student and wait until every page has passed its check.'); return; }
    this.formError.set('');
    this.goTo('review');
    // Fresh credits: they may have changed since step 1.
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

  private uploadOne(entry: StudentEntry): Promise<void> {
    return new Promise(resolve => {
      this.patch(entry.id, { state: 'uploading', progress: 0 });
      const sub = this.api.upload(this.assignmentId!, { name: entry.name, email: entry.email, requestKey: entry.requestKey, batchId: this.batchId,
        mode: entry.existing ? entry.mode : 'new', send: this.sendEmails(), files: entry.files.map(file => ({ blob: file, name: file.name })) })
        .subscribe({
          next: event => {
            if (event.type === 'progress') this.patch(entry.id, { progress: event.total ? event.loaded / event.total : 0 });
            else { this.savedThisSession += 1; this.patch(entry.id, { state: 'saved', progress: 1, item: event.result.item }); }
          },
          error: error => {
            const friendly = friendlyError(error);
            this.patch(entry.id, { state: 'failed', error: friendly.message, errorCode: friendly.code });
            // Without credits the rest would fail the same way: stop and say so instead of uploading them.
            if (friendly.code === 'INSUFFICIENT_CREDITS') this.stopQueued(friendly.message, friendly.code);
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

  /** Stops the uploads in progress and the ones not started. A retry uses the same reference, so nothing is saved twice. */
  cancelUploads(): void {
    this.cancelRequested = true;
    for (const [id, sub] of [...this.running.entries()]) { sub.unsubscribe(); this.patch(id, { state: 'cancelled', error: 'Cancelled.' }); }
    this.setStudents(this.students().map(s => s.state === 'pending' ? { ...s, state: 'cancelled', error: 'Cancelled.' } : s));
    this.liveMessage.set('Uploads stopped.');
    this.step.set('done');
  }

  goTo(step: DialogStep): void {
    this.step.set(step); this.formError.set('');
    if (step === 'pages') this.pagesOpened.set(true);
    setTimeout(() => this.heading?.nativeElement.focus());
  }
  readonly recheckCode = RECHECK_CODE;

  // ---- Template helpers ----
  stepNumber(): number { return ({ students: 1, pages: 2, review: 3, saving: 3, done: 3 } as const)[this.step()]; }
  stateLabel(s: StudentEntry): string {
    return ({ pending: 'Waiting', uploading: `Uploading ${Math.round(s.progress * 100)}%`, saved: 'Saved', failed: 'Not saved', cancelled: 'Cancelled' } as const)[s.state];
  }
  isListed(email: string): boolean { return this.listedEmails().has(email.trim().toLowerCase()); }
}
