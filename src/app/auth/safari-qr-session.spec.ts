import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, QrSession } from './auth.service';
import { clearPrivateAuthStorage } from './backend-token.util';
import { environment } from '../../environments/environment';

const jwt = () => 'e30.' + btoa(JSON.stringify({ role: 'student', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.sig';
describe('QR Firebase/backend readiness', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let sdk: { authStateReady: jasmine.Spy; currentUser: { uid: string; emailVerified: boolean; getIdToken: jasmine.Spy } | null };
  beforeEach(() => {
    clearPrivateAuthStorage(); spyOn(console, 'info');
    sdk = { authStateReady: jasmine.createSpy().and.resolveTo(), currentUser: {
      uid: 'firebase-user', emailVerified: true, getIdToken: jasmine.createSpy().and.resolveTo('firebase-token')
    } };
    TestBed.configureTestingModule({ providers: [AuthService, provideHttpClient(), provideHttpClientTesting(), { provide: Auth, useValue: sdk }] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); clearPrivateAuthStorage(); });
  const url = environment.apiUrl + '/auth/login';

  it('waits for restored Firebase user and completed backend exchange, single-flight across callers', fakeAsync(() => {
    let ready!: () => void; sdk.authStateReady.and.returnValue(new Promise<void>(resolve => ready = resolve));
    let result: QrSession | undefined;
    const first = auth.ensureQrBackendSession(); expect(auth.ensureQrBackendSession()).toBe(first);
    first.then(value => result = value); flushMicrotasks();
    expect(result).toBeUndefined(); http.expectNone(url);
    ready(); flushMicrotasks();
    const exchange = http.expectOne(url); expect(exchange.request.headers.get('Authorization')).toBe('Bearer firebase-token');
    expect(result).toBeUndefined(); exchange.flush({ success: true, token: jwt() }); flushMicrotasks();
    expect(result).toEqual({ state: 'ready', uid: 'firebase-user', role: 'student' });
    void auth.ensureQrBackendSession(); flushMicrotasks(); http.expectNone(url);
    expect(sdk.currentUser!.getIdToken).toHaveBeenCalledTimes(1);
  }));
  it('does not trust a cached backend JWT when Firebase resolves signed out', fakeAsync(() => {
    localStorage.setItem('backend_jwt', jwt()); sdk.currentUser = null;
    let state: QrSession | undefined; auth.ensureQrBackendSession().then(value => state = value); flushMicrotasks();
    expect(state).toEqual({ state: 'anonymous' }); expect(auth.getBackendJwt()).toBeNull(); http.expectNone(url);
  }));
  it('does not bypass email verification', fakeAsync(() => {
    sdk.currentUser!.emailVerified = false; let state: QrSession | undefined;
    auth.ensureQrBackendSession().then(value => state = value); flushMicrotasks();
    expect(state).toEqual({ state: 'verification' }); http.expectNone(url);
  }));
  it('refreshes Firebase token and re-exchanges only when QR recovery requests it', fakeAsync(() => {
    void auth.ensureQrBackendSession(); flushMicrotasks(); http.expectOne(url).flush({ success: true, token: jwt() }); flushMicrotasks();
    void auth.ensureQrBackendSession(true); flushMicrotasks(); http.expectOne(url).flush({ success: true, token: jwt() }); flushMicrotasks();
    expect(sdk.currentUser!.getIdToken).toHaveBeenCalledWith(true);
  }));
  it('keeps backend auth usable in memory when Safari storage writes and reads throw', fakeAsync(() => {
    spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
    spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
    spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
    let state: QrSession | undefined; auth.ensureQrBackendSession().then(value => state = value); flushMicrotasks();
    http.expectOne(url).flush({ success: true, token: jwt() }); flushMicrotasks();
    expect(state?.state).toBe('ready'); expect(auth.getBackendRole()).toBe('student');
    clearPrivateAuthStorage(); expect(auth.getBackendJwt()).toBeNull();
  }));
  it('does not persist an exchange completed for a user who signed out meanwhile', fakeAsync(() => {
    let failed = false; auth.ensureQrBackendSession().catch(() => failed = true); flushMicrotasks();
    const exchange = http.expectOne(url); sdk.currentUser = null; exchange.flush({ success: true, token: jwt() }); flushMicrotasks();
    expect(failed).toBeTrue(); expect(auth.getBackendJwt()).toBeNull();
  }));
  it('never treats an old cached JWT as a successful new exchange when its response is malformed', fakeAsync(() => {
    localStorage.setItem('backend_jwt', jwt()); let failed = false;
    auth.ensureQrBackendSession().catch(() => failed = true); flushMicrotasks();
    http.expectOne(url).flush({ success: true }); flushMicrotasks();
    expect(failed).toBeTrue(); expect(auth.getBackendJwt()).toBeNull();
  }));
  it('bounds a stalled Firebase initialization without a timing-based login decision', fakeAsync(() => {
    sdk.authStateReady.and.returnValue(new Promise<void>(() => undefined)); let failed = false;
    auth.ensureQrBackendSession().catch(() => failed = true); tick(29_999); expect(failed).toBeFalse();
    tick(1); flushMicrotasks(); expect(failed).toBeTrue(); http.expectNone(url);
  }));
});
