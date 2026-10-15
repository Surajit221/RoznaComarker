import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterStateSnapshot } from '@angular/router';
import { HttpContext, HttpErrorResponse, HttpHandler, HttpHeaders, HttpRequest } from '@angular/common/http';
import { throwError } from 'rxjs';
import { AuthService, QrSession } from '../auth/auth.service';
import { StudentGuard } from '../auth/student.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AuthErrorInterceptor } from '../auth/auth-error.interceptor';
import { QR_JOIN_AUTH_RECOVERY } from '../auth/qr-join-context';
import { MembershipApiService, JoinClassResponse, BackendMembership } from '../api/membership-api.service';
import { AlertService } from './alert.service';
import { JoinIntentService } from './join-intent.service';
import { QrClassJoinService } from './qr-class-join.service';
import { PostAuthNavigationService } from '../auth/post-auth-navigation.service';
import { authContinuationUrl, safeInternalReturnUrl } from '../auth/safe-return-url';
import { readStorage, removeStorage, writeStorage } from '../auth/safe-browser-storage';
import { environment } from '../../environments/environment';

const qr = '/student/join-class?joinCode=ABC123&assignmentId=a%2Fb&source=camera#join';
const ready: QrSession = { state: 'ready', uid: 'student-user', role: 'student' };
const response = { class: { _id: 'class-1' }, membership: {} } as JoinClassResponse;
const state = (url: string) => ({ url } as RouterStateSnapshot);

