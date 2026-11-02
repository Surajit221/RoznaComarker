import { HttpErrorResponse } from '@angular/common/http';
import { Component, ChangeDetectionStrategy, ElementRef, Injectable, afterNextRender, effect, inject, Injector, input, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { FeedbackApiService } from '../../../api/feedback-api.service';
import { SubmissionApiService } from '../../../api/submission-api.service';
import { type StudentPreviewPayload, TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import { DEFAULT_CORRECTION_LEGEND } from '../../../constants/correction-legend.default';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { MySubmissionPage } from '../../../pages/students/my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { CanonicalSubmissionResultCoordinator } from '../../../services/canonical-submission-result-coordinator.service';
import { STUDENT_RESULT_PREVIEW } from '../../../services/student-result-preview';

/** The fields a guest's own presentation response has: a guest preview gets exactly these, so nothing teacher-side reaches the page. */
const GUEST_SUBMISSION_FIELDS = ['_id', 'submittedAt', 'status', 'isLate', 'draftNumber', 'ocrJobId', 'transcriptText', 'combinedOcrText', 'ocrText', 'ocrStatus', 'correctionStatus', 'semanticStatus',
  'evaluationStatus', 'assessmentStatus', 'assessmentCompletedAt', 'correctionSourceHash', 'evaluationSourceHash', 'transcriptLayoutVersion', 'correctionStatistics', 'files', 'file', 'fileUrls', 'fileUrl', 'ocrPages', 'sourceFidelity', 'submissionMode'];

const idOf = (value: unknown): string => String((value as { _id?: unknown })?._id ?? value ?? '');
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** The submission as the student's own request returns it. Corrections come only from the preview payload, never from the teacher's copy. */
export function studentSubmissionCopy(submission: Record<string, unknown>, audience: 'student' | 'guest'): Record<string, unknown> {
  const copy: Record<string, unknown> = clone(submission);
  delete copy['writingCorrections']; delete copy['teacherAnnotations']; delete copy['guest'];
  if (audience === 'student') return copy;
  const picked = Object.fromEntries(GUEST_SUBMISSION_FIELDS.filter(key => copy[key] !== undefined).map(key => [key, copy[key]]));
  return { ...picked, assignment: idOf(submission['assignment']), class: idOf(submission['class']) };
}

/** What one opening of the preview shows. */
@Injectable()
export class StudentPreviewStore {
  payload: StudentPreviewPayload | null = null;
  submission: Record<string, unknown> | null = null;
  assignment: unknown = null;
  classSummary: unknown = null;
  legend: unknown = null;
  private result<T>(status: number | undefined, data: T): T {
    if (status !== undefined && status >= 400) throw { status };
    return clone(data);
  }
  /** Exactly the body of the student's request: { success, data }. */
  ocrResponse(): unknown { return { success: true, data: this.result(this.payload?.ocrCorrectionsStatus, this.payload?.ocrCorrections) }; }
  feedback(): unknown { return this.result(this.payload?.feedbackStatus, this.payload?.feedback); }
}

/**
 * The real student result page, on preview data: the same swap of its API services the guest result page uses, so there is one
 * rendering and filtering path. Every service here only reads the store; none can write. Its own coordinator keeps the teacher page's
 * polling running.
 */
@Component({
  selector: 'app-student-preview-frame',
  imports: [MySubmissionPage],
  template: '<app-my-submission-page />',
  providers: [
    CanonicalSubmissionResultCoordinator,
    { provide: STUDENT_RESULT_PREVIEW, useFactory: () => { const store = inject(StudentPreviewStore); return { ocrResponse: async () => store.ocrResponse() }; } },
    { provide: SubmissionApiService, useFactory: () => { const store = inject(StudentPreviewStore); return {
      getMySubmissionByAssignmentId: async () => clone(store.submission), getMySubmissions: async () => [clone(store.submission)] }; } },
    { provide: FeedbackApiService, useFactory: () => { const store = inject(StudentPreviewStore); return { getSubmissionFeedback: async () => store.feedback() }; } },
    { provide: AssignmentApiService, useFactory: () => { const store = inject(StudentPreviewStore); return { getAssignmentById: async () => {
      if (!store.assignment) throw { status: 404 };
      return clone(store.assignment); } }; } },
    { provide: ClassApiService, useFactory: () => { const store = inject(StudentPreviewStore); return { getClassSummary: async () => {
      if (!store.classSummary) throw { status: 404 };
      return clone(store.classSummary); } }; } },
    { provide: WritingCorrectionsApiService, useFactory: () => { const store = inject(StudentPreviewStore); return { getLegend: async () => clone(store.legend) }; } },
    { provide: ActivatedRoute, useFactory: () => {
      const store = inject(StudentPreviewStore), guest = store.payload?.audience === 'guest';
      const classId = guest ? null : idOf(store.submission?.['class']);
      return { snapshot: { paramMap: convertToParamMap({ slug: idOf(store.submission?.['assignment']) }), queryParamMap: convertToParamMap(classId ? { classId } : {}) }, queryParamMap: of(convertToParamMap({})) };
    } },
  ],
})
export class StudentPreviewFrame {}

export type PreviewState = 'closed' | 'loading' | 'ready' | 'error';

/**
 * "Student preview": saved state only, read-only, in a modal. Opening it never saves, and it issues GET requests only.
 * Not dialog.showModal(): the top layer would cover what the student page attaches to document.body (correction tooltips) and the update
 * banner. So it is a fixed overlay under those, with Esc, the focus trap and focus return done here.
 */
@Component({
  selector: 'app-student-preview',
  imports: [StudentPreviewFrame],
  // Default on purpose (the page's own strategy): the student page inside re-renders on its async loads only if no ancestor is OnPush.
  changeDetection: ChangeDetectionStrategy.Default,
  providers: [StudentPreviewStore],
  templateUrl: './student-preview.html',
  styleUrl: './student-preview.css',
})
export class StudentPreview {
  readonly submission = input.required<Record<string, unknown>>();
  /** Goes up after each saved annotation change: an open preview reloads. */
  readonly refreshKey = input(0);

  protected readonly unsaved = inject(UnsavedWorkRegistry);
  private readonly store = inject(StudentPreviewStore);
  private readonly api = inject(TeacherAnnotationApiService);
  private readonly assignments = inject(AssignmentApiService);
  private readonly classes = inject(ClassApiService);
  private readonly legends = inject(WritingCorrectionsApiService);
  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private request = 0;
  private opener: HTMLElement | null = null;

  readonly state = signal<PreviewState>('closed');
  readonly error = signal('');
  /** Replaces the page on each load, so it starts from the new data. */
  readonly generation = signal(0);

  constructor() {
    let first = true;
    effect(() => { this.refreshKey(); if (first) { first = false; return; } untracked(() => { if (this.state() !== 'closed') void this.load(); }); });
  }

  open(): void {
    if (this.dialog().nativeElement.open) return;
    this.opener = document.activeElement as HTMLElement | null;
    this.dialog().nativeElement.show();
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('[data-preview-title]')?.focus(), { injector: this.injector });
    void this.load();
  }
  close(): void { const dialog = this.dialog().nativeElement; if (dialog.open) dialog.close(); }
  /** The dialog closed: the page inside goes away and focus returns to what opened it. */
  onClosed(): void {
    this.request++; this.state.set('closed');
    this.opener?.focus(); this.opener = null;
  }
  /** Esc closes; Tab stays inside. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const dialog = this.dialog().nativeElement;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog || active?.hasAttribute('data-preview-title'))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  async load(): Promise<void> {
    const request = ++this.request, submission = this.submission();
    this.state.set('loading'); this.error.set('');
    try {
      const payload = await this.api.preview(idOf(submission['_id']));
      // Metadata the payload does not carry, from the teacher's own read endpoints. None of it holds correction content.
      const [assignment, classSummary, legend] = await Promise.all([
        this.assignments.getAssignmentByIdForTeacher(idOf(submission['assignment'])).catch(() => null),
        this.classes.getClassSummary(idOf(submission['class'])).catch(() => null),
        payload.audience === 'guest' ? Promise.resolve(DEFAULT_CORRECTION_LEGEND) : this.legends.getLegend().catch(() => DEFAULT_CORRECTION_LEGEND),
      ]);
      if (request !== this.request) return;
      Object.assign(this.store, { payload, submission: studentSubmissionCopy(submission, payload.audience), assignment, classSummary, legend });
      this.generation.update(n => n + 1);
      this.state.set('ready');
    } catch (failure) {
      if (request !== this.request) return;
      const status = failure instanceof HttpErrorResponse ? failure.status : 0;
      this.error.set(status === 404 ? 'This submission was not found, or you do not have access to it.'
        : status === 429 ? 'Too many requests. Wait a moment, then try again.'
          : 'The preview could not be loaded. Check your connection and try again.');
      this.state.set('error');
    }
  }
}
