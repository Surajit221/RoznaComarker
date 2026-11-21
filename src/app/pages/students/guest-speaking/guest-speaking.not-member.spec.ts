// A signed-in student who is not in the class opens a speaking QR link. The registered QR lookup answers 403; as on the essay guest page
// (guest-submission, PR #178), the guest form opens when the assignment accepts guests, otherwise a join-the-class card. Guest requests
// never carry the student's bearer token, so the account is never linked or charged. Synthetic data only.
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { GuestSpeakingPage } from './guest-speaking';
import { AuthService } from '../../../auth/auth.service';
import { JwtInterceptor } from '../../../auth/jwt.interceptor';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { environment } from '../../../../environments/environment';

const API = environment.apiUrl;
const ENTRY = { kind: 'speaking', title: 'Guest speaking task', instructions: 'Talk for one minute.', deadline: '2026-12-01T10:00:00.000Z', allowGuestSubmission: true,
  limits: { maxRecordingSeconds: 420, minDurationSeconds: 5, maxFileBytes: 41943040 }, consent: { version: 'speaking-guest-2026-11', text: 'Synthetic notice.' } };
const NOTICE = "You're signed in, but you're not a member of this class. You can still submit as a guest with your name and email. "
  + 'Your teacher will see it as a guest submission, not linked to your account.';
