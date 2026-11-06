import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import { DEFAULT_CORRECTION_LEGEND } from '../../../constants/correction-legend.default';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { StudentPreview, StudentPreviewFrame, studentSubmissionCopy } from './student-preview';

const SUBMISSION = { _id: 's1', assignment: { _id: 'a1', title: 'Essay', teacher: { email: 't@example.com' } }, class: { _id: 'c1' }, student: { _id: 'u1', displayName: 'Student' }, ocrStatus: 'completed',
  evaluationStatus: 'completed', fileUrl: '', files: [], fileUrls: [], ocrPages: [], writingCorrections: [{ message: 'RAW-TEACHER-COPY' }], guest: { normalizedEmail: 'hidden@example.com' }, submittedAt: '2026-10-01T09:00:00.000Z' };
const words = 'I goes home'.split(' ').map((text, i) => ({ id: `w${i}`, fileId: 'f1', text, separatorBefore: i ? ' ' : '', bbox: { x: 0.1 * i, y: 0.1, w: 0.05, h: 0.05 } }));
function payload(patch: Record<string, unknown> = {}) {
  return { audience: 'student' as const, ocrCorrectionsStatus: 200, feedbackStatus: 200,
    ocrCorrections: { processing: false, ocrStatus: 'completed', correctionStatus: 'completed', semanticStatus: 'completed', statisticsStatus: 'complete', correctionCurrent: true, transcript: 'I goes home', ocr: [{ fileId: 'f1', pageNumber: 1, words, lines: [] }],
      corrections: [], statistics: { content: 0, grammar: 7, organization: 0, vocabulary: 0, mechanics: 0, total: 7 }, categoryAvailability: { grammar: 'available' } },
    feedback: { submissionId: 's1', marksVisible: true, evaluationStatus: 'completed', evaluationCurrent: true, terminal: true }, ...patch };
}

