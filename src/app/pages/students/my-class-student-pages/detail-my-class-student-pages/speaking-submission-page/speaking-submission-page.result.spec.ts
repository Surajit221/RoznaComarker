// Stage 7e: the student's speaking page shows the player always, and the transcript and result once marked (marks hidden when the teacher says so).
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StudentSpeakingSubmissionPage } from './speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { WritingCorrectionsApiService } from '../../../../../api/writing-corrections-api.service';
import { SpeakingAudioPlayer } from '../../../../../components/speaking/speaking-audio-player/speaking-audio-player';
import { SpeakingResultView } from '../../../../../components/speaking/speaking-result-view/speaking-result-view';
import { SpeakingTranscript } from '../../../../../components/speaking/speaking-transcript/speaking-transcript';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const submission = { id: 's1', assignmentId: 'a1', status: 'submitted', submittedAt: '2026-11-01T10:00:00Z', isLate: false, canReplace: false,
  recording: { state: 'ready', durationSeconds: 42, contentType: 'audio/mpeg', canRetry: false } };
const BLOCK = { criteria: [{ criterionId: 'speaking-task', title: 'Task and content', level: 'Good', weightPercent: 25, comment: 'Clear answer.' }], categories: [],
  summary: 'Summary.', strengths: [], improvements: [], actionSteps: [], teacherComments: '', scoreNote: 'This answer did not address the task, so the score is capped.', assessedAt: null };

describe('StudentSpeakingSubmissionPage: the result (stage 7e)', () => {
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
  const find = <T>(type: new (...args: never[]) => T) => fixture.debugElement.query(el => el.componentInstance instanceof type)?.componentInstance as T | undefined;
  function load(state: string, over: Record<string, unknown> = {}) {
    fixture.detectChanges();
    http.expectOne(`${API}/assignments/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town' } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: { submission, limits: LIMITS } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: { submissionId: 's1', state, reason: null, marksVisible: false,
      assessedText: 'My town is small.', fluency: null, fillers: [], result: null, corrections: [], ...over } });
    flushMicrotasks();
    fixture.detectChanges();
    http.match(`${API}/audio/submissions/s1/media`).forEach(r => r.flush(new Blob(['ID3'], { type: 'audio/mpeg' })));
    flushMicrotasks();
    fixture.detectChanges();
  }

  it('marked, marks hidden: the player ("Your recording"), the transcript and the result with marks hidden; the off-topic note is shown', fakeAsync(() => {
    load('ready', { result: BLOCK });
    const player = find(SpeakingAudioPlayer)!;
    expect(player.label).toBe('Your recording');
    expect(player.downloadable).toBeFalse();
    expect(find(SpeakingTranscript)).toBeDefined();
    const view = find(SpeakingResultView)!;
    expect(view.marksVisible).toBeFalse();
    expect(view.audience).toBe('student');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('This answer did not address the task, so the score is capped.');
  }));

  it('still being marked: the player only (no transcript, no result yet)', fakeAsync(() => {
    load('assessing');
    expect(find(SpeakingAudioPlayer)).toBeDefined();
    expect(find(SpeakingTranscript)).toBeUndefined();
    expect(find(SpeakingResultView)).toBeUndefined();
    fixture.destroy();
  }));
});
