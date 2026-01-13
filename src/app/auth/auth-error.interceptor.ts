import { Injectable, inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable()
export class AuthErrorInterceptor implements HttpInterceptor {
  private router = inject(Router);
  private auth = inject(AuthService);

  private isHandlingAuthError = false;

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof HttpErrorResponse)) {
          return throwError(() => err);
        }

        const isAuthEndpoint = req.url.includes('/api/auth/login');
        if (isAuthEndpoint) {
          return throwError(() => err);
        }

        if ((err.status === 401 || err.status === 403) && !this.isHandlingAuthError) {
          this.isHandlingAuthError = true;
          Promise.resolve()
            .then(() => this.auth.logout())
            .finally(() => {
              this.isHandlingAuthError = false;
              this.router.navigate(['/login']);
            });
        }

        return throwError(() => err);
      })
    );
  }
}
