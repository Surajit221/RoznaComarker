import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService } from '../services/alert.service';
import { JoinIntentService } from '../services/join-intent.service';

export type FinalizedRole = 'teacher' | 'student' | 'admin';

@Injectable({ providedIn: 'root' })
export class PostAuthNavigationService {
  constructor(
    private router: Router,
    private zone: NgZone,
    private joinIntent: JoinIntentService,
    private alert: AlertService
  ) {}

  isFinalizedRole(role: unknown): role is FinalizedRole {
    return role === 'teacher' || role === 'student' || role === 'admin';
  }

  defaultDestination(role: FinalizedRole): string {
    if (role === 'teacher') return '/teacher/my-classes';
    if (role === 'student') return '/student/my-classes';
    return '/';
  }

  async navigate(user: { role?: unknown } | null | undefined, returnUrl?: string | null): Promise<boolean> {
    const role = user?.role;
    if (!this.isFinalizedRole(role)) {
      const redirect = this.sanitizeReturnUrl(returnUrl);
      if (redirect) this.storeReturnUrl(redirect);
      return this.safeNavigate('/select-role');
    }

    const intent = this.joinIntent.consume();
    if (intent?.type === 'JOIN_CLASS') {
      if (role === 'student') {
        return this.zone.run(() => this.router.navigate(['/student/join-class'], {
          queryParams: { joinCode: intent.joinCode }, replaceUrl: true
        }));
      }
      this.alert.showWarning('Student access required', 'Please log in as a Student to join a class.');
    }

    const redirect = this.sanitizeReturnUrl(returnUrl || this.readStoredReturnUrl());
    this.clearStoredReturnUrl();
    const destination = redirect && this.isAllowedForRole(redirect, role)
      ? redirect
      : this.defaultDestination(role);
    return this.safeNavigate(destination);
  }

  sanitizeReturnUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const url = value.trim();
    if (!url.startsWith('/') || url.startsWith('//')) return null;
    if (/^\/(login|register|select-role)(?:[/?#]|$)/.test(url)) return null;
    return url;
  }

  private isAllowedForRole(url: string, role: FinalizedRole): boolean {
    if (url.startsWith('/teacher')) return role === 'teacher';
    if (url.startsWith('/student')) return role === 'student';
    if (url.startsWith('/checkout') || url.startsWith('/worksheets')) return role === 'teacher';
    return true;
  }

  private readStoredReturnUrl(): string | null {
    try { return localStorage.getItem('post_login_redirect'); } catch { return null; }
  }

  private storeReturnUrl(url: string): void {
    try { localStorage.setItem('post_login_redirect', url); } catch { /* ignore */ }
  }

  private clearStoredReturnUrl(): void {
    try { localStorage.removeItem('post_login_redirect'); } catch { /* ignore */ }
  }

  private safeNavigate(url: string): Promise<boolean> {
    return this.zone.run(() => this.router.navigateByUrl(url, { replaceUrl: true }));
  }
}