describe('StudentPreview', () => {
  let fixture: ComponentFixture<StudentPreview>, component: StudentPreview, http: HttpTestingController;
  let preview: jasmine.Spy;

  async function setup() {
    preview = jasmine.createSpy('preview').and.callFake(async () => payload());
    await TestBed.configureTestingModule({ imports: [StudentPreview], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: TeacherAnnotationApiService, useValue: { preview } },
      { provide: AssignmentApiService, useValue: { getAssignmentByIdForTeacher: async () => ({ _id: 'a1', title: 'Essay' }) } },
      { provide: ClassApiService, useValue: { getClassSummary: async () => ({ name: 'Class', gradingScale: 'score_0_100' }) } },
      { provide: WritingCorrectionsApiService, useValue: { getLegend: async () => DEFAULT_CORRECTION_LEGEND } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(StudentPreview);
    fixture.componentRef.setInput('submission', SUBMISSION);
    component = fixture.componentInstance; http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }
  async function settle() { for (let i = 0; i < 8; i++) { await fixture.whenStable(); fixture.detectChanges(); await new Promise(r => setTimeout(r)); } }
  const dom = () => fixture.nativeElement as HTMLElement;
  const dialog = () => dom().querySelector('dialog') as HTMLDialogElement;
  async function openIt() { dom().querySelector<HTMLButtonElement>('[data-preview-open]')!.click(); fixture.detectChanges(); await settle(); }
  afterEach(() => { if (fixture && dialog()?.open) dialog().close(); TestBed.inject(UnsavedWorkRegistry).clear('x'); });

  it('is closed until asked; nothing is requested', async () => {
    await setup();
    expect(dialog().open).toBeFalse();
    expect(preview).not.toHaveBeenCalled();
    expect(dom().querySelector('app-my-submission-page')).toBeNull();
  });

  it('opens labelled, renders the REAL student page on the payload, without a student request', async () => {
    await setup(); await openIt();
    expect(dialog().open).toBeTrue();
    expect(dialog().textContent).toContain('Preview: this is what the student sees');
    expect(document.activeElement?.hasAttribute('data-preview-title')).toBeTrue();
    expect(preview).toHaveBeenCalledOnceWith('s1');
    expect(dom().querySelector('app-my-submission-page')).not.toBeNull();
    const urls = http.match(() => true).map(r => r.request.url);
    expect(urls.filter(u => /ocr-corrections|\/feedback\/|submissions\/assignment|submissions\/my|\/reviewed/.test(u))).toEqual([]);
  });

  it('neither it nor its frame blocks the student page\'s change detection (no OnPush ancestor)', async () => {
    await setup();
    const strategy = (type: unknown) => (type as { ɵcmp: { onPush: boolean } }).ɵcmp.onPush;
    expect(strategy(StudentPreview)).toBeFalse();
    expect(strategy(StudentPreviewFrame)).toBeFalse();
  });

  it('issues no writes while previewing', async () => {
    await setup(); await openIt();
    expect(http.match(r => r.method !== 'GET')).toEqual([]);
  });

  it('leaves out what would act as the student: PDF, back, draft comparison, practice', async () => {
    await setup(); await openIt();
    expect(dom().querySelector('app-adaptive-writing-studio')).toBeNull();
    expect(dom().querySelector('app-draft-comparison')).toBeNull();
    const buttons = [...dom().querySelectorAll('app-my-submission-page button')].map(b => b.textContent?.trim());
    expect(buttons.some(b => b?.includes('Download Feedback PDF') || b?.includes('Back To'))).toBeFalse();
  });

  it('shows counts from the payload in the student\'s own card', async () => {
    await setup(); await openIt();
    [...dom().querySelectorAll<HTMLButtonElement>('app-my-submission-page button')].find(b => b.textContent?.includes('View Student Transcribed Text'))!.click();
    await settle();
    expect(dom().querySelector('app-my-submission-page')!.textContent!.replace(/\s+/g, '')).toContain('GrammarIssues7');
  });

  it('marks hidden: the student\'s own notice is what appears', async () => {
    await setup();
    preview.and.callFake(async () => payload({ feedback: { submissionId: 's1', marksVisible: false, evaluationStatus: 'completed', terminal: true } }));
    await openIt();
    [...dom().querySelectorAll<HTMLButtonElement>('app-my-submission-page button')].find(b => b.textContent?.includes('View Student Transcribed Text'))!.click();
    await settle();
    expect(dom().querySelector('app-my-submission-page')!.textContent).toContain('Marks hidden by teacher');
  });

  it('unsaved editor input: says it is not included, and does not touch it', async () => {
    await setup();
    const registry = TestBed.inject(UnsavedWorkRegistry);
    registry.register('x');
    await openIt();
    expect(dom().querySelector('[data-preview-unsaved]')?.textContent).toContain('Unsaved changes are not included');
    expect(registry.hasWork()).toBeTrue();
    expect(http.match(r => r.method !== 'GET')).toEqual([]);
    registry.clear('x'); fixture.detectChanges();
    expect(dom().querySelector('[data-preview-unsaved]')).toBeNull();
  });

  it('loading state, then ready', async () => {
    await setup();
    let release: (v: unknown) => void = () => undefined;
    preview.and.callFake(() => new Promise(resolve => { release = resolve; }));
    dom().querySelector<HTMLButtonElement>('[data-preview-open]')!.click(); fixture.detectChanges();
    expect(dom().querySelector('[data-preview-loading]')).not.toBeNull();
    release(payload()); await settle();
    expect(dom().querySelector('[data-preview-loading]')).toBeNull();
    expect(dom().querySelector('app-my-submission-page')).not.toBeNull();
  });

  it('error state with Retry; Retry succeeds', async () => {
    await setup();
    preview.and.callFake(async () => { throw new HttpErrorResponse({ status: 0 }); });
    await openIt();
    expect(dom().querySelector('[data-preview-error]')?.textContent).toContain('could not be loaded');
    preview.and.callFake(async () => payload());
    [...dom().querySelectorAll<HTMLButtonElement>('[data-preview-error] button')][0].click();
    await settle();
    expect(dom().querySelector('[data-preview-error]')).toBeNull();
    expect(dom().querySelector('app-my-submission-page')).not.toBeNull();
  });

  it('404 says not found or no access', async () => {
    await setup();
    preview.and.callFake(async () => { throw new HttpErrorResponse({ status: 404 }); });
    await openIt();
    expect(dom().querySelector('[data-preview-error]')?.textContent).toContain('do not have access');
  });

  it('a saved change reloads an open preview; a closed one stays quiet', async () => {
    await setup(); await settle();
    fixture.componentRef.setInput('refreshKey', 1); await settle();
    expect(preview).not.toHaveBeenCalled();
    await openIt();
    expect(preview).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('refreshKey', 2); await settle();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('Close removes the page and returns focus to the button', async () => {
    await setup();
    dom().querySelector<HTMLButtonElement>('[data-preview-open]')!.focus();
    await openIt();
    dom().querySelector<HTMLButtonElement>('[data-preview-close]')!.click(); await settle();
    expect(dialog().open).toBeFalse();
    expect(component.state()).toBe('closed');
    expect(dom().querySelector('app-my-submission-page')).toBeNull();
    expect(document.activeElement?.hasAttribute('data-preview-open')).toBeTrue();
  });

  it('Esc closes; Tab from the last control wraps to the first', async () => {
    await setup(); await openIt();
    const focusable = [...dialog().querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
    focusable[focusable.length - 1].focus();
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(focusable[0]);
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(dialog().open).toBeFalse();
  });

  it('is not in the top layer, so the tooltip attached to the body can show above it', async () => {
    await setup(); await openIt();
    expect(dialog().matches(':modal')).toBeFalse();
    expect(Number(getComputedStyle(dialog()).zIndex)).toBeLessThan(9999);
  });

  describe('studentSubmissionCopy', () => {
    it('registered: drops raw corrections and any guest identity; never mutates the teacher\'s copy', () => {
      const copy = studentSubmissionCopy(SUBMISSION, 'student');
      expect(JSON.stringify(copy)).not.toContain('RAW-TEACHER-COPY');
      expect(JSON.stringify(copy)).not.toContain('hidden@example.com');
      (copy['ocrPages'] as unknown[]).push({});
      expect(SUBMISSION.ocrPages.length).toBe(0);
    });
    it('registered: the teacher object becomes the name a student gets; no email', () => {
      const copy = studentSubmissionCopy({ ...SUBMISSION, assignment: { _id: 'a1', teacher: { _id: 't1', email: 't@example.com', displayName: 'Ms Rahman' } }, class: { _id: 'c1', teacher: { _id: 't1', email: 't@example.com', displayName: 'Ms Rahman' } } }, 'student');
      expect(copy['assignment']).toEqual({ _id: 'a1', teacherDisplayName: 'Ms Rahman' });
      expect(copy['class']).toEqual({ _id: 'c1', teacherDisplayName: 'Ms Rahman' });
      expect(JSON.stringify(copy)).not.toContain('t@example.com');
    });
    it('guest: only the fields the guest presentation has; references are plain ids', () => {
      const copy = studentSubmissionCopy(SUBMISSION, 'guest');
      expect(copy['assignment']).toBe('a1');
      expect(copy['class']).toBe('c1');
      expect(copy['student']).toBeUndefined();
      expect(copy['guest']).toBeUndefined();
    });
  });
});