describe('Safari QR intent/guard/join contract', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let api: jasmine.SpyObj<MembershipApiService>;
  let intents: JoinIntentService;
  let joins: QrClassJoinService;
  let router: Router;
  beforeEach(() => {
    spyOn(console, 'info');
    auth = jasmine.createSpyObj<AuthService>('auth', ['ensureQrBackendSession', 'isQrSessionCurrent', 'logout']);
    auth.ensureQrBackendSession.and.resolveTo(ready); auth.isQrSessionCurrent.and.returnValue(true);
    api = jasmine.createSpyObj<MembershipApiService>('memberships', ['joinClassByCode', 'getMyMemberships']);
    api.joinClassByCode.and.resolveTo(response); api.getMyMemberships.and.resolveTo([]);
    TestBed.configureTestingModule({ providers: [provideRouter([]), StudentGuard, AuthGuard, AuthErrorInterceptor,
      { provide: AuthService, useValue: auth }, { provide: MembershipApiService, useValue: api },
      { provide: AlertService, useValue: { showWarning: jasmine.createSpy() } }] });
    router = TestBed.inject(Router); spyOn(router, 'navigate').and.resolveTo(true); spyOn(router, 'navigateByUrl').and.resolveTo(true);
    intents = TestBed.inject(JoinIntentService); intents.clear(); joins = TestBed.inject(QrClassJoinService);
  });
  afterEach(() => { intents.clear(); removeStorage('backend_jwt'); removeStorage('post_login_redirect'); });

  function holdJoin() {
    let complete!: (value: JoinClassResponse) => void;
    let begin!: () => void;
    const started = new Promise<void>(resolve => begin = resolve);
    api.joinClassByCode.and.callFake(() => { begin(); return new Promise<JoinClassResponse>(resolve => complete = resolve); });
    return { started, complete: (value: JoinClassResponse) => complete(value) };
  }
  it('joins a restored student once and consumes only after successful response', async () => {
    const held = holdJoin();
    const first = joins.run(qr), second = joins.run(qr), third = joins.run(qr);
    await held.started;
    expect(api.joinClassByCode).toHaveBeenCalledTimes(1); expect(intents.peek()?.joinCode).toBe('ABC123');
    expect(api.joinClassByCode.calls.mostRecent().args[1]?.get(QR_JOIN_AUTH_RECOVERY)).toBeTrue();
    held.complete(response); expect(await first).toEqual({ state: 'joined', classId: 'class-1' }); await Promise.all([second, third]);
    expect(intents.peek()).toBeNull();
  });
  it('waits for restoration instead of sending a student to login early', async () => {
    let resolve!: (value: QrSession) => void;
    auth.ensureQrBackendSession.and.returnValue(new Promise(value => resolve = value));
    const result = TestBed.inject(StudentGuard).canActivate(null, state(qr));
    expect(router.navigate).not.toHaveBeenCalled(); expect(api.joinClassByCode).not.toHaveBeenCalled();
    resolve(ready); expect(await result).toBeTrue();
  });
  it('carries the entire QR URL to login when truly anonymous', async () => {
    auth.ensureQrBackendSession.and.resolveTo({ state: 'anonymous' });
    const result = await TestBed.inject(StudentGuard).canActivate(null, state(qr));
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toContain('returnUrl=');
    expect((result as ReturnType<Router['createUrlTree']>).queryParams['returnUrl']).toBe(qr);
    expect(intents.peek()?.returnUrl).toBe(qr); expect(api.joinClassByCode).not.toHaveBeenCalled();
  });
  it('resumes URL-carried intent after login without consuming it early', async () => {
    await TestBed.inject(PostAuthNavigationService).navigate({ role: 'student' }, qr);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith(qr, { replaceUrl: true });
    expect(intents.peek()?.returnUrl).toBe(qr);
  });
  it('preserves the URL through required student role selection', async () => {
    await TestBed.inject(PostAuthNavigationService).navigate({ role: null }, qr);
    expect(router.navigate).toHaveBeenCalledWith(['/select-role'], { queryParams: { returnUrl: qr }, replaceUrl: true });
    expect(intents.peek()).not.toBeNull();
  });
  for (const session of [{ state: 'verification' } as QrSession, { ...ready, state: 'ready', role: null } as QrSession]) {
    it('requires ' + session.state + ' before posting a QR join', async () => {
      auth.ensureQrBackendSession.and.resolveTo(session);
      await TestBed.inject(StudentGuard).canActivate(null, state(qr));
      expect(api.joinClassByCode).not.toHaveBeenCalled(); expect(intents.peek()).not.toBeNull();
    });
  }
  it('survives both storage areas throwing and still resumes URL intent', async () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    writeStorage('qr-test', 'safe', 'sessionStorage'); expect(readStorage('qr-test', 'sessionStorage')).toBe('safe'); removeStorage('qr-test', 'sessionStorage');
    auth.ensureQrBackendSession.and.resolveTo({ state: 'anonymous' });
    const login = await TestBed.inject(StudentGuard).canActivate(null, state(qr));
    expect((login as ReturnType<Router['createUrlTree']>).queryParams['returnUrl']).toBe(qr);
    intents.clear(); // Simulate loss of all best-effort intent storage during a page reload.
    await TestBed.inject(PostAuthNavigationService).navigate({ role: 'student' }, qr);
    auth.ensureQrBackendSession.and.resolveTo(ready); await joins.run(qr);
    expect(api.joinClassByCode).toHaveBeenCalledTimes(1); expect(intents.peek()).toBeNull();
  });
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    it('handles the ' + area + ' property itself being unavailable', () => {
      spyOnProperty(window, area, 'get').and.throwError('SecurityError');
      writeStorage('qr-unavailable', 'pending', area); expect(readStorage('qr-unavailable', area)).toBe('pending');
      removeStorage('qr-unavailable', area); expect(readStorage('qr-unavailable', area)).toBeNull();
    });
  }
  it('recovers a pending URL after a new intent-service instance (refresh)', () => {
    intents.captureUrl(qr); const restored = new JoinIntentService(); expect(restored.peek()?.returnUrl).toBe(qr);
  });
  it('avoids a repeated POST after success, Back, refresh or another scan when membership is already active', async () => {
    await joins.run(qr);
    api.getMyMemberships.and.resolveTo([{ status: 'active', class: { _id: 'class-1', joinCode: 'ABC123' } } as BackendMembership]);
    await joins.run(qr); expect(api.joinClassByCode).toHaveBeenCalledTimes(1); expect(intents.peek()).toBeNull();
  });
  it('treats the existing ALREADY_JOINED contract as successful completion', async () => {
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 409, error: { code: 'ALREADY_JOINED' } }));
    api.getMyMemberships.and.returnValues(Promise.resolve([]), Promise.resolve([{ status: 'active', class: { _id: 'class-1', joinCode: 'ABC123' } } as BackendMembership]));
    expect(await joins.run(qr)).toEqual({ state: 'joined', classId: 'class-1' }); expect(intents.peek()).toBeNull();
  });
  it('uses the class list rather than inventing a class id if already-joined lookup is unavailable', async () => {
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 409, error: { code: 'ALREADY_JOINED' } }));
    api.getMyMemberships.and.rejectWith(new Error('offline'));
    expect(await joins.run(qr)).toEqual({ state: 'joined', classId: null }); expect(intents.peek()).toBeNull();
  });
  it('recovers a committed join whose response was lost, without another POST', async () => {
    api.getMyMemberships.and.returnValues(Promise.resolve([]), Promise.resolve([{ status: 'active', class: { _id: 'class-1', joinCode: 'ABC123' } } as BackendMembership]));
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 0 }));
    expect(await joins.run(qr)).toEqual({ state: 'joined', classId: 'class-1' });
    expect(api.joinClassByCode).toHaveBeenCalledTimes(1); expect(intents.peek()).toBeNull();
  });
  it('does not invent membership after an ambiguous failure that the server cannot confirm', async () => {
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 500 }));
    await expectAsync(joins.run(qr)).toBeRejected(); expect(api.joinClassByCode).toHaveBeenCalledTimes(1);
    expect(intents.peek()?.returnUrl).toBe(qr);
  });
  it('recovers one auth 401 through a fresh backend exchange before retrying', async () => {
    api.joinClassByCode.and.returnValues(Promise.reject(new HttpErrorResponse({ status: 401 })), Promise.resolve(response));
    expect((await joins.run(qr)).state).toBe('joined'); expect(api.joinClassByCode).toHaveBeenCalledTimes(2);
    expect(auth.ensureQrBackendSession).toHaveBeenCalledWith(true);
  });
  it('does not loop on persistent 401 and keeps intent for an explicit retry', async () => {
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 401 }));
    await expectAsync(joins.run(qr)).toBeRejected(); expect(api.joinClassByCode).toHaveBeenCalledTimes(2);
    expect(intents.peek()?.returnUrl).toBe(qr); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('does not convert a permission/quota 403 into an auth redirect or retry', async () => {
    api.joinClassByCode.and.rejectWith(new HttpErrorResponse({ status: 403, error: { code: 'STUDENT_LIMIT_REACHED' } }));
    await expectAsync(joins.run(qr)).toBeRejected(); expect(api.joinClassByCode).toHaveBeenCalledTimes(1);
    expect(auth.ensureQrBackendSession).not.toHaveBeenCalledWith(true); expect(intents.peek()).not.toBeNull();
  });
  it('does not consume a newer QR intent when an old request succeeds late', async () => {
    const held = holdJoin();
    const old = joins.run(qr); await held.started; intents.captureUrl('/student/join-class?joinCode=NEW456');
    held.complete(response); await old; expect(intents.peek()?.joinCode).toBe('NEW456');
  });
  it('ignores late results after the authenticated principal changes', async () => {
    const held = holdJoin();
    const old = joins.run(qr); await held.started; auth.isQrSessionCurrent.and.returnValue(false);
    held.complete(response); await expectAsync(old).toBeRejected(); expect(intents.peek()).not.toBeNull();
  });
  it('clears corrupt and expired storage without crashing', () => {
    for (const raw of ['{broken', JSON.stringify({ type: 'JOIN_CLASS', joinCode: 'ABC123', createdAt: Date.now() - 25 * 3600_000 })]) {
      writeStorage('join_intent', raw); expect(intents.peek()).toBeNull(); expect(readStorage('join_intent')).toBeNull();
    }
  });
  it('does not run global logout for QR-owned 401s', async () => {
    const request = new HttpRequest('POST', environment.apiUrl + '/memberships/join', {}, {
      headers: new HttpHeaders({ Authorization: 'Bearer current-token' }), context: new HttpContext().set(QR_JOIN_AUTH_RECOVERY, true)
    });
    const handler: HttpHandler = { handle: () => throwError(() => new HttpErrorResponse({ status: 401, error: { code: 'AUTH_EXPIRED' } })) };
    TestBed.inject(AuthErrorInterceptor).intercept(request, handler).subscribe({ error: () => undefined });
    await Promise.resolve(); expect(auth.logout).not.toHaveBeenCalled();
  });
  it('keeps ordinary Chrome/non-QR student and auth-guard decisions unchanged', () => {
    writeStorage('backend_jwt', 'e30.' + btoa(JSON.stringify({ role: 'student', exp: Date.now() / 1000 + 3600 })) + '.sig');
    expect(TestBed.inject(StudentGuard).canActivate(null, state('/student/my-classes'))).toBeTrue();
    expect(TestBed.inject(AuthGuard).canActivate({} as never, state('/student/my-classes'))).toBeTrue();
    expect(auth.ensureQrBackendSession).not.toHaveBeenCalled();
  });
  it('logs state names without the code or full URL', async () => {
    await joins.run(qr); const logs = JSON.stringify((console.info as jasmine.Spy).calls.allArgs());
    expect(logs).toContain('qr_join_succeeded'); expect(logs).not.toContain('ABC123'); expect(logs).not.toContain('assignmentId');
  });
});

