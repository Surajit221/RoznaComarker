import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class StudentGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    const token = localStorage.getItem('backend_jwt');
    if (!token) {
      return this.buildLoginRedirectTree(state.url);
    }

    const payload = decodeJwtPayload(token);
    const role = payload && payload.role;

    if (role !== 'student') {
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
