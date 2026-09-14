import { HttpErrorResponse, HttpHandler, HttpHeaders, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AuthErrorInterceptor } from './auth-error.interceptor';

describe('AuthErrorInterceptor backend boundary', () => {
  let interceptor: AuthErrorInterceptor;
  let logout: jasmine.Spy;
  let navigate: jasmine.Spy;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('backend_jwt', 'current-token');
    logout = jasmine.createSpy().and.resolveTo();
    navigate = jasmine.createSpy().and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [AuthErrorInterceptor,
      { provide: AuthService, useValue: { logout } },
      { provide: Router, useValue: { url: '/student/submission', navigate,
        routerState: { snapshot: { root: { routeConfig: { canActivate: [{}] } } } } } }
    ] });
    interceptor = TestBed.inject(AuthErrorInterceptor);
  });

  async function reject(url: string, status: number, code: string): Promise<void> {
    const request = new HttpRequest('GET', url, { headers: new HttpHeaders({ Authorization: 'Bearer current-token' }) });
    const response = new HttpErrorResponse({ status, error: { code }, url });
    const handler: HttpHandler = { handle: () => throwError(() => response) };
    interceptor.intercept(request, handler).subscribe({ error: () => undefined });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  }

  it('logs out once for AUTH_EXPIRED from a private file request', async () => {
    await reject(`${environment.backendUrl}/files/submissions/a.jpg`, 401, 'AUTH_EXPIRED');
    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { redirect: '/student/submission' } });
  });

  it('handles AUTH_INVALID from an API request', async () => {
    await reject(`${environment.backendUrl}/api/users/me`, 401, 'AUTH_INVALID');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('ignores non-auth failures, external 401s, public assets, and AUTH_REQUIRED', async () => {
    for (const [url, status, code] of [
      [`${environment.backendUrl}/api/users/me`, 403, 'FORBIDDEN'],
      [`${environment.backendUrl}/api/users/me`, 404, 'NOT_FOUND'],
      [`${environment.backendUrl}/api/users/me`, 503, 'AUTH_UNAVAILABLE'],
      ['https://example.com/api/users/me', 401, 'AUTH_EXPIRED'],
      [`${environment.backendUrl}/uploads/avatars/a.jpg`, 401, 'AUTH_EXPIRED'],
      [`${environment.backendUrl}/api/auth/login`, 401, 'AUTH_INVALID'],
      [`${environment.backendUrl}/api/users/me`, 401, 'AUTH_REQUIRED']
    ] as const) await reject(url, status, code);
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('prevents simultaneous invalid responses from creating a logout storm', async () => {
    const first = reject(`${environment.backendUrl}/files/submissions/a.jpg`, 401, 'AUTH_EXPIRED');
    const second = reject(`${environment.backendUrl}/api/users/me`, 401, 'AUTH_INVALID');
    await Promise.all([first, second]);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
