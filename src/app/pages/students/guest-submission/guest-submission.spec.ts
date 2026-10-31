import { By } from '@angular/platform-browser';
import { UploadEssayForm } from '../my-class-student-pages/detail-my-class-student-pages/upload-essay-form/upload-essay-form';
import { ImageCrop } from '../../../components/image-crop/image-crop';
import { CROP_SOURCE } from '../../../../testing/fixtures/crop-source';
import { MySubmissionPage } from '../my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { GuestStudentAccess } from '../../../services/guest-student-access.service';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { JwtInterceptor } from '../../../auth/jwt.interceptor';
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
    TestBed.configureTestingModule({ providers: [GuestStudentAccess, { provide: GuestSubmissionFeature, useValue: { enabled: () => true, load: () => Promise.resolve(true) } }, provideHttpClient(), provideHttpClientTesting(),
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
  it('blocks anonymous entry when global availability is false without requesting assignment data', async () => {
    spyOn(TestBed.inject(GuestSubmissionFeature), 'load').and.resolveTo(false);
    await page.ngOnInit(); expect(page.guestUnavailable).toBeTrue(); expect(page.loading).toBeFalse();
    http.expectNone(request => request.url.includes('/guest/assignments/'));
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('preserves registered QR access without checking the disabled guest feature', async () => {
    const availability = spyOn(TestBed.inject(GuestSubmissionFeature), 'load').and.resolveTo(false);
    auth.ensureQrBackendSession.and.resolveTo({ state: 'ready', role: 'student' });
    await page.ngOnInit(); expect(page.registered).toBeTrue(); expect(availability).not.toHaveBeenCalled();
    http.expectNone(request => request.url.includes('/guest/'));
  });
  it('blocks saved return links before result/token access when globally disabled', async () => {
    spyOn(TestBed.inject(GuestSubmissionFeature), 'load').and.resolveTo(false);
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, { paramMap: convertToParamMap({ submissionId: 'saved' }), fragment: 'saved-token' });
    const scrub = spyOn(history, 'replaceState'); await page.ngOnInit();
    expect(scrub).toHaveBeenCalled(); expect(page.guestUnavailable).toBeTrue();
    http.expectNone(request => request.url.includes('/guest/submissions/')); expect(router.navigate).not.toHaveBeenCalled();
  });

  it('rechecks auth after delayed guest availability and never renders disabled UI for a restored student', async () => {
    auth.ensureQrBackendSession.and.returnValues(Promise.resolve({state:'anonymous'}),Promise.resolve({state:'ready',role:'student'}));
    spyOn(TestBed.inject(GuestSubmissionFeature),'load').and.resolveTo(false);
    await page.ngOnInit();expect(page.registered).toBeTrue();expect(page.guestUnavailable).toBeFalse();
    http.expectNone(request=>request.url.includes('/guest/assignments/'));
  });
  it('session recovery failure never becomes anonymous guest-disabled', async () => {
    auth.ensureQrBackendSession.and.rejectWith(new Error('offline'));
    await page.ngOnInit();expect(page.guestUnavailable).toBeFalse();expect(page.error).toBeTruthy();
    http.expectNone(request=>request.url.includes('/guest/'));
  });
  it('mobile resume rechecks an unavailable guest page after sign-in in another tab', async () => {
    page.guestUnavailable=true;page.loading=false;
    auth.ensureQrBackendSession.and.resolveTo({state:'ready',role:'student'});
    spyOn(TestBed.inject(GuestSubmissionFeature),'load').and.resolveTo(false);
    await page.recheckEntrySession();expect(page.registered).toBeTrue();expect(page.guestUnavailable).toBeFalse();
  });
  it('loads only public assignment metadata for an anonymous visitor', async () => {
    const pending = page.ngOnInit(); await new Promise<void>(resolve => setTimeout(resolve, 0)); await Promise.resolve();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code`).flush({ data: { title: 'Essay', allowGuestSubmission: true } });
    await pending; expect(page.assignment!.title).toBe('Essay'); expect(page.loading).toBeFalse();
  });
  it('preserves login return behavior when guest submissions are disabled', async () => {
    const pending = page.ngOnInit(); await new Promise<void>(resolve => setTimeout(resolve, 0)); await Promise.resolve();
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
    expect(page.confirmation!.received).toBeTrue();
  });
  it('shows recoverable email-delivery state without losing submission success', async () => {
    page.qrToken = 'share-code'; page.name = 'Student'; page.email = 'student@example.com';
    page.files = [new File(['writing'], 'page.png')];
    const pending = page.submit();
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code/submit`).flush({ data: { received: true, emailSent: false, returnUrl: 'https://school.example/guest/results/id#token' } });
    await pending; expect(page.confirmation!.received).toBeTrue(); expect(page.confirmation!.returnUrl).toContain('#');
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
  it('submits a returning guest draft with the existing capability and no second identity screen', async () => {
    page.revising = true;
    page.access.submissionId = 'submission-a'; page.access.token = 'scoped-token';
    page.files = [new File(['revision'], 'revision.png')];
    const pending = page.submit();
    const req = http.expectOne(`${environment.apiUrl}/guest/submissions/submission-a/revise`);
    expect(req.request.headers.get('X-Guest-Token')).toBe('scoped-token');
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush({ data: { received: true } }); await pending;
    expect(page.confirmation?.received).toBeTrue();
  });
  it('removes a return token from browser history and uses only its scoped header', async () => {
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, { paramMap: convertToParamMap({ submissionId: 'submission-a' }), fragment: 'private-token' });
    const replace = spyOn(history, 'replaceState');
    const pending = page.ngOnInit(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    const req = http.expectOne(`${environment.apiUrl}/guest/submissions/submission-a/presentation`);
    expect(req.request.headers.get('X-Guest-Token')).toBe('private-token');
    expect(req.request.url).not.toContain('private-token'); expect(replace).toHaveBeenCalled();
    req.flush({ data: { assignment: { title: 'Essay' }, submission: {} } });
    await pending; expect(page.result!.title).toBe('Essay');
  });
  it('shows the expired return-link state without navigating into account flows', async () => {
    Object.assign(TestBed.inject(ActivatedRoute).snapshot, { paramMap: convertToParamMap({ submissionId: 'submission-a' }), fragment: 'expired-token' });
    spyOn(history, 'replaceState');
    const pending = page.ngOnInit(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    http.expectOne(`${environment.apiUrl}/guest/submissions/submission-a/presentation`).flush({ message: 'This link has expired. Request a new link.' }, { status: 410, statusText: 'Expired' });
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
    const pending = page.ngOnInit(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    const req = http.expectOne(`${environment.apiUrl}/guest/submissions/507f1f77bcf86cd799439011/presentation`);
    expect(req.request.headers.get('X-Guest-Token')).toBe(token);
    expect(replace.calls.mostRecent().args[2]?.toString()).not.toContain(token);
    req.flush({ data: { assignment: { title: 'Essay' }, submission: {} } }); await pending;
    const refresh = page.loadResults();
    const next = http.expectOne(req.request.url);
    expect(next.request.headers.get('X-Guest-Token')).toBe(token);
    next.flush({ data: { assignment: { title: 'Essay' }, submission: {} } }); await refresh;
    expect(page.result!.title).toBe('Essay'); expect(storage).toHaveBeenCalledTimes(1);
    expect(auth.ensureQrBackendSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('clears displayed feedback and practice when a refreshed link is rejected', async () => {
    page.result = { feedback: { overallScore: 80 } };
    const pending = page.loadResults();
    http.expectOne(`${environment.apiUrl}/guest/submissions//presentation`).flush({ message: 'This link has expired.' }, { status: 410, statusText: 'Expired' });
    await pending;
    expect(page.result).toBeNull(); expect(page.error).toContain('expired');
  });
});

describe('guest assignment page presentation', () => {
  let page: GuestSubmissionPage;
  let fixture: ComponentFixture<GuestSubmissionPage>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GuestSubmissionPage], providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => true, load: () => Promise.resolve(true) } },
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
    fixture.detectChanges(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    http.expectOne(`${environment.apiUrl}/guest/assignments/share-code`).flush({ data: page.assignment });
    await fixture.whenStable(); fixture.detectChanges();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });
  it('renders only the temporary-unavailable message without guest forms', () => {
    page.guestUnavailable = true; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Guest submission is temporarily unavailable');
    expect(fixture.nativeElement.textContent).toContain('Please contact your teacher.');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('uses the shared crop and sends the identical crop through guest checks and final submission', async () => {
    page.name = 'Student'; page.email = 'student@example.com'; page.continueWithIdentity(); fixture.detectChanges();
    const upload = fixture.debugElement.query(By.directive(UploadEssayForm)).componentInstance as UploadEssayForm;
    const original = new File([Uint8Array.from(atob(CROP_SOURCE.original), c => c.charCodeAt(0))], 'page.png', {type:'image/png'});
    const selection = new DataTransfer();selection.items.add(original);
    upload.onFilesSelected({target:{files:selection.files,value:''}} as unknown as Event);
    http.expectNone(req => req.url.includes('image-preflight')); expect(page.uploadReady).toBeFalse();
    upload.openCrop(upload.files[0]); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(ImageCrop)).componentInstance as ImageCrop;
    await editor.photo.nativeElement.decode();editor.onLoad(); editor.rect = {...CROP_SOURCE.rect};
    await editor.apply();fixture.detectChanges();const cropped = upload.files[0].file;
    expect(cropped).not.toBe(original); expect(page.files[0]).toBe(cropped); expect(page.uploadReady).toBeFalse();
    const url = environment.apiUrl+'/guest/assignments/share-code/image-preflight';
    const basic = http.expectOne(url);expect(basic.request.body.get('file')).toBe(cropped);
    basic.flush({success:true,data:{ready:false,checks:[],basicChecksPassed:true,sourceReadRequired:true,sourceReadStatus:'CHECKING',canSubmit:false}});
    expect(page.uploadReady).toBeFalse();
    const source = http.expectOne(url);expect(source.request.body.get('file')).toBe(cropped);
    source.flush({success:true,data:{ready:true,checks:[],sourceReadRequired:true,sourceReadStatus:'PASSED',canSubmit:true}});
    fixture.detectChanges();expect(page.uploadReady).toBeTrue();
    const pending = page.submit();const submit = http.expectOne(environment.apiUrl+'/guest/assignments/share-code/submit');
    expect(submit.request.body.getAll('files')).toEqual([cropped]);submit.flush({data:{received:true}});await pending;
  });
  const text = (element: HTMLElement) => element.textContent || '';

  it('shows safe assignment information and the dedicated submission form with linked labels', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(text(host.querySelector('h1')!)).toBe('A place that matters');
    expect(text(host)).toContain('Guest Submission'); expect(text(host)).toContain(page.assignment!.instructions);
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe(page.assignment!.deadline);
    expect(text(host)).not.toContain('PRIVATE RUBRIC'); expect(text(host)).not.toContain('private@example.com');
    for (const id of ['guest-name', 'guest-email']) {
      expect(host.querySelector(`label[for="${id}"]`)).toBeTruthy(); expect(host.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(text(host)).toContain('Submit your work');
    expect(text(host)).toContain('Your name and email will be shared with your teacher. A private return link will be emailed to you after submission.');
    expect(host.querySelector('app-assignment-qr-redirect')).toBeNull();
    const login = host.querySelector('.account-option a') as HTMLAnchorElement;
    expect(login.textContent).toBe('Sign in'); expect(login.getAttribute('href')).toContain('/login?returnUrl=');
    expect(host.querySelector('.submit-button')?.textContent).toContain('Continue');
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

  it('requires identity before mounting the normal production uploader', () => {
    expect(fixture.nativeElement.querySelector('app-upload-essay-form')).toBeNull();
    page.name = 'Student'; page.email = 'student@example.com'; page.continueWithIdentity();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-upload-essay-form')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#guest-name')).toBeNull();
    expect(page.access.name).toBe('Student');
    expect(page.access.email).toBe('student@example.com');
    expect(page.uploadReady).toBeFalse();
  });

  it('opens the existing image/PDF picker once from the navy upload button without submitting', async () => {
    page.name = 'Student'; page.email = 'student@example.com'; page.continueWithIdentity(); fixture.detectChanges();
    const upload = fixture.debugElement.query(By.directive(UploadEssayForm)).componentInstance as UploadEssayForm;
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.guest-upload-button');
    const picker = spyOn(upload.fileInput.nativeElement, 'click');
    const handler = spyOn(upload, 'openFilePicker').and.callThrough();
    const submit = spyOn(page, 'submit');
    expect(button.textContent).toContain('Upload Image');
    expect(button.type).toBe('button');
    expect(button.classList.contains('btn-info-sm')).toBeTrue();
    expect(button.classList.contains('w-full')).toBeTrue();
    expect(button.querySelector('.bx-image-add')).toBeTruthy();
    expect(button.previousElementSibling?.tagName.toLowerCase()).toBe('app-upload-essay-form');
    expect(upload.fileInput.nativeElement.accept).toContain('application/pdf');
    expect(upload.fileInput.nativeElement.multiple).toBeTrue();
    // A native button synthesizes one click after touch; no separate touch handler.
    button.dispatchEvent(new Event('touchend', { bubbles: true })); button.click();
    await fixture.whenStable();
    expect(handler).toHaveBeenCalledTimes(1); expect(picker).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('input[type=file]').length).toBe(2);
    page.busy = true; fixture.detectChanges(); expect(button.disabled).toBeTrue();
    page.busy = false; upload.files = Array(upload.maxFiles).fill({}); fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    upload.files = [];
  });

  it('shows accessible field validation and request errors without losing the form', async () => {
    const email: HTMLInputElement = fixture.nativeElement.querySelector('#guest-email');
    email.value = 'invalid'; email.dispatchEvent(new Event('input')); email.dispatchEvent(new Event('blur'));
    await fixture.whenStable(); fixture.detectChanges();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture.nativeElement.querySelector('#email-error'))).toContain('valid email');
    page.error = 'An image needs attention. Please check its orientation.'; fixture.detectChanges();
    expect(text(fixture.nativeElement.querySelector('[role="alert"]'))).toContain('orientation');
    expect(fixture.nativeElement.querySelector('#guest-email')).toBeTruthy();
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
    expect((fixture.nativeElement.querySelector('.confirmation a') as HTMLAnchorElement).href).toBe(page.confirmation!.returnUrl!);
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
  it('mounts the normal result component rather than a second guest renderer', () => {
    spyOn(MySubmissionPage.prototype, 'ngOnInit').and.resolveTo();
    page.result = { title: 'Essay' }; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-my-submission-page')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#feedback-title')).toBeNull();
  });
});

describe('registered student opening an assignment QR link', () => {
  const jwtPart = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const jwt = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ id: 'student-1', role: 'student', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  let previousJwt: string | null;

  beforeEach(async () => {
    previousJwt = localStorage.getItem('backend_jwt');
    localStorage.setItem('backend_jwt', jwt);
    await TestBed.configureTestingModule({ imports: [GuestSubmissionPage], providers: [
      { provide: GuestSubmissionFeature, useValue: { enabled: () => true, load: () => Promise.resolve(true) } },
      provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), provideRouter([]),
      { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
      { provide: AuthService, useValue: { ensureQrBackendSession: jasmine.createSpy().and.resolveTo({ state: 'ready', role: 'student' }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ qrToken: 'share-code' }), fragment: null } } },
    ] }).compileComponents();
  });
  afterEach(() => {
    if (previousJwt === null) localStorage.removeItem('backend_jwt'); else localStorage.setItem('backend_jwt', previousJwt);
  });

  it('calls the authenticated QR endpoint with the bearer token instead of the guest stub', async () => {
    const http = TestBed.inject(HttpTestingController);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(GuestSubmissionPage);
    await fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance.registered).toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-assignment-qr-redirect')).toBeTruthy();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const req = http.expectOne(`${environment.apiUrl}/assignments/qr/share-code`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    req.flush({ success: true, data: { _id: 'assignment-1', class: { _id: 'class-1' }, resourceType: 'essay' } });
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(navigate).toHaveBeenCalledWith(['/student/my-classes/detail', 'class-1'], { queryParams: { assignmentId: 'assignment-1' } });
    http.verify(); fixture.destroy();
  });
});
