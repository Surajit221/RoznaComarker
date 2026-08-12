import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { decodeBackendJwt, readUsableBackendJwt } from './backend-token.util';

@Injectable({ providedIn: 'root' })
export class TeacherGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    const token = readUsableBackendJwt();
    if (!token) {
      return this.buildLoginRedirectTree(state.url);
    }

    const payload = decodeBackendJwt(token);
    const role = payload && payload.role;

    if (role !== 'teacher') {
      return this.buildLoginRedirectTree(state.url);
    }

    return true;
  }

  private buildLoginRedirectTree(attemptedUrl: string): UrlTree {
    const safeAttemptedUrl = typeof attemptedUrl === 'string' ? attemptedUrl : '';

    if (safeAttemptedUrl && !safeAttemptedUrl.startsWith('/login') && !safeAttemptedUrl.startsWith('/register')) {
      try {
        localStorage.setItem('post_login_redirect', safeAttemptedUrl);
      } catch {
        // ignore storage errors
      }
    }

    return this.router.createUrlTree(['/login'], {
      queryParams: safeAttemptedUrl ? { redirect: safeAttemptedUrl } : undefined,
    });
  }
}
