import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TeacherSpeakingSubmissionPage } from './teacher-speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { WritingCorrectionsApiService } from '../../../../../api/writing-corrections-api.service';
import { TEACHER_ROUTE } from '../../../teacher.routes';
import { unsavedWorkGuard } from '../../../../../core/app-update/unsaved-work';
import { SpeakingAudioPlayer } from '../../../../../components/speaking/speaking-audio-player/speaking-audio-player';
import { SpeakingResultView } from '../../../../../components/speaking/speaking-result-view/speaking-result-view';

const API = 'http://localhost:5000/api';
const desktop = { isDesktop: () => true, isMobile: () => false, isTablet: () => false };
const view = (recording: Record<string, unknown> = {}) => ({ id: 's1', assignmentId: 'a1', studentId: 'u1', studentName: 'Ana Lima', status: 'submitted',
  submittedAt: '2026-11-01T10:00:00Z', isLate: false,
  recording: { status: 'ready', attempts: 1, lastErrorCode: null, durationSeconds: 64, sizeBytes: 1000, contentType: 'audio/mpeg', audioAvailable: true, ...recording } });
const result = (state: string, over: Record<string, unknown> = {}) => ({ submissionId: 's1', state, reason: null, message: 'SERVER TEXT', marksVisible: true,
  assessedText: null, fluency: null, fillers: [], result: null, corrections: [], errorCode: null, canRetryAssessment: false, offTopicCap: null, ...over });
const READY_BLOCK = { overallScore: 50, maxScore: 100, grade: 'D', criteria: [], categories: [], summary: 'Summary text.', strengths: [], improvements: [], actionSteps: [],
  teacherComments: '', scoreNote: 'This answer did not address the task, so the score is capped.', assessedAt: null };

describe('TeacherSpeakingSubmissionPage (stage 7e)', () => {
  let fixture: ComponentFixture<TeacherSpeakingSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TeacherSpeakingSubmissionPage],
      providers: [...routedHttpTestProviders({ submissionId: 's1' }, { classId: 'c1', assignmentId: 'a1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: desktop }, { provide: WritingCorrectionsApiService, useValue: { getLegend: () => Promise.resolve({ version: 'v', groups: [] }) } }] });
    fixture = TestBed.createComponent(TeacherSpeakingSubmissionPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => fixture.destroy());
  const root = () => fixture.nativeElement as HTMLElement;
  const status = () => root().querySelector('analysis-progress, app-analysis-progress [role=status]')?.textContent?.trim() ?? '';
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === label) ?? null;
  function load(job: unknown, first: unknown) {
    fixture.detectChanges();
    http.expectOne(`${API}/speaking/submissions/s1`).flush({ success: true, data: job });
    flushMicrotasks();
    http.expectOne(`${API}/assignments/teacher/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town' } });
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: first });
    flushMicrotasks();
    fixture.detectChanges();
  }
  const media = () => http.match(`${API}/audio/submissions/s1/media`).forEach(r => r.flush(new Blob(['ID3'], { type: 'audio/mpeg' })));

  it('header: the assignment title and whose recording it is; the player (with Download) is labelled with the name', fakeAsync(() => {
    load(view(), result('transcribing'));
    expect(root().querySelector('h1')!.textContent).toContain('Describe your town');
    expect(root().textContent).toContain('Recording by Ana Lima');
    const player = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingAudioPlayer).componentInstance as SpeakingAudioPlayer;
    expect(player.label).toBe('Recording by Ana Lima');
    expect(player.downloadable).toBeTrue();
    expect(status()).toContain('Turning the recording into text…');
    media();
    fixture.destroy();
  }));

  it('blocked (no credits): the reason and Retry marking; retrying asks the server and polls again until marked', fakeAsync(() => {
    load(view(), result('blocked', { errorCode: 'INSUFFICIENT_ASSESSMENT_CREDITS', canRetryAssessment: true }));
    expect(status()).toContain("You're out of assessment credits. Add credits, then retry marking.");
    tick(30000);
    http.expectNone(`${API}/speaking/submissions/s1/result`);
    button('Retry marking')!.click();
    http.expectOne(`${API}/speaking/submissions/s1/retry-assessment`).flush({ success: true, data: result('assessing') });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: result('assessing') });
    flushMicrotasks(); fixture.detectChanges();
    expect(status()).toContain('Marking the recording…');
    tick(10000);
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: result('ready', { result: READY_BLOCK, offTopicCap: { cap: 50, uncappedScore: 62.5 } }) });
    flushMicrotasks(); fixture.detectChanges();
    const shown = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingResultView).componentInstance as SpeakingResultView;
    expect(shown.audience).toBe('teacher');
    expect(shown.offTopicCap).toEqual({ cap: 50, uncappedScore: 62.5 });
    expect(root().textContent).not.toContain('SERVER TEXT');
    media();
  }));

  it('transcription failed: the job reason (minutes used up) and Retry transcription', fakeAsync(() => {
    load(view({ status: 'failed', lastErrorCode: 'AUDIO_MONTHLY_MINUTES_EXCEEDED' }), result('transcription_failed'));
    expect(status()).toContain("This month's speech-to-text minutes are used up.");
    button('Retry transcription')!.click();
    http.expectOne(`${API}/speaking/submissions/s1/retry-transcription`).flush({ success: true, data: view({ status: 'queued' }) });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: result('transcribing') });
    flushMicrotasks(); fixture.detectChanges();
    expect(status()).toContain('Turning the recording into text…');
    media();
    fixture.destroy();
  }));

  it('a recording that becomes "transcription failed" while polling reloads the job state, so Retry transcription appears', fakeAsync(() => {
    load(view({ status: 'transcribing' }), result('transcribing'));
    tick(10000);
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: result('transcription_failed') });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1`).flush({ success: true, data: view({ status: 'failed', lastErrorCode: 'AUDIO_STT_TIMEOUT' }) });
    flushMicrotasks(); fixture.detectChanges();
    expect(button('Retry transcription')).not.toBeNull();
    media();
  }));

  it('another teacher\'s or a missing submission (404): one fixed line, nothing else loaded', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`${API}/speaking/submissions/s1`).flush({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404, statusText: 'Not Found' });
    flushMicrotasks(); fixture.detectChanges();
    expect(root().querySelector('[role=alert]')!.textContent).toContain("This recording isn't available.");
    http.expectNone(`${API}/speaking/submissions/s1/result`);
  }));

  it('the route exists with the unsaved-work guard', () => {
    const route = TEACHER_ROUTE[0].children!.find(r => r.path === 'my-classes/detail/speaking-submission/:submissionId')!;
    expect(route.component).toBe(TeacherSpeakingSubmissionPage);
    expect(route.canDeactivate).toContain(unsavedWorkGuard);
  });
});
