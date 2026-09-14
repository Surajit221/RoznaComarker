import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { classifyBackendRequest } from './backend-request.util';

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private handling = false;
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(catchError((err: unknown) => {
      const sent = req.headers.get('Authorization')?.replace(/^Bearer /, '');
      const backend = classifyBackendRequest(req.url);
      const invalid = err instanceof HttpErrorResponse && err.status === 401 && ['AUTH_INVALID','AUTH_EXPIRED'].includes(err.error?.code);
      const authEndpoint = backend.pathname === '/api/auth' || backend.pathname?.startsWith('/api/auth/');
      if (backend.access === 'authenticated' && invalid && sent && sent === localStorage.getItem('backend_jwt')
        && !authEndpoint && !this.handling) {
        this.handling = true;
        const attemptedUrl = this.router.url;
        let route = this.router.routerState.snapshot.root; let guarded = false;
        while (route) { guarded ||= Boolean(route.routeConfig?.canActivate?.length || route.routeConfig?.canActivateChild?.length); if (!route.firstChild) break; route = route.firstChild; }
        void this.auth.logout().catch(() => undefined).then(async () => {
          if (guarded) await this.router.navigate(['/login'], { queryParams: { redirect: attemptedUrl } });
        }).finally(() => { this.handling = false; });
      }
      return throwError(() => err);
    }));
  }
}
