import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { JoinIntentService } from '../services/join-intent.service';

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
  constructor(
    private router: Router,
    private joinIntent: JoinIntentService
  ) {}

  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    const token = localStorage.getItem('backend_jwt');
    if (!token) {
      this.captureJoinIntentIfPresent(state.url);
      return this.buildLoginRedirectTree(state.url);
    }

    const payload = decodeJwtPayload(token);
    const role = payload && payload.role;

    if (role !== 'student') {
      this.captureJoinIntentIfPresent(state.url);
      return this.buildLoginRedirectTree(state.url);
    }

    return true;
  }

  private captureJoinIntentIfPresent(attemptedUrl: string) {
    const url = typeof attemptedUrl === 'string' ? attemptedUrl : '';
    if (!url.startsWith('/student/join-class')) return;

    const idx = url.indexOf('?');
    if (idx < 0) return;

    try {
      const params = new URLSearchParams(url.slice(idx + 1));
      const joinCode = (params.get('joinCode') || '').trim();
      if (joinCode) {
        this.joinIntent.setJoinClassIntent(joinCode);
      }
    } catch {
      // ignore
    }
  }

  private buildLoginRedirectTree(attemptedUrl: string): UrlTree {
    const safeAttemptedUrl = typeof attemptedUrl === 'string' ? attemptedUrl : '';

    // Special-case join-by-link: the route is guarded, so storing it as a post-login redirect
    // can cause loops (login -> guarded join -> guard -> login). We store join intent separately.
    const isJoinLink = safeAttemptedUrl.startsWith('/student/join-class');

    if (
      safeAttemptedUrl &&
      !isJoinLink &&
      !safeAttemptedUrl.startsWith('/login') &&
      !safeAttemptedUrl.startsWith('/register')
    ) {
      try {
        localStorage.setItem('post_login_redirect', safeAttemptedUrl);
      } catch {
        // ignore storage errors
      }
    }

    return this.router.createUrlTree(['/login'], {
      queryParams: safeAttemptedUrl && !isJoinLink ? { redirect: safeAttemptedUrl } : undefined,
    });
  }
}
