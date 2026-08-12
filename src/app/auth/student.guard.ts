import { Injectable } from '@angular/core';
import { CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { JoinIntentService } from '../services/join-intent.service';
import { decodeBackendJwt, readUsableBackendJwt } from './backend-token.util';

@Injectable({ providedIn: 'root' })
export class StudentGuard implements CanActivate {
  constructor(
    private router: Router,
    private joinIntent: JoinIntentService
  ) {}

  canActivate(_route: unknown, state: RouterStateSnapshot): boolean | UrlTree {
    const token = readUsableBackendJwt();
    if (!token) {
      this.captureJoinIntentIfPresent(state.url);
      return this.buildLoginRedirectTree(state.url);
    }

    const payload = decodeBackendJwt(token);
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
