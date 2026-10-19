import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, DefaultUrlSerializer, provideRouter, Router } from '@angular/router';
import { GuestSubmissionPage } from './guest-submission';
import { AuthService } from '../../../auth/auth.service';
import { environment } from '../../../../environments/environment';

describe('guest assignment entry', () => {
  let page: GuestSubmissionPage;
  let http: HttpTestingController;
  let auth: { ensureQrBackendSession: jasmine.Spy };
  let router: { navigate: jasmine.Spy };
  beforeEach(() => {
    auth = { ensureQrBackendSession: jasmine.createSpy().and.resolveTo({ state: 'anonymous' }) };
    router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ qrToken: 'share-code' }), fragment: null } } }
    ] });
    http = TestBed.inject(HttpTestingController);
    page = TestBed.runInInjectionContext(() => new GuestSubmissionPage());
  });
  afterEach(() => http.verify());
  it('waits for Firebase restoration and preserves the registered student flow', async () => {
    auth.ensureQrBackendSession.and.resolveTo({ state: 'ready', role: 'student' });
    await page.ngOnInit(); expect(page.registered).toBeTrue();
    http.expectNone(`${environment.apiUrl}/guest/assignments/share-code`);
  });
  it('loads only public assignment metadata for an anonymous visitor', async () => {
    const pending = page.ngOnInit(); await Promise.resolve();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code`).flush({ data: { title: 'Essay', allowGuestSubmission: true } });
    await pending; expect(page.assignment.title).toBe('Essay'); expect(page.loading).toBeFalse();
  });
  it('preserves login return behavior when guest submissions are disabled', async () => {
    const pending = page.ngOnInit(); await Promise.resolve();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code`).flush({}, { status: 404, statusText: 'Unavailable' });
    await pending; expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/student/assignments/qr/share-code' } });
  });
  it('keeps one idempotency reference through an ambiguous network failure and retry', async () => {
    page.qrToken = 'share-code'; page.name = 'Student'; page.email = 'student@example.com';
    page.files = [new File(['writing'], 'page.png', { type: 'image/png' })];
    const first = page.submit();
    const one = http.expectOne(`${environment.apiUrl}/guest/assignments/share-code/submit`);
    const key = one.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy(); one.error(new ProgressEvent('network error')); await first;
    const second = page.submit(); const two = http.expectOne(`${environment.apiUrl}/guest/assignments/share-code/submit`);
    expect(two.request.headers.get('Idempotency-Key')).toBe(key);
    two.flush({ data: { received: true, duplicate: true } }); await second;
    expect(page.confirmation.received).toBeTrue();
  });
  it('shows recoverable email-delivery state without losing submission success', async () => {
    page.qrToken = 'share-code'; page.name = 'Student'; page.email = 'student@example.com';
    page.files = [new File(['writing'], 'page.png')];
    const pending = page.submit();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code/submit`).flush({ data: { received: true, emailSent: false, returnUrl: 'https://school.example/guest/results/id#token' } });
    await pending; expect(page.confirmation.received).toBeTrue(); expect(page.confirmation.returnUrl).toContain('#');
    expect(page.recoveryEmail).toBe('student@example.com');
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('rejects missing identity before uploading', async () => {
    page.qrToken = 'share-code'; page.files = [new File(['writing'], 'page.png')];
    await page.submit(); expect(page.error).toContain('valid email'); expect(page.busy).toBeFalse();
    http.expectNone(`${environment.apiUrl}/guest/assignments/share-code/submit`);
  });
  it('blocks a double click while an upload is processing', async () => {
    page.qrToken = 'share-code'; page.name = 'Student'; page.email = 'student@example.com';
    page.files = [new File(['writing'], 'page.png')];
    const pending = page.submit(); await page.submit();
    const requests = http.match(`${environment.apiUrl}/guest/assignments/share-code/submit`);
    expect(requests.length).toBe(1); expect(page.busy).toBeTrue();
    requests[0].flush({ data: { received: true } }); await pending;
    expect(page.busy).toBeFalse();
  });
  it('removes a return token from browser history and uses only its scoped header', async () => {
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, { paramMap: convertToParamMap({ submissionId: 'submission-a' }), fragment: 'private-token' });
    const replace = spyOn(history, 'replaceState');
    const pending = page.ngOnInit();
    const req = http.expectOne(`${environment.apiUrl}/guest/submissions/submission-a`);
    expect(req.request.headers.get('X-Guest-Token')).toBe('private-token');
    expect(req.request.url).not.toContain('private-token'); expect(replace).toHaveBeenCalled();
    req.flush({ data: { title: 'Essay', status: 'complete', feedback: { overallScore: 80 } } });
    await pending; expect(page.result.feedback.overallScore).toBe(80);
  });
  it('shows the expired return-link state without navigating into account flows', async () => {
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, { paramMap: convertToParamMap({ submissionId: 'submission-a' }), fragment: 'expired-token' });
    spyOn(history, 'replaceState');
    const pending = page.ngOnInit();
    http.expectOne(`${environment.apiUrl}/guest/submissions/submission-a`).flush({ message: 'This link has expired. Request a new link.' }, { status: 410, statusText: 'Expired' });
    await pending; expect(page.error).toContain('expired'); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('parses the server URL fragment and retains the token for subsequent requests after scrubbing history', async () => {
    // Same 32-byte base64url alphabet/length as issueToken(), including both URL-safe punctuation characters.
    const token = 'A_b-C'.repeat(8) + 'xyz';
    const link = new URL(`https://school.example/guest/results/507f1f77bcf86cd799439011#${token}`);
    const parsed = new DefaultUrlSerializer().parse(link.pathname + link.hash);
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, {
      paramMap: convertToParamMap({ submissionId: link.pathname.split('/').pop()! }), fragment: parsed.fragment
    });
    const replace = spyOn(history, 'replaceState');
    const storage = spyOn(Storage.prototype, 'setItem');
    const pending = page.ngOnInit();
    const req = http.expectOne(`${environment.apiUrl}/guest/submissions/507f1f77bcf86cd799439011`);
    expect(req.request.headers.get('X-Guest-Token')).toBe(token);
    expect(replace.calls.mostRecent().args[2]?.toString()).not.toContain(token);
    req.flush({ data: { title: 'Essay', status: 'processing' } }); await pending;
    const refresh = page.loadResults();
    const next = http.expectOne(req.request.url);
    expect(next.request.headers.get('X-Guest-Token')).toBe(token);
    next.flush({ data: { title: 'Essay', status: 'complete' } }); await refresh;
    expect(page.result.status).toBe('complete'); expect(storage).not.toHaveBeenCalled();
    expect(auth.ensureQrBackendSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('clears displayed feedback and practice when a refreshed link is rejected', async () => {
    page.result = { feedback: { overallScore: 80 } };
    page.practice = { session: {} }; page.answers = { q1: 'answer' };
    page.answerResults = { q1: 'Previously checked' }; page.draftMessage = 'Previous progress';
    const pending = page.loadResults();
    http.expectOne(`${environment.apiUrl}/guest/submissions/`).flush({ message: 'This link has expired.' }, { status: 410, statusText: 'Expired' });
    await pending;
    expect(page.result).toBeNull(); expect(page.practice).toBeNull();
    expect(page.answers).toEqual({}); expect(page.answerResults).toEqual({});
    expect(page.draftMessage).toBe(''); expect(page.error).toContain('expired');
  });
});

