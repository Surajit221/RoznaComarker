// Stage 9: the submissions dialog of a speaking assignment shows the teacher-uploaded recordings with the same chips and actions as essay
// uploads, through the speaking endpoints, with fixed messages. Essay assignments are unchanged.
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { DialogViewSubmissions } from './dialog-view-submissions';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';
import { AlertService } from '../../../../../services/alert.service';

const API = 'http://localhost:5000/api';
const SPEAKING = `${API}/speaking/assignments/a1/teacher-uploads`;
const upload = (over: Record<string, unknown>) => ({ submissionId: 's1', kind: 'speaking', name: 'Ana Lima', email: 'ana@example.com', account: 'member', uploadedByTeacher: true,
  pages: 1, status: 'marked', emailStatus: 'none', emailSentAt: null, emailFailedAt: null, uploadedAt: '2026-11-01T00:00:00Z', ...over });

describe('DialogViewSubmissions: speaking teacher uploads (stage 9)', () => {
  let fixture: ComponentFixture<DialogViewSubmissions>;
  let http: HttpTestingController;
  let alert: jasmine.SpyObj<AlertService>;
  beforeEach(async () => {
    alert = jasmine.createSpyObj('AlertService', ['showSuccess', 'showError', 'showConfirm', 'showToast', 'showWarning']);
    alert.showConfirm.and.resolveTo(true);
    await TestBed.configureTestingModule({ imports: [DialogViewSubmissions],
      providers: [...routedHttpTestProviders(), { provide: AuthService, useValue: { getBackendJwt: () => null } }, { provide: AlertService, useValue: alert }] }).compileComponents();
    fixture = TestBed.createComponent(DialogViewSubmissions);
    http = TestBed.inject(HttpTestingController);
  });
  const root = () => fixture.nativeElement as HTMLElement;
  function open(speaking: boolean, items: unknown[]) {
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('speaking', speaking);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    http.match(r => r.url.includes('/submissions/assignment/')).forEach(r => r.flush({ success: true, data: [
      { _id: 's1', sourceKind: 'audio', class: 'c1', student: { _id: 'u1', displayName: 'Ana Lima', email: 'ana@example.com' }, submittedAt: '2026-11-01T00:00:00Z' }] }));
    const stale = http.match(r => r.url.includes('stale'));
    if (speaking) expect(stale.length).toBe(0);
    stale.forEach(r => r.flush({ success: true, data: { staleCount: 1 } }));
    flushMicrotasks();
    if (speaking) {
      http.expectNone(`${API}/assignments/a1/teacher-uploads`);
      http.expectOne(SPEAKING).flush({ success: true, data: { items, credits: { available: 3 } } });
    }
    flushMicrotasks(); fixture.detectChanges();
  }

  it('reads the speaking uploads (never the essay endpoint) and shows the same chips; "Transcribing" while turned into text', fakeAsync(() => {
    open(true, [upload({ status: 'reading' })]);
    // The essay re-evaluation summary is not asked for (a speaking assignment has none; the endpoint answers 404).
    expect(fixture.componentInstance.staleEvaluationSummary).toBeNull();
    const info = root().querySelector('[data-teacher-upload]')!;
    expect(info.textContent).toContain('Uploaded by teacher');
    expect(info.querySelector('[data-upload-status]')!.textContent!.trim()).toBe('Transcribing');
  }));

  it('Send and Retry marking go to the speaking endpoints; a refusal shows the fixed message', fakeAsync(() => {
    open(true, [upload({ status: 'failed', failureCode: 'AUDIO_STT_TIMEOUT' })]);
    [...root().querySelectorAll<HTMLButtonElement>('[data-retry-marking]')][0].click();
    http.expectOne(`${SPEAKING}/s1/retry`).flush({ success: false, code: 'INSUFFICIENT_CREDITS', message: 'RAW SERVER TEXT' }, { status: 402, statusText: 'Payment Required' });
    flushMicrotasks();
    expect(alert.showError).toHaveBeenCalledWith('Marking not restarted', 'You have no assessment credits left. Add credits to upload more recordings.');
    fixture.componentInstance.students[0].upload = upload({ status: 'marked' }) as never;
    fixture.detectChanges();
    [...root().querySelectorAll<HTMLButtonElement>('.upload-info__send')].find(b => b.textContent!.trim().startsWith('Send'))!.click();
    http.expectOne(`${SPEAKING}/s1/send`).flush({ success: true, data: { item: upload({ emailStatus: 'queued' }), alreadyRequested: false } });
    flushMicrotasks();
    expect(alert.showSuccess).toHaveBeenCalled();
  }));

  it('not marked (not enough speech): the reason, no Retry, Send disabled', fakeAsync(() => {
    open(true, [upload({ status: 'not_marked', failureCode: 'SPEAKING_NOT_ENOUGH_SPEECH' })]);
    const info = root().querySelector('[data-teacher-upload]')!;
    expect(info.querySelector('[data-upload-status]')!.textContent!.trim()).toBe('Not marked');
    expect(info.querySelector('[data-upload-reason]')!.textContent).toContain("There wasn't enough speech in the recording to mark it.");
    expect(info.querySelector('[data-retry-marking]')).toBeNull();
    const send = [...info.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim().startsWith('Send'))!;
    expect(send.disabled).toBeTrue();
    expect(info.textContent).toContain('Not marked, email not sent');
  }));

  it('an essay assignment still reads the essay uploads', fakeAsync(() => {
    open(false, []);
    http.expectOne(`${API}/assignments/a1/teacher-uploads`).flush({ success: true, data: { items: [], credits: { available: 3 } } });
    http.expectNone(SPEAKING);
  }));
});
