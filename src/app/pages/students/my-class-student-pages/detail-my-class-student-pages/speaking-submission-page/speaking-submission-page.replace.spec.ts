// Stage 7f: "Replace recording" while the recording can still be replaced (not marked, before the due date), through the same dialog; and the
// student never sees credits, the cap value or provider details.
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StudentSpeakingSubmissionPage } from './speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { WritingCorrectionsApiService } from '../../../../../api/writing-corrections-api.service';
import { SpeakingUploadDialog } from '../../../../../components/student/speaking-upload-dialog/speaking-upload-dialog';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const submission = (canReplace: boolean) => ({ id: 's1', assignmentId: 'a1', status: 'submitted', submittedAt: '2026-11-01T10:00:00Z', isLate: false, canReplace,
  recording: { state: 'ready', durationSeconds: 42, contentType: 'audio/mpeg', canRetry: false } });
const BLOCK = { overallScore: 50, maxScore: 100, grade: 'D', criteria: [], categories: [], summary: 'Summary.', strengths: [], improvements: [], actionSteps: [],
  teacherComments: '', scoreNote: 'This answer did not address the task, so the score is capped.', assessedAt: null };

describe('StudentSpeakingSubmissionPage: Replace recording (stage 7f)', () => {
  let fixture: ComponentFixture<StudentSpeakingSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StudentSpeakingSubmissionPage],
      providers: [...routedHttpTestProviders({ assignmentId: 'a1' }, { classId: 'class-1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: WritingCorrectionsApiService, useValue: { getLegend: () => Promise.resolve({ version: 'v', groups: [] }) } }] });
    fixture = TestBed.createComponent(StudentSpeakingSubmissionPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => fixture.destroy());
  const root = () => fixture.nativeElement as HTMLElement;
  const replace = () => [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === 'Replace recording') ?? null;
  function load(canReplace: boolean, state: string, over: Record<string, unknown> = {}) {
    fixture.detectChanges();
    http.expectOne(`${API}/assignments/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town' } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: { submission: submission(canReplace), limits: LIMITS } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: { submissionId: 's1', state, reason: null, marksVisible: true,
      assessedText: null, fluency: null, fillers: [], result: null, corrections: [], ...over } });
    flushMicrotasks();
    fixture.detectChanges();
  }

  for (const state of ['transcribing', 'assessing', 'awaiting_teacher', 'not_enough_speech', 'transcription_failed']) {
    it(`${state}, not marked and before the due date: Replace recording opens the same dialog in replace mode`, fakeAsync(() => {
      load(true, state);
      replace()!.click();
      fixture.detectChanges();
      const dialog = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingUploadDialog).componentInstance as SpeakingUploadDialog;
      expect(dialog.open).toBeTrue();
      expect(dialog.replacing).toBeTrue();
      fixture.destroy();
    }));
  }

  it('after the due date (or once marked): no Replace recording', fakeAsync(() => {
    load(false, 'awaiting_teacher');
    expect(replace()).toBeNull();
  }));

  it('marked: no Replace recording even if the earlier status said it could be replaced; the status is read again once final', fakeAsync(() => {
    load(true, 'ready', { result: BLOCK });
    expect(replace()).toBeNull();
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: { submission: submission(false), limits: LIMITS } });
    flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.submission?.canReplace).toBeFalse();
  }));

  it('never shows credits, the cap value or the score before the cap, or a provider, even if such fields arrived', fakeAsync(() => {
    load(true, 'ready', { result: BLOCK, offTopicCap: { cap: 50, uncappedScore: 62.5 }, errorCode: 'INSUFFICIENT_ASSESSMENT_CREDITS' });
    const text = root().textContent || '';
    expect(text).toContain('This answer did not address the task, so the score is capped.');
    expect(text).not.toContain('62.5');
    expect(text).not.toMatch(/capped at|credit|INSUFFICIENT|deepgram|openrouter|openai|gemini|nova/i);
  }));
});
