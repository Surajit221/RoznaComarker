import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StudentSpeakingSubmissionPage } from './speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { SpeakingUploadDialog } from '../../../../../components/student/speaking-upload-dialog/speaking-upload-dialog';
import { STUDENT_ROUTE } from '../../../student.routes';
import { unsavedWorkGuard } from '../../../../../core/app-update/unsaved-work';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const desktop = { isDesktop: () => true, isMobile: () => false, isTablet: () => false };
const submission = (over: Record<string, unknown> = {}) => ({ id: 's1', assignmentId: 'a1', status: 'submitted', submittedAt: '2026-11-01T10:00:00Z', isLate: false,
  canReplace: true, recording: { state: 'processing', durationSeconds: 42, contentType: 'audio/mpeg', canRetry: false }, ...over });
const result = (state: string, over: Record<string, unknown> = {}) => ({ submissionId: 's1', state, reason: null, message: 'SERVER TEXT', marksVisible: true,
  assessedText: null, fluency: null, fillers: [], result: null, corrections: [], ...over });

describe('StudentSpeakingSubmissionPage (stage 7d: status flow and polling)', () => {
  let fixture: ComponentFixture<StudentSpeakingSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StudentSpeakingSubmissionPage],
      providers: [...routedHttpTestProviders({ assignmentId: 'a1' }, { classId: 'class-1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: desktop }] });
    fixture = TestBed.createComponent(StudentSpeakingSubmissionPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => fixture.destroy());
  const root = () => fixture.nativeElement as HTMLElement;
  const status = () => root().querySelector('[role=status]')?.textContent?.trim() ?? '';
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === label) ?? null;
  function load(my: unknown) {
    fixture.detectChanges();
    http.expectOne(`${API}/assignments/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town', instructions: 'Speak about your town.', resourceType: 'speaking' } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: my });
    flushMicrotasks();
  }
  const answer = (body: unknown) => { http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: body }); flushMicrotasks(); fixture.detectChanges(); };

  it('no recording yet: says so and offers Upload Recording (opens the dialog)', fakeAsync(() => {
    load({ submission: null, limits: LIMITS });
    fixture.detectChanges();
    expect(root().textContent).toContain('Describe your town');
    expect(root().textContent).toContain("You haven't uploaded a recording yet.");
    button('Upload Recording')!.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingUploadDialog).componentInstance as SpeakingUploadDialog;
    expect(dialog.open).toBeTrue();
    expect(dialog.replacing).toBeFalse();
  }));

  it('transcribing, then marking, then the result: polls every 10 seconds and stops at the result', fakeAsync(() => {
    load({ submission: submission(), limits: LIMITS });
    answer(result('transcribing'));
    expect(status()).toContain('Turning your recording into text…');
    tick(10000);
    answer(result('assessing'));
    expect(status()).toContain('Marking your recording…');
    tick(10000);
    answer(result('ready'));
    expect(status()).toContain('Your recording has been marked.');
    tick(60000);
    http.expectNone(`${API}/speaking/submissions/s1/result`);
    expect(root().textContent).not.toContain('SERVER TEXT');
    discardPeriodicTasks();
  }));

  it('waiting for the teacher (blocked or failed marking): one fixed line, no polling, nothing about credits', fakeAsync(() => {
    load({ submission: submission({ recording: { state: 'ready', canRetry: false } }), limits: LIMITS });
    answer(result('awaiting_teacher'));
    expect(status()).toContain('Your teacher will check this recording.');
    expect(root().textContent).not.toMatch(/credit/i);
    tick(30000);
    http.expectNone(`${API}/speaking/submissions/s1/result`);
  }));

  it('not English: the fixed text for that reason (never the server text) and "Upload a new recording" while it can be replaced', fakeAsync(() => {
    load({ submission: submission({ recording: { state: 'ready', canRetry: false } }), limits: LIMITS });
    answer(result('not_assessable', { reason: 'not_english' }));
    expect(status()).toMatch(/not in English/);
    expect(root().textContent).not.toContain('SERVER TEXT');
    button('Upload a new recording')!.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingUploadDialog).componentInstance as SpeakingUploadDialog;
    expect(dialog.open).toBeTrue();
    expect(dialog.replacing).toBeTrue();
  }));

  it('not enough speech after the due date (cannot be replaced): no upload button', fakeAsync(() => {
    load({ submission: submission({ canReplace: false, recording: { state: 'ready', canRetry: false } }), limits: LIMITS });
    answer(result('not_enough_speech'));
    expect(status()).toMatch(/enough speech/);
    expect(button('Upload a new recording')).toBeNull();
  }));

  it('transcription failed: Retry transcription asks the server and polls again', fakeAsync(() => {
    load({ submission: submission({ recording: { state: 'failed', canRetry: true } }), limits: LIMITS });
    answer(result('transcription_failed'));
    expect(status()).toContain("We couldn't turn this recording into text.");
    button('Retry transcription')!.click();
    const retry = http.expectOne(`${API}/speaking/submissions/s1/retry-transcription`);
    retry.flush({ success: true, data: submission() });
    flushMicrotasks();
    answer(result('transcribing'));
    expect(status()).toContain('Turning your recording into text…');
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('after an upload from this page the status flow starts again', fakeAsync(() => {
    load({ submission: null, limits: LIMITS });
    fixture.componentInstance.onUploaded(submission() as never);
    flushMicrotasks();
    answer(result('transcribing'));
    expect(status()).toContain('Turning your recording into text…');
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('the route exists and keeps an upload from being lost (unsaved-work guard), as does the class page', () => {
    const children = STUDENT_ROUTE[0].children!;
    const page = children.find(r => r.path === 'my-classes/detail/my-speaking/:assignmentId')!;
    expect(page.component).toBe(StudentSpeakingSubmissionPage);
    expect(page.canDeactivate).toContain(unsavedWorkGuard);
    for (const path of ['my-classes/detail/:slug', 'classroom/:classId']) expect(children.find(r => r.path === path)!.canDeactivate).toContain(unsavedWorkGuard);
  });
});
