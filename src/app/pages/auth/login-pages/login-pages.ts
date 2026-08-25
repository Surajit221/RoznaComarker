import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { AlertService } from '../../../services/alert.service';
import { DeviceService } from '../../../services/device.service';
import { AuthErrorContext, authErrorMessage } from '../../../auth/auth-error.util';

@Component({ selector: 'app-login-pages', imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-pages.html', styleUrl: './login-pages.css' })
export class LoginPages implements OnInit {
  loginForm: FormGroup;
  showPassword = false;
  device = inject(DeviceService);
  isLoading = false;
  activeOperation: 'login' | 'signup' | 'google' | null = null;
  showForgotPassword = false;
  forgotEmail = '';
  forgotPasswordLoading = false;
  forgotPasswordMessage = '';
  forgotPasswordError = '';

  constructor(private fb: FormBuilder, private alert: AlertService, private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService, private postAuth: PostAuthNavigationService) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      remember: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      if (this.auth.getBackendJwt()) {
        await this.postAuth.navigate({ role: this.auth.getBackendRole() }, this.returnUrl());
        return;
      }
      const response = await this.auth.completeGoogleRedirectIfPresent();
      if (response) await this.finishAuthentication(response);
    } catch (err: any) {
      this.handleLoginError(err, 'Google sign-in failed', 'google');
    }
  }

  togglePassword(): void { this.showPassword = !this.showPassword; }

  openForgotPassword(): void {
    this.forgotEmail = String(this.loginForm.value.email || '').trim();
    this.forgotPasswordMessage = '';
    this.forgotPasswordError = '';
    this.showForgotPassword = true;
  }

  closeForgotPassword(): void {
    if (!this.forgotPasswordLoading) this.showForgotPassword = false;
  }

  updateForgotEmail(event: Event): void {
    this.forgotEmail = (event.target as HTMLInputElement).value;
  }

  async submitForgotPassword(): Promise<void> {
    if (this.forgotPasswordLoading) return;
    const email = this.forgotEmail.trim().toLowerCase();
    this.forgotPasswordMessage = '';
    this.forgotPasswordError = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.forgotPasswordError = 'Please enter a valid email address.';
      return;
    }
    this.forgotPasswordLoading = true;
    try {
      await this.auth.requestPasswordReset(email);
      this.forgotPasswordMessage = 'If an account supports password sign-in, reset instructions have been sent.';
    } catch (err: any) {
      const code = String(err?.code || err?.error?.code || '');
      if (code === 'auth/invalid-email') this.forgotPasswordError = authErrorMessage(err, 'forgot-password');
      else if (code === 'auth/too-many-requests' || code === 'auth/network-request-failed' || err?.status === 429 || err?.status === 0) {
        this.forgotPasswordError = authErrorMessage(err, 'forgot-password');
      } else this.forgotPasswordMessage = 'If an account supports password sign-in, reset instructions have been sent.';
    } finally {
      this.forgotPasswordLoading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.isLoading || this.loginForm.invalid) return;
    this.isLoading = true;
    this.activeOperation = 'login';
    try {
      const response = await this.auth.loginWithEmail(this.loginForm.value.email, this.loginForm.value.password);
      await this.finishAuthentication(response);
    } catch (err: any) {
      this.handleLoginError(err, 'Login failed', 'login');
    } finally { this.isLoading = false; this.activeOperation = null; }
  }

  async onSignup(): Promise<void> {
    if (this.isLoading || this.loginForm.invalid) return;
    this.isLoading = true;
    this.activeOperation = 'signup';
    try {
      const response = await this.auth.signupWithEmail(this.loginForm.value.email, this.loginForm.value.password);
      await this.finishAuthentication(response);
    } catch (err: any) {
      this.handleLoginError(err, 'Signup failed', 'signup');
    } finally { this.isLoading = false; this.activeOperation = null; }
  }

  async onGoogleLogin(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.activeOperation = 'google';
    try {
      const response = await this.auth.loginWithGoogle();
      await this.finishAuthentication(response);
    } catch (err: any) {
      const raw = String(err?.message || err?.code || err || '').toLowerCase();
      if (raw.includes('cross-origin-opener-policy') || raw.includes('window.close')) {
        try { await this.auth.startGoogleRedirect(); return; }
        catch (redirectError: any) { this.handleLoginError(redirectError, 'Google sign-in failed', 'google'); return; }
      }
      this.handleLoginError(err, 'Google sign-in failed', 'google');
    } finally { this.isLoading = false; this.activeOperation = null; }
  }

  private finishAuthentication(response: { verificationRequired?: boolean; deliveryWarning?: boolean; user?: { role?: unknown } }): Promise<boolean> {
    if (response?.verificationRequired) {
      return this.router.navigate(['/verify-email'], {
        replaceUrl: true,
        state: { verificationDeliveryWarning: response.deliveryWarning === true }
      });
    }
    return this.postAuth.navigate(response?.user, this.returnUrl());
  }

  private returnUrl(): string | null {
    return this.route.snapshot.queryParamMap.get('redirect') || this.route.snapshot.queryParamMap.get('returnUrl');
  }

  private handleLoginError(err: any, title: string, context: AuthErrorContext): void {
    this.alert.showError(title, authErrorMessage(err, context));
  }
}
