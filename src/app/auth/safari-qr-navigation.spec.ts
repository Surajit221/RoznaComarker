import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router, RouterStateSnapshot, ParamMap } from '@angular/router';
import { of, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { JoinIntentService } from '../services/join-intent.service';
import { PostAuthNavigationService } from './post-auth-navigation.service';
import { RoleSelectionGuard } from './role-selection.guard';
import { AlertService } from '../services/alert.service';
import { SubscriptionApiService } from '../api/subscription-api.service';
import { LoginPages } from '../pages/auth/login-pages/login-pages';
import { VerifyEmail } from '../pages/auth/verify-email/verify-email';
import { SelectRole } from '../pages/auth/select-role/select-role';
import { JoinClassLinkPages } from '../pages/students/join-class-link-pages/join-class-link-pages';
import { QrClassJoinService } from '../services/qr-class-join.service';
import { MembershipApiService, JoinClassResponse } from '../api/membership-api.service';

const qr = '/student/join-class?joinCode=ABC123&assignmentId=assignment-1';
describe('QR login/verification/role handoff', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;
  let route: { snapshot: { queryParamMap: ReturnType<typeof convertToParamMap>; queryParams: Record<string, string>; fragment: null }; queryParamMap: Observable<ParamMap> };
  beforeEach(async () => {
    spyOn(console, 'info');
    auth = jasmine.createSpyObj<AuthService>('auth', ['ensureQrBackendSession', 'isQrSessionCurrent', 'getBackendJwt', 'getBackendRole',
      'completeGoogleRedirectIfPresent', 'pendingVerificationEmail', 'completeEmailVerification', 'loginWithEmail', 'setMyRole', 'logout', 'signupWithEmail', 'resendVerificationEmail']);
    auth.getBackendJwt.and.returnValue(null); auth.ensureQrBackendSession.and.resolveTo({ state: 'anonymous' });
    auth.completeGoogleRedirectIfPresent.and.resolveTo(null); auth.pendingVerificationEmail.and.resolveTo('student@example.test');
    auth.isQrSessionCurrent.and.returnValue(true);
    route = { snapshot: { queryParamMap: convertToParamMap({ returnUrl: qr }), queryParams: { returnUrl: qr }, fragment: null }, queryParamMap: of(convertToParamMap({ returnUrl: qr })) };
    await TestBed.configureTestingModule({ imports: [LoginPages, VerifyEmail, SelectRole, JoinClassLinkPages], providers: [
      provideRouter([]), RoleSelectionGuard, { provide: AuthService, useValue: auth }, { provide: ActivatedRoute, useValue: route },
      { provide: AlertService, useValue: { showWarning: jasmine.createSpy(), showError: jasmine.createSpy() } },
      { provide: SubscriptionApiService, useValue: { claimReferral: jasmine.createSpy().and.resolveTo() } },
      { provide: MembershipApiService, useValue: { joinClassByCode: jasmine.createSpy(), getMyMemberships: jasmine.createSpy().and.resolveTo([]) } }
    ] }).compileComponents();
    router = TestBed.inject(Router); spyOn(router, 'navigate').and.resolveTo(true); spyOn(router, 'navigateByUrl').and.resolveTo(true);
    TestBed.inject(JoinIntentService).clear();
  });
  afterEach(() => TestBed.inject(JoinIntentService).clear());
  it('resumes a restored student from login only after QR auth readiness', async () => {
    auth.ensureQrBackendSession.and.resolveTo({ state: 'ready', uid: 'student-user', role: 'student' });
    await TestBed.createComponent(LoginPages).componentInstance.ngOnInit();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith(qr, { replaceUrl: true });
    expect(TestBed.inject(JoinIntentService).peek()).not.toBeNull();
  });
  it('does not let a cached JWT override an anonymous QR restoration result', async () => {
    auth.getBackendJwt.and.returnValue('cached'); auth.getBackendRole.and.returnValue('student');
    await TestBed.createComponent(LoginPages).componentInstance.ngOnInit();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('passes QR intent to verification-email signup and resend without storage dependency', async () => {
    auth.signupWithEmail.and.resolveTo({ verificationRequired: true, email: 'student@example.test' });
    const login = TestBed.createComponent(LoginPages).componentInstance;
    login.loginForm.patchValue({ email: 'student@example.test', password: 'password' }); await login.onSignup();
    expect(auth.signupWithEmail).toHaveBeenCalledOnceWith('student@example.test', 'password', qr);
    auth.resendVerificationEmail.and.resolveTo('student@example.test');
    const verify = TestBed.createComponent(VerifyEmail).componentInstance; await verify.resend(); verify.ngOnDestroy();
    expect(auth.resendVerificationEmail).toHaveBeenCalledOnceWith(qr);
  });
  it('carries the QR URL to verification after password login', async () => {
    auth.loginWithEmail.and.resolveTo({ verificationRequired: true, email: 'student@example.test' });
    const component = TestBed.createComponent(LoginPages).componentInstance;
    component.loginForm.patchValue({ email: 'student@example.test', password: 'password' }); await component.onSubmit();
    expect(router.navigate).toHaveBeenCalledWith(['/verify-email'], { replaceUrl: true, queryParams: { returnUrl: qr }, state: { verificationDeliveryWarning: false } });
  });
  it('survives verification then role selection with denied browser storage and no rescan', async () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    auth.completeEmailVerification.and.resolveTo({ success: true, token: 'jwt', user: { id: 'student-user', email: 'student@example.test', role: null as unknown as string } });
    await TestBed.createComponent(VerifyEmail).componentInstance.checkVerification();
    expect(router.navigate).toHaveBeenCalledWith(['/select-role'], { queryParams: { returnUrl: qr }, replaceUrl: true });
    auth.setMyRole.and.resolveTo({ success: true, token: 'jwt', user: { id: 'student-user', email: 'student@example.test', role: 'student' } });
    const role = TestBed.createComponent(SelectRole).componentInstance; role.selectedRole = 'student'; await role.continue();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith(qr, { replaceUrl: true });
    expect(TestBed.inject(JoinIntentService).peek()?.returnUrl).toBe(qr);
  });
  it('returns to login with the same URL when verification has no restored user', async () => {
    auth.pendingVerificationEmail.and.resolveTo(null);
    await TestBed.createComponent(VerifyEmail).componentInstance.ngOnInit();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true, queryParams: { returnUrl: qr } });
  });
  it('does not send an already-finalized QR student to the dashboard from role selection', async () => {
    auth.ensureQrBackendSession.and.resolveTo({ state: 'ready', uid: 'student-user', role: 'student' });
    const guard = TestBed.inject(RoleSelectionGuard);
    const result = await guard.canActivate(null, { url: '/select-role?returnUrl=' + encodeURIComponent(qr) } as RouterStateSnapshot);
    expect(router.serializeUrl(result as ReturnType<Router['parseUrl']>)).toBe(qr);
  });
  it('honors the explicit URL over a different stored QR intent', async () => {
    TestBed.inject(JoinIntentService).setJoinClassIntent('OLD456');
    await TestBed.inject(PostAuthNavigationService).navigate({ role: 'student' }, qr);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith(qr, { replaceUrl: true });
    expect(TestBed.inject(JoinIntentService).peek()?.joinCode).toBe('ABC123');
  });
  it('keeps ordinary non-QR post-login destination unchanged', async () => {
    await TestBed.inject(PostAuthNavigationService).navigate({ role: 'student' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/student/my-classes', { replaceUrl: true });
  });
  it('shares one POST across destroyed/recreated QR components and ignores stale navigation', async () => {
    route.snapshot.queryParams = { joinCode: 'ABC123', assignmentId: 'assignment-1' };
    route.queryParamMap = of(convertToParamMap(route.snapshot.queryParams));
    auth.ensureQrBackendSession.and.resolveTo({ state: 'ready', uid: 'student-user', role: 'student' });
    const api = TestBed.inject(MembershipApiService); let resolve!: (value: JoinClassResponse) => void;
    let begin!: () => void; const started = new Promise<void>(value => begin = value);
    (api.joinClassByCode as jasmine.Spy).and.callFake(() => { begin(); return new Promise<JoinClassResponse>(value => resolve = value); });
    const first = TestBed.createComponent(JoinClassLinkPages); first.detectChanges();
    await started; first.destroy();
    const second = TestBed.createComponent(JoinClassLinkPages); second.detectChanges(); await Promise.resolve();
    expect(api.joinClassByCode).toHaveBeenCalledTimes(1);
    resolve({ class: { _id: 'class-1' }, membership: {} } as JoinClassResponse);
    await second.whenStable();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/student/classroom', 'class-1'], { replaceUrl: true });
  });
  it('leaves a failed join recoverable without starting a navigation/login loop', async () => {
    route.snapshot.queryParams = { joinCode: 'ABC123' }; route.queryParamMap = of(convertToParamMap(route.snapshot.queryParams));
    spyOn(TestBed.inject(QrClassJoinService), 'run').and.rejectWith(new Error('network'));
    const fixture = TestBed.createComponent(JoinClassLinkPages); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