describe('guest assignment page presentation', () => {
  let page: GuestSubmissionPage;
  let fixture: ComponentFixture<GuestSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GuestSubmissionPage], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { ensureQrBackendSession: jasmine.createSpy().and.resolveTo({ state: 'anonymous' }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ qrToken: 'share-code' }), fragment: null } } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(GuestSubmissionPage); page = fixture.componentInstance;
    page.loading = false; page.qrToken = 'share-code';
    page.currentPath = '/student/assignments/qr/share-code';
    page.assignment = { title: 'A place that matters', instructions: 'Describe a place that is special to you.',
      deadline: '2099-08-11T12:00:00Z', rubric: 'PRIVATE RUBRIC', teacherEmail: 'private@example.com' };
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); await Promise.resolve();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code`).flush({ data: page.assignment });
    await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });
  const text = (element: HTMLElement) => element.textContent || '';

  it('shows safe assignment information and the dedicated submission form with linked labels', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(text(host.querySelector('h1')!)).toBe('A place that matters');
    expect(text(host)).toContain('Guest Submission'); expect(text(host)).toContain(page.assignment.instructions);
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe(page.assignment.deadline);
    expect(text(host)).not.toContain('PRIVATE RUBRIC'); expect(text(host)).not.toContain('private@example.com');
    for (const id of ['guest-name', 'guest-email', 'guest-files']) {
      expect(host.querySelector(`label[for="${id}"]`)).toBeTruthy(); expect(host.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(text(host)).toContain('Submit your work');
    expect(text(host)).toContain('Your name and email will be shared with your teacher. A private return link will be emailed to you after submission.');
    expect(host.querySelector('app-assignment-qr-redirect')).toBeNull();
    const login = host.querySelector('.account-option a') as HTMLAnchorElement;
    expect(login.textContent).toBe('Sign in'); expect(login.getAttribute('href')).toContain('/login?returnUrl=');
    expect(host.querySelector('.submit-button')?.textContent).toContain('Submit Assignment');
    expect((host.querySelector('.submit-button') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('keeps recovery collapsed and keyboard accessible with the same recovery request', async () => {
    const details: HTMLDetailsElement = fixture.nativeElement.querySelector('details.recovery');
    expect(details.open).toBeFalse(); expect(text(details.querySelector('summary')!)).toContain('Lost your feedback link?');
    details.querySelector('summary')!.click(); fixture.detectChanges();
    expect(details.open).toBeTrue();
    expect(text(details)).toContain('Email me a new link');
    page.recoveryEmail = 'student@example.com';
    const pending = page.recover();
    const req = http.expectOne(`${environment.apiUrl}/guest/assignments/share-code/recover`);
    expect(req.request.body).toEqual({ email: 'student@example.com' });
    req.flush({ data: { message: 'If a matching submission exists, a new link will be emailed.' } });
    await pending; fixture.detectChanges(); expect(text(details)).toContain('If a matching submission exists');
  });

  it('routes dropped files through the existing picker logic and displays the same limits', () => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['writing'], 'my-page.png', { type: 'image/png' }));
    const event = new DragEvent('drop', { dataTransfer: transfer, cancelable: true, bubbles: true });
    const select = spyOn(page, 'selectFiles').and.callThrough();
    fixture.nativeElement.querySelector('.upload-zone').dispatchEvent(event); fixture.detectChanges();
    expect(event.defaultPrevented).toBeTrue(); expect(select).toHaveBeenCalledTimes(1);
    expect(page.files[0].name).toBe('my-page.png'); expect(text(fixture.nativeElement)).toContain('1 file selected');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#guest-files');
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,application/pdf'); expect(input.multiple).toBeTrue();
    expect(text(fixture.nativeElement)).toContain('Up to 20 files');
  });

  it('preserves upload count rejection and prevents file replacement while submitting', () => {
    const transfer = new DataTransfer();
    for (let i = 0; i < 21; i++) transfer.items.add(new File(['writing'], `${i}.png`));
    page.dropFiles(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
    expect(page.error).toBe('Choose no more than 20 files.');
    page.busy = true; fixture.detectChanges();
    const previous = page.files;
    page.dropFiles(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
    expect(page.files).toBe(previous);
    expect((fixture.nativeElement.querySelector('#guest-files') as HTMLInputElement).disabled).toBeTrue();
    expect(text(fixture.nativeElement)).toContain('Checking and submitting');
  });

  it('shows accessible field validation and request errors without losing the form', async () => {
    const email: HTMLInputElement = fixture.nativeElement.querySelector('#guest-email');
    email.value = 'invalid'; email.dispatchEvent(new Event('input')); email.dispatchEvent(new Event('blur'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture.nativeElement.querySelector('#email-error'))).toContain('valid email');
    page.error = 'An image needs attention. Please check its orientation.'; fixture.detectChanges();
    expect(text(fixture.nativeElement.querySelector('[role="alert"]'))).toContain('orientation');
    expect(fixture.nativeElement.querySelector('#guest-files')).toBeTruthy();
  });

  it('renders loading, success and email-warning states with the existing return link', () => {
    page.loading = true; fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Loading assignment');
    expect(fixture.nativeElement.querySelector('#guest-files')).toBeNull();
    page.loading = false;
    page.confirmation = { received: true, emailSent: false, returnUrl: 'https://school.example/guest/results/id#private-token' };
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Assignment submitted');
    expect(text(fixture.nativeElement.querySelector('[role="alert"]'))).toContain('email could not be delivered');
    expect((fixture.nativeElement.querySelector('.confirmation a') as HTMLAnchorElement).href).toBe(page.confirmation.returnUrl);
    expect(fixture.nativeElement.querySelector('#guest-files')).toBeNull();
  });

  it('presents unavailable assignment and invalid return-link errors without class access', () => {
    page.assignment = null; page.error = 'Assignment unavailable.'; fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('Unable to open this assignment');
    Object.assign(page, { submissionId: 'submission-a', error: 'This link is invalid or has expired.' });
    fixture.detectChanges();
    expect(text(fixture.nativeElement)).toContain('This feedback link is unavailable');
    expect(fixture.nativeElement.querySelector('#guest-files')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-assignment-qr-redirect')).toBeNull();
  });
});