const JOIN_HEADING = 'Join the class to submit this assignment';
const wav = () => new File([new Uint8Array(4000)], 'answer.wav', { type: 'audio/wav' });
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('GuestSpeakingPage: signed-in student who is not in the class (speaking QR link)', () => {
  const jwtPart = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const jwt = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ id: 'student-1', role: 'student', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  let previousJwt: string | null;
  let guestsOn = true;

  beforeEach(async () => {
    guestsOn = true;
    sessionStorage.clear();
    previousJwt = localStorage.getItem('backend_jwt');
    localStorage.setItem('backend_jwt', jwt);
    await TestBed.configureTestingModule({ imports: [GuestSpeakingPage], providers: [
      { provide: GuestSubmissionFeature, useValue: { enabled: () => guestsOn, load: () => Promise.resolve(guestsOn) } },
      provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), provideRouter([]),
      { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
      { provide: AuthService, useValue: { ensureQrBackendSession: jasmine.createSpy().and.resolveTo({ state: 'ready', role: 'student' }), hasFirebaseIdentity: () => true } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ qrToken: 'share-code' }), fragment: null } } },
    ] }).compileComponents();
  });
  afterEach(() => {
    if (previousJwt === null) localStorage.removeItem('backend_jwt'); else localStorage.setItem('backend_jwt', previousJwt);
    sessionStorage.clear();
  });

  async function openAsNonMember() {
    const http = TestBed.inject(HttpTestingController);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(GuestSpeakingPage);
    await fixture.componentInstance.ngOnInit(); fixture.detectChanges(); await settle();
    const lookup = http.expectOne(`${API}/assignments/qr/share-code`);
    expect(lookup.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    lookup.flush({ success: false, message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    return { http, navigate, fixture, page: fixture.componentInstance };
  }
  async function render(fixture: ComponentFixture<GuestSpeakingPage>) {
    await settle(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('assignment accepts guests: the guest form with a signed-in notice, blank name and email, no Sign in prompt, no bearer token on guest requests', async () => {
    const { http, navigate, fixture, page } = await openAsNonMember();
    const entry = http.expectOne(`${API}/guest/speaking/assignments/share-code`);
    expect(entry.request.headers.has('Authorization')).toBeFalse();
    entry.flush({ success: true, data: ENTRY });
    const el = await render(fixture);
    expect(el.querySelector('app-assignment-qr-redirect')).toBeNull();
    expect(el.textContent).not.toContain('Join with your class code');
    expect(el.textContent).toContain(NOTICE);
    expect(el.querySelector('#assignment-title')?.textContent).toContain('Guest speaking task');
    expect((el.querySelector('#guest-name') as HTMLInputElement | null)?.value).toBe('');
    expect((el.querySelector('#guest-email') as HTMLInputElement | null)?.value).toBe('');
    expect(el.querySelector('.account-option')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    page.name = 'Typed Name'; page.email = 'typed@example.com';
    page.continueWithIdentity();
    page.onFile(wav()); page.consented = true;
    const pending = page.submit();
    const upload = http.expectOne(`${API}/guest/speaking/assignments/share-code/submit`);
    expect(upload.request.headers.has('Authorization')).toBeFalse();
    upload.flush({ success: true, data: { received: true, emailSent: true } }); await pending;
    expect(page.confirmation?.received).toBeTrue();
    http.verify(); fixture.destroy();
  });

  it('assignment does not accept guests (404): a join-the-class card with a Join a class link, no form, no login redirect', async () => {
    const { http, navigate, fixture } = await openAsNonMember();
    http.expectOne(`${API}/guest/speaking/assignments/share-code`).flush({ success: false }, { status: 404, statusText: 'Not Found' });
    const el = await render(fixture);
    const card = el.querySelector('[role="alert"]');
    expect(card?.querySelector('h1')?.textContent?.trim()).toBe(JOIN_HEADING);
    const join = card?.querySelector('a') as HTMLAnchorElement | null;
    expect(join?.textContent?.trim()).toBe('Join a class');
    expect(join?.getAttribute('href')).toBe('/student/my-classes?join=1');
    expect(el.querySelector('#guest-name')).toBeNull();
    expect(el.querySelector('[data-entry-closed]')).toBeNull();
    expect(el.querySelector('app-assignment-qr-redirect')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    http.verify(); fixture.destroy();
  });

  it('guest submission unavailable for this assignment (GUEST_SUBMISSION_UNAVAILABLE): the join card', async () => {
    const { http, fixture } = await openAsNonMember();
    http.expectOne(`${API}/guest/speaking/assignments/share-code`)
      .flush({ success: false, error: { code: 'GUEST_SUBMISSION_UNAVAILABLE' }, code: 'GUEST_SUBMISSION_UNAVAILABLE' }, { status: 403, statusText: 'Forbidden' });
    const el = await render(fixture);
    expect(el.querySelector('[role="alert"] h1')?.textContent?.trim()).toBe(JOIN_HEADING);
    expect(el.querySelector('#guest-name')).toBeNull();
    http.verify(); fixture.destroy();
  });

  it('guest submission switched off: the join card, no guest request, not the "temporarily unavailable" notice', async () => {
    guestsOn = false;
    const { http, navigate, fixture } = await openAsNonMember();
    const el = await render(fixture);
    http.expectNone(`${API}/guest/speaking/assignments/share-code`);
    expect(el.querySelector('[role="alert"] h1')?.textContent?.trim()).toBe(JOIN_HEADING);
    expect(el.textContent).not.toContain('Guest submission is temporarily unavailable');
    expect(el.querySelector('#guest-name')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    http.verify(); fixture.destroy();
  });

  it('the guest assignment cannot be loaded (server error): a retryable error, no form and no join card', async () => {
    const { http, navigate, fixture } = await openAsNonMember();
    http.expectOne(`${API}/guest/speaking/assignments/share-code`).flush({ success: false }, { status: 503, statusText: 'Unavailable' });
    const el = await render(fixture);
    expect(el.textContent).toContain('Unable to open this assignment.');
    expect(el.textContent).not.toContain(JOIN_HEADING);
    expect(el.querySelector('#guest-name')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    http.verify(); fixture.destroy();
  });

  it('a focus or tab return never flips the page back to the registered flow', async () => {
    const { http, fixture, page } = await openAsNonMember();
    http.expectOne(`${API}/guest/speaking/assignments/share-code`).flush({ success: true, data: ENTRY });
    await render(fixture);
    // State after a guest upload answered "guest submission unavailable".
    page.guestUnavailable = true;
    const ensure = TestBed.inject(AuthService).ensureQrBackendSession as jasmine.Spy;
    ensure.calls.reset();
    await page.recheckEntrySession();
    expect(ensure).not.toHaveBeenCalled();
    expect(page.registered).toBeFalse();
    http.verify(); fixture.destroy();
  });
});
