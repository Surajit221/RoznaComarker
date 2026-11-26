// Speaking Coach on the teacher's speaking page: the read-only practice progress card for this submission (hidden while the coach is off).
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TeacherSpeakingSubmissionPage } from './teacher-speaking-submission-page';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { DeviceService } from '../../../../../services/device.service';
import { WritingCorrectionsApiService } from '../../../../../api/writing-corrections-api.service';
import { SpeakingCoachProgress } from '../../../../../components/teacher/speaking-coach-progress/speaking-coach-progress';

const API = 'http://localhost:5000/api';
const view = { id: 's1', assignmentId: 'a1', studentId: 'u1', studentName: 'Ana Lima', status: 'submitted', submittedAt: '2026-11-01T10:00:00Z', isLate: false,
  recording: { status: 'ready', attempts: 1, lastErrorCode: null, durationSeconds: 64, sizeBytes: 1000, contentType: 'audio/mpeg', audioAvailable: true } };
const result = { submissionId: 's1', state: 'ready', reason: null, marksVisible: true, assessedText: null, fluency: null, fillers: [], result: null, corrections: [],
  errorCode: null, canRetryAssessment: false, offTopicCap: null };

describe('TeacherSpeakingSubmissionPage: Speaking Coach progress', () => {
  let fixture: ComponentFixture<TeacherSpeakingSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TeacherSpeakingSubmissionPage],
      providers: [...routedHttpTestProviders({ submissionId: 's1' }, { classId: 'c1', assignmentId: 'a1' }), { provide: AuthService, useValue: { getBackendJwt: () => null } },
        { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: WritingCorrectionsApiService, useValue: { getLegend: () => Promise.resolve({ version: 'v', groups: [] }) } }] });
    fixture = TestBed.createComponent(TeacherSpeakingSubmissionPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => fixture.destroy());

  it('the card for this submission, below the result', fakeAsync(() => {
    fixture.detectChanges();
    http.expectOne(`${API}/speaking/submissions/s1`).flush({ success: true, data: view });
    flushMicrotasks();
    http.expectOne(`${API}/assignments/teacher/a1`).flush({ success: true, data: { _id: 'a1', title: 'Describe your town' } });
    http.expectOne(`${API}/speaking/submissions/s1/result`).flush({ success: true, data: result });
    flushMicrotasks();
    fixture.detectChanges();
    const card = fixture.debugElement.query(el => el.componentInstance instanceof SpeakingCoachProgress)?.componentInstance as SpeakingCoachProgress | undefined;
    expect(card?.submissionId).toBe('s1');
    http.expectOne(`${API}/speaking-coach/teacher/submissions/s1/progress`).flush({ success: false }, { status: 404, statusText: 'Not Found' });
    flushMicrotasks(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Speaking Practice Progress');
    http.match(`${API}/audio/submissions/s1/media`).forEach(r => r.flush(new Blob(['ID3'], { type: 'audio/mpeg' })));
    fixture.destroy();
  }));
});
