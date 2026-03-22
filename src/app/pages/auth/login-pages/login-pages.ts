import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import { ActivatedRoute, Router } from '@angular/router';
import { NgZone } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import { AuthService } from '../../../auth/auth.service';
import { JoinIntentService } from '../../../services/join-intent.service';

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

@Component({
  selector: 'app-login-pages',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-pages.html',
  styleUrl: './login-pages.css',
})
export class LoginPages implements OnInit {
  loginForm: FormGroup;
  showPassword = false;
  device = inject(DeviceService);
  isLoading = false;
  private readonly preferredRoleKey = 'preferred_role';

  constructor(
    private fb: FormBuilder,
    private alert: AlertService,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private joinIntent: JoinIntentService,
    private zone: NgZone
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['', Validators.required],
      remember: [false],
    });
  }

  async ngOnInit() {
    try {
      // If the user is already authenticated and somehow reached /login, immediately send them away.
      // This also fixes the "URL changes but UI stays on login" symptom when navigation happens
      // outside Angular's zone (common with some auth SDK promise chains).
      this.redirectIfAlreadyLoggedIn();

      const resp = await this.auth.completeGoogleRedirectIfPresent();
      if (!resp) return;

      const role = this.getSelectedRole() || this.getPreferredRole();
      const backendRole = resp?.user?.role;
      if (!role) {
        this.alert.showWarning('Select role', 'Please select Teacher or Student to continue.');
        return;
      }

      if (backendRole !== role) {
        try {
          await this.auth.setMyRole(role);
          this.setPreferredRole(null);
          this.navigateAfterLogin(role);
          return;
        } catch {
          await this.auth.logout();
          if (backendRole === 'teacher' || backendRole === 'student') {
            this.loginForm.patchValue({ role: backendRole });
          }
          this.alert.showError(
            'Role mismatch',
            `This account is registered as ${backendRole || 'a different role'}. Please select the correct role and try again.`
          );
          return;
        }
      }

      this.setPreferredRole(null);
      this.navigateAfterLogin(role);
    } catch (err: any) {
      this.alert.showError('Google login failed', err?.message || 'Please try again');
    }
  }

  private redirectIfAlreadyLoggedIn() {
    const token = (() => {
      try {
        return localStorage.getItem('backend_jwt');
      } catch {
        return null;
      }
    })();
    if (!token) return;

    const payload = decodeJwtPayload(token);
    const role = payload?.role === 'teacher' || payload?.role === 'student' ? payload.role : null;
    if (!role) return;

    // Prefer query-param redirect (e.g. /login?redirect=/student/my-classes)
    // then stored localStorage redirect.
    const redirect = this.getPostLoginRedirect();
    if (redirect) {
      this.clearPostLoginRedirect();
      void this.safeNavigateByUrl(redirect);
      return;
    }

    void this.safeNavigateByUrl(role === 'student' ? '/student/my-classes' : '/teacher/my-classes');
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  private getSelectedRole(): 'teacher' | 'student' | null {
    const role = this.loginForm.value.role;
    if (role === 'teacher' || role === 'student') return role;
    return null;
  }

  private setPreferredRole(role: 'teacher' | 'student' | null) {
    try {
      if (!role) {
        localStorage.removeItem(this.preferredRoleKey);
        return;
      }
      localStorage.setItem(this.preferredRoleKey, role);
    } catch {
    }
  }

  private getPreferredRole(): 'teacher' | 'student' | null {
    try {
      const role = localStorage.getItem(this.preferredRoleKey);
      if (role === 'teacher' || role === 'student') return role;
      return null;
    } catch {
      return null;
    }
  }

  private resolveBackendRole(role: unknown): 'teacher' | 'student' | null {
    if (role === 'teacher' || role === 'student') return role;
    return null;
  }

  private resolvePostLoginRole(preferred: 'teacher' | 'student' | null, backendRole: unknown): 'teacher' | 'student' | null {
    const resolved = this.resolveBackendRole(backendRole);
    if (resolved) return resolved;
    return preferred;
  }

  private navigateByRole(role: 'teacher' | 'student') {
    if (role === 'student') {
      this.router.navigate(['/student/my-classes']);
    } else {
      this.router.navigate(['/teacher/my-classes']);
    }
  }

  private async safeNavigateByUrl(url: string) {
    // Run navigation inside Angular zone to ensure view updates.
    // Also handle "same URL" navigations (Angular won't re-run guards/resolvers by default).
    const current = this.router.url;

    return this.zone.run(async () => {
      if (current === url) {
        await this.router.navigateByUrl('/', { skipLocationChange: true });
      }
      return this.router.navigateByUrl(url, { replaceUrl: true });
    });
  }

  private getPostLoginRedirect(): string | null {
    const fromQuery = this.route.snapshot.queryParamMap.get('redirect');
    const fromStorage = (() => {
      try {
        return localStorage.getItem('post_login_redirect');
      } catch {
        return null;
      }
    })();

    const redirect = (fromQuery || fromStorage || '').trim();
    if (!redirect) return null;

    // Only allow internal absolute paths. Prevent open redirects and accidental loops.
    if (!redirect.startsWith('/')) return null;
    if (redirect.startsWith('//')) return null;
    if (redirect.startsWith('/login') || redirect.startsWith('/register')) return null;

    return redirect;
  }

  private clearPostLoginRedirect() {
    try {
      localStorage.removeItem('post_login_redirect');
    } catch {
      // ignore
    }
  }

  private navigateAfterLogin(role: 'teacher' | 'student') {
    const intent = this.joinIntent.consume();
    if (intent && intent.type === 'JOIN_CLASS') {
      // Ensure we never try to join as teacher.
      if (role !== 'student') {
        this.alert.showWarning('Student access required', 'Please log in as a Student to join a class.');
        this.navigateByRole(role);
        return;
      }

      this.router.navigate(['/student/join-class'], {
        queryParams: { joinCode: intent.joinCode },
      });
      return;
    }

    // Prefer redirect query-param/localStorage captured by guards.
    // This is required to send the user back to the originally requested page.
    const redirect = this.getPostLoginRedirect();
    this.clearPostLoginRedirect();

    if (redirect) {
      // Basic role-aware safety: if someone logs in as student but redirect points to /teacher/*,
      // ignore it and go to the correct dashboard.
      if (role === 'student' && redirect.startsWith('/teacher')) {
        void this.safeNavigateByUrl('/student/my-classes');
        return;
      }
      if (role === 'teacher' && redirect.startsWith('/student')) {
        void this.safeNavigateByUrl('/teacher/my-classes');
        return;
      }

      void this.safeNavigateByUrl(redirect);
      return;
    }

    // Fallback: role dashboard.
    void this.safeNavigateByUrl(role === 'student' ? '/student/my-classes' : '/teacher/my-classes');
  }

  async onSubmit() {
    if (this.isLoading) return;
    if (this.loginForm.invalid) return;

    const selectedRole = this.getSelectedRole();
    if (!selectedRole) return;

    const email = this.loginForm.value.email;
    const password = this.loginForm.value.password;

    this.isLoading = true;
    try {
      const resp = await this.auth.loginWithEmail(email, password);
      const backendRole = resp?.user?.role;

      const resolvedRole = this.resolvePostLoginRole(selectedRole, backendRole);
      if (!resolvedRole) {
        this.alert.showError('Login failed', 'Unable to determine account role.');
        return;
      }

      if (this.resolveBackendRole(backendRole) && backendRole !== selectedRole) {
        this.loginForm.patchValue({ role: resolvedRole });
        this.alert.showWarning('Role updated', `You logged in as ${resolvedRole}. Redirecting to your dashboard.`);
      }

      this.navigateAfterLogin(resolvedRole);
    } catch (err: any) {
      this.alert.showError('Login failed', err?.message || 'Please check your credentials and try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onSignup() {
    if (this.isLoading) return;
    if (this.loginForm.invalid) return;

    const role = this.getSelectedRole();
    if (!role) return;

    const email = this.loginForm.value.email;
    const password = this.loginForm.value.password;

    this.isLoading = true;
    try {
      const resp = await this.auth.signupWithEmail(email, password);
      const backendRole = resp?.user?.role;
      if (backendRole !== role) {
        await this.auth.setMyRole(role);
      }
      this.navigateAfterLogin(role);
    } catch (err: any) {
      this.alert.showError('Signup failed', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onGoogleLogin() {
    if (this.isLoading) return;

    const selectedRole = this.getSelectedRole();
    if (!selectedRole) {
      this.alert.showWarning('Select role', 'Please select Teacher or Student before continuing.');
      return;
    }

    this.setPreferredRole(selectedRole);

    this.isLoading = true;
    try {
      const resp = await this.auth.loginWithGoogle();
      const backendRole = resp?.user?.role;

      const normalizedBackendRole = this.resolveBackendRole(backendRole);
      if (normalizedBackendRole && normalizedBackendRole !== selectedRole) {
        try {
          await this.auth.setMyRole(selectedRole);
        } catch {
          await this.auth.logout();
          this.alert.showError(
            'Role mismatch',
            `This account is registered as ${normalizedBackendRole}. Please select the correct role and try again.`
          );
          return;
        }
      }

      this.setPreferredRole(null);
      this.navigateAfterLogin(selectedRole);
    } catch (err: any) {
      const raw = String(err?.message || err?.code || err || '');
      if (raw.toLowerCase().includes('cross-origin-opener-policy') || raw.toLowerCase().includes('window.close')) {
        try {
          await this.auth.startGoogleRedirect();
          return;
        } catch (e: any) {
          this.alert.showError('Google login failed', e?.message || 'Please try again');
          return;
        }
      }

      this.alert.showError('Google login failed', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }
}