describe('QR internal return URL boundary', () => {
  for (const value of ['/%68%74%74%70%73%3a%2f%2fevil.test', '/javascript%3aalert(1)', 'https://evil.test', '//evil.test', 'javascript:alert(1)', 'data:text/html,hello', '%2f%2fevil.test', '/%2f%2fevil.test', '/\\evil.test', '/%5cevil.test', '/%255cevil.test', '/student\n/join-class', '/student/%0djoin', '/login', '/login?returnUrl=/student/join-class', '/register', '/verify-email', '/select-role', '/auth/callback', '/__/auth/handler', '/student/../login', '/student/%252e%252e/login', '/student?x=%zz']) {
    it('rejects ' + JSON.stringify(value), () => expect(safeInternalReturnUrl(value)).toBeNull());
  }
  it('preserves safe class/invite/query/fragment information exactly', () => expect(safeInternalReturnUrl(qr)).toBe(qr));
  it('preserves QR intent in the Firebase verification email continuation URL for a new Safari tab', () => {
    const continuation = new URL(authContinuationUrl('https://comarker.test/', '/verify-email', qr));
    expect(continuation.origin).toBe('https://comarker.test'); expect(continuation.pathname).toBe('/verify-email');
    expect(continuation.searchParams.get('returnUrl')).toBe(qr);
    expect(authContinuationUrl('https://comarker.test', '/verify-email', 'https://evil.test')).toBe('https://comarker.test/verify-email');
  });

});
