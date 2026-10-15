import { MembershipApiService } from '../api/membership-api.service';
import { CacheService } from '../services/cache.service';
import { QR_JOIN_AUTH_RECOVERY } from './qr-join-context';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideRouter, RouterStateSnapshot } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { HTTP_INTERCEPTORS, HttpContext, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { StudentGuard } from './student.guard';
import { JwtInterceptor } from './jwt.interceptor';
import { AuthErrorInterceptor } from './auth-error.interceptor';
import { clearPrivateAuthStorage } from './backend-token.util';
import { QrClassJoinService, QrJoinResult } from '../services/qr-class-join.service';
import { JoinIntentService } from '../services/join-intent.service';
import { environment } from '../../environments/environment';

const qr = '/student/join-class?joinCode=ABC123&source=camera';
function token(id: string): string { return 'e30.' + btoa(JSON.stringify({ role: 'student', exp: Date.now() / 1000 + 3600, jti: id })) + '.sig'; }

describe('QR real guard/auth/token/interceptor/membership pipeline', () => {
  for (const deniedStorage of [false, true]) {
    it('restores and joins with ' + (deniedStorage ? 'Safari storage denied and one auth retry' : 'normal Chrome storage'), fakeAsync(() => {
      clearPrivateAuthStorage(); spyOn(console, 'info');
      let ready!: () => void;
      const firebaseUser = { uid: 'firebase-user', emailVerified: true, getIdToken: jasmine.createSpy().and.resolveTo('firebase-id-token') };
      const sdk = { currentUser: firebaseUser, authStateReady: () => new Promise<void>(resolve => ready = resolve) };
      // Once restoration completes, subsequent readiness checks resolve immediately.
      const restoration = new Promise<void>(resolve => ready = resolve);
      sdk.authStateReady = () => restoration;
      if (deniedStorage) {
        spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
        spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');
        spyOn(Storage.prototype, 'removeItem').and.throwError('SecurityError');
      }
      TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        AuthService, StudentGuard, { provide: Auth, useValue: sdk },
        { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: AuthErrorInterceptor, multi: true }
      ] });
      const http = TestBed.inject(HttpTestingController), intents = TestBed.inject(JoinIntentService); intents.clear();
      const auth = TestBed.inject(AuthService), logout = spyOn(auth, 'logout').and.resolveTo();
      let result: QrJoinResult | undefined;
      Promise.resolve(TestBed.inject(StudentGuard).canActivate(null, { url: qr } as RouterStateSnapshot)).then(allowed => {
        expect(allowed).toBeTrue(); return TestBed.inject(QrClassJoinService).run(qr);
      }).then(value => result = value);
      flushMicrotasks(); http.expectNone(environment.apiUrl + '/memberships/join');
      ready(); flushMicrotasks();
      const exchange = http.expectOne(environment.apiUrl + '/auth/login');
      expect(exchange.request.headers.get('Authorization')).toBe('Bearer firebase-id-token');
      const initial = token('first'); exchange.flush({ success: true, token: initial }); flushMicrotasks();
      const mine = http.expectOne(environment.apiUrl + '/memberships/mine');
      expect(mine.request.headers.get('Authorization')).toBe('Bearer ' + initial); mine.flush({ success: true, data: [] }); flushMicrotasks();
      let join = http.expectOne(environment.apiUrl + '/memberships/join');
      expect(join.request.body).toEqual({ joinCode: 'ABC123' }); expect(join.request.headers.get('Authorization')).toBe('Bearer ' + initial);
      if (deniedStorage) {
        join.flush({ code: 'AUTH_EXPIRED' }, { status: 401, statusText: 'Unauthorized' }); flushMicrotasks();
        expect(logout).not.toHaveBeenCalled(); expect(firebaseUser.getIdToken).toHaveBeenCalledWith(true);
        const refresh = http.expectOne(environment.apiUrl + '/auth/login'), renewed = token('renewed');
        refresh.flush({ success: true, token: renewed }); flushMicrotasks();
        join = http.expectOne(environment.apiUrl + '/memberships/join'); expect(join.request.headers.get('Authorization')).toBe('Bearer ' + renewed);
      }
      join.flush({ success: true, data: { class: { _id: 'class-1' } } }); flushMicrotasks();
      expect(result).toEqual({ state: 'joined', classId: 'class-1' }); expect(intents.peek()).toBeNull(); expect(logout).not.toHaveBeenCalled();
      http.verify(); clearPrivateAuthStorage();
    }));
  }
  it('does not publish a late QR membership response into another screen or account shared cache', fakeAsync(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const cache = TestBed.inject(CacheService), api = TestBed.inject(MembershipApiService), http = TestBed.inject(HttpTestingController);
    cache.set('my-memberships', []); const write = spyOn(cache, 'set').and.callThrough();
    void api.getMyMemberships(true, new HttpContext().set(QR_JOIN_AUTH_RECOVERY, true));
    http.expectOne(environment.apiUrl + '/memberships/mine').flush({ success: true, data: [{ class: { _id: 'old-account-class' } }] });
    flushMicrotasks(); expect(write).not.toHaveBeenCalled(); expect(cache.get('my-memberships')).toBeNull(); http.verify();
  }));

});
