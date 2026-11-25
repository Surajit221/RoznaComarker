// Speaking Coach on the student's speaking page: only once the result is ready; hidden while the coach is off (404); nothing asked before.
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StudentSpeakingSubmissionPage } from './speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { WritingCorrectionsApiService } from '../../../../../api/writing-corrections-api.service';
import { SpeakingCoach } from '../../../../../components/speaking/speaking-coach/speaking-coach';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const submission = { id: 's1', assignmentId: 'a1', status: 'submitted', submittedAt: '2026-11-01T10:00:00Z', isLate: false, canReplace: false,
  recording: { state: 'ready', durationSeconds: 42, contentType: 'audio/mpeg', canRetry: false } };
const BLOCK = { criteria: [], categories: [], summary: 'Summary.', strengths: [], improvements: [], actionSteps: [], teacherComments: '', scoreNote: null, assessedAt: null };

describe('StudentSpeakingSubmissionPage: Speaking Coach', () => {
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
  const coach = () => fixture.debugElement.query(el => el.componentInstance instanceof SpeakingCoach)?.componentInstance as SpeakingCoach | undefined;
  function load(state: string, result: unknown = null) {
    fixture.detectChanges();
    http.expectOne(`${API}/assignments/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town' } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/a1/my`).flush({ success: true, data: { submission, limits: LIMITS } });
    flushMicrotasks();
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: { submissionId: 's1', state, reason: null, marksVisible: true,
      assessedText: 'My town is small.', fluency: null, fillers: [], result, corrections: [] } });
    flushMicrotasks();
    fixture.detectChanges();
    http.match(`${API}/audio/submissions/s1/media`).forEach(r => r.flush(new Blob(['ID3'], { type: 'audio/mpeg' })));
    flushMicrotasks();
    fixture.detectChanges();
  }

  it('a ready result: the coach for this submission, shown when the server has one', fakeAsync(() => {
    load('ready', BLOCK);
    expect(coach()).toBeDefined();
    http.expectOne(`${API}/speaking-coach/submissions/s1`).flush({ success: true, data: { state: 'idle', session: null } });
    flushMicrotasks(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Practise your speaking');
    expect(coach()!.guest).toBeFalse();
  }));

  it('the coach switched off (404): nothing is shown', fakeAsync(() => {
    load('ready', BLOCK);
    http.expectOne(`${API}/speaking-coach/submissions/s1`).flush({ success: false, code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    flushMicrotasks(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Practise your speaking');
  }));

  it('still being marked: no coach and no coach request', fakeAsync(() => {
    load('assessing');
    expect(coach()).toBeUndefined();
    http.expectNone(`${API}/speaking-coach/submissions/s1`);
    fixture.destroy();
  }));
});
