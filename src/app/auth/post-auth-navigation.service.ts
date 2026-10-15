import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService } from '../services/alert.service';
import { JoinIntentService } from '../services/join-intent.service';
import { readStorage, removeStorage, writeStorage } from './safe-browser-storage';
import { isQrJoinUrl, safeInternalReturnUrl } from './safe-return-url';

export type FinalizedRole = 'teacher' | 'student' | 'admin';

@Injectable({ providedIn: 'root' })
export class PostAuthNavigationService {
  constructor(private router: Router, private zone: NgZone, private joinIntent: JoinIntentService,
    private alert: AlertService) {}

  isFinalizedRole(role: unknown): role is FinalizedRole {
    return role === 'teacher' || role === 'student' || role === 'admin';
  }
  defaultDestination(role: FinalizedRole): string {
    return role === 'teacher' ? '/teacher/my-classes' : role === 'student' ? '/student/my-classes' : '/admin/credits';
  }

  async navigate(user: { role?: unknown } | null | undefined, returnUrl?: string | null): Promise<boolean> {
    const role = user?.role;
    // URL intent wins over stale storage, including when Safari storage is denied.
    const explicit = this.sanitizeReturnUrl(returnUrl);
    const intent = this.joinIntent.peek();
    const redirect = explicit || (intent ? this.sanitizeReturnUrl(intent.returnUrl
      || '/student/join-class?joinCode=' + encodeURIComponent(intent.joinCode)) : null)
      || this.sanitizeReturnUrl(readStorage('post_login_redirect'));
    if (redirect && isQrJoinUrl(redirect)) this.joinIntent.captureUrl(redirect);
    if (!this.isFinalizedRole(role)) {
      if (redirect) writeStorage('post_login_redirect', redirect);
      return this.zone.run(() => this.router.navigate(['/select-role'], {
        ...(redirect ? { queryParams: { returnUrl: redirect } } : {}), replaceUrl: true
      }));
    }
    if (redirect && isQrJoinUrl(redirect)) {
      if (role === 'student') return this.safeNavigate(redirect);
      this.alert.showWarning('Student access required', 'Please log in as a Student to join a class.');
    }
    if (!redirect || !isQrJoinUrl(redirect)) removeStorage('post_login_redirect');
    return this.safeNavigate(redirect && this.isAllowedForRole(redirect, role) ? redirect : this.defaultDestination(role));
  }

  sanitizeReturnUrl(value: unknown): string | null { return safeInternalReturnUrl(value); }
  private isAllowedForRole(url: string, role: FinalizedRole): boolean {
    if (/^\/teacher(?:[/?#]|$)/u.test(url)) return role === 'teacher';
    if (/^\/student(?:[/?#]|$)/u.test(url)) return role === 'student';
    if (/^\/admin(?:[/?#]|$)/u.test(url)) return role === 'admin';
    if (url.startsWith('/checkout') || url.startsWith('/worksheets')) return role === 'teacher';
    return true;
  }
  private safeNavigate(url: string): Promise<boolean> {
    return this.zone.run(() => this.router.navigateByUrl(url, { replaceUrl: true }));
  }
}
