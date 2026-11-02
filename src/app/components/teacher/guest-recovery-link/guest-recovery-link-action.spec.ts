import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GuestRecoveryLinkAction } from './guest-recovery-link-action';
import { ActivityTracker, InFlightInterceptor } from '../../../core/app-update/activity-tracker';
import { environment } from '../../../../environments/environment';

const ID = 'a'.repeat(24);
const URL_ = `${environment.apiUrl}/submissions/${ID}/guest-access/recovery-link`;

describe('GuestRecoveryLinkAction (teacher)', () => {
  let fixture: ComponentFixture<GuestRecoveryLinkAction>;
  let http: HttpTestingController;
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() || '';
  const button = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLButtonElement;
  const buttonByText = (label: string) => [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent!.includes(label)) as HTMLButtonElement;

  async function open(status: Record<string, unknown> = { available: true, reason: null, emailMasked: 'j***@gmail.com', lastSentAt: null }) {
    TestBed.configureTestingModule({ imports: [GuestRecoveryLinkAction],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), { provide: HTTP_INTERCEPTORS, useClass: InFlightInterceptor, multi: true }] });
    fixture = TestBed.createComponent(GuestRecoveryLinkAction);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('submissionId', ID);
    fixture.detectChanges();
    expect(text()).toContain('Checking recovery link');
    http.expectOne(r => r.method === 'GET' && r.url === URL_).flush({ data: status });
    await settle();
  }
  async function confirmAndSend() {
    button('button[data-action=open]').click(); fixture.detectChanges();
    buttonByText('Send link').click(); fixture.detectChanges();
    return http.expectOne(r => r.method === 'POST' && r.url === URL_);
  }
  afterEach(() => { http.verify(); fixture.componentInstance.cooldown.stop(); });

  it('asks for confirmation showing only the MASKED address; Cancel sends nothing', async () => {
    await open();
    button('button[data-action=open]').click(); fixture.detectChanges();
    expect(text()).toContain('Send a new access link to j***@gmail.com?');
    expect(text()).toContain("The student's current links keep working.");
    buttonByText('Cancel').click(); fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('ready');
    http.expectNone(r => r.method === 'POST');
  });

  it('sends with an empty body (the server picks the recipient), shows "sending", then "sent" with the time', async () => {
    await open();
    const req = await confirmAndSend();
    expect(req.request.body).toBeNull();
    expect(text()).toContain('Sending…');
    expect(TestBed.inject(ActivityTracker).inFlight()).toBe(1);   // Task 1: no update reload while this runs
    req.flush({ data: { sent: true, emailMasked: 'j***@gmail.com', lastSentAt: '2026-11-02T09:00:00.000Z' } });
    await settle();
    expect(fixture.componentInstance.state()).toBe('sent');
    expect(text()).toContain('Link sent to j***@gmail.com.');
    expect(text()).toContain('Last sent');
    expect(TestBed.inject(ActivityTracker).inFlight()).toBe(0);
  });

  it('a cool-down (429) shows the server reason and a countdown, and disables the button', async () => {
    await open();
    (await confirmAndSend()).flush({ code: 'ADDRESS_COOLDOWN', message: 'A link was sent to this address a moment ago.', retryAfterSeconds: 95, emailMasked: 'j***@gmail.com' },
      { status: 429, statusText: 'Too Many Requests' });
    await settle();
    expect(fixture.componentInstance.state()).toBe('throttled');
    expect(text()).toContain('A link was sent to this address a moment ago.');
    expect(button('button[data-action=open]').disabled).toBeTrue();
    expect(text()).toMatch(/You can send again in 1:3\d/);
  });

  it('a failed send (502) says so and the button is usable again for a retry', async () => {
    await open();
    (await confirmAndSend()).flush({ code: 'EMAIL_FAILED', message: 'The email could not be sent. Nothing was changed; please try again.' }, { status: 502, statusText: 'Bad Gateway' });
    await settle();
    expect(fixture.componentInstance.state()).toBe('failed');
    expect(text()).toContain('could not be sent');
    expect(button('button[data-action=open]').disabled).toBeFalse();
  });

  it('no email on record, registered student and revoked access are shown as unavailable, without a button', async () => {
    for (const [reason, expected] of [['no_email', 'no email address on record'], ['registered', 'has an account'], ['revoked', 'was revoked']]) {
      TestBed.resetTestingModule();
      await open({ available: false, reason, emailMasked: null, lastSentAt: null });
      expect(fixture.componentInstance.state()).toBe('unavailable');
      expect(text()).toContain(expected);
      expect(fixture.nativeElement.querySelector('button')).toBeNull();
      http.verify();
    }
  });

  it('a submission this teacher does not own (404) is "not allowed"', async () => {
    TestBed.configureTestingModule({ imports: [GuestRecoveryLinkAction], providers: [provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(GuestRecoveryLinkAction);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('submissionId', ID);
    fixture.detectChanges();
    http.expectOne(URL_).flush({ code: 'SUBMISSION_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(fixture.componentInstance.state()).toBe('not_allowed');
    expect(text()).toContain('You cannot send a link for this submission.');
  });

  it('shows the last sent time from the status on open', async () => {
    await open({ available: true, reason: null, emailMasked: 'j***@gmail.com', lastSentAt: '2026-11-01T08:00:00.000Z' });
    expect(text()).toContain('Last sent');
  });
});
