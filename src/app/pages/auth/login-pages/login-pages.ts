import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { AlertService } from '../../../services/alert.service';
import { DeviceService } from '../../../services/device.service';

@Component({ selector: 'app-login-pages', imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-pages.html', styleUrl: './login-pages.css' })
export class LoginPages implements OnInit {
  loginForm: FormGroup;
  showPassword = false;
  device = inject(DeviceService);
  isLoading = false;

  constructor(private fb: FormBuilder, private alert: AlertService, private route: ActivatedRoute,
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
      this.handleLoginError(err, 'Google login failed');
    }
  }

  togglePassword(): void { this.showPassword = !this.showPassword; }

  async onSubmit(): Promise<void> {
    if (this.isLoading || this.loginForm.invalid) return;
    this.isLoading = true;
    try {
      const response = await this.auth.loginWithEmail(this.loginForm.value.email, this.loginForm.value.password);
      await this.finishAuthentication(response);
    } catch (err: any) {
      this.handleLoginError(err, 'Login failed');
    } finally { this.isLoading = false; }
  }

  async onSignup(): Promise<void> {
    if (this.isLoading || this.loginForm.invalid) return;
    this.isLoading = true;
    try {
      const response = await this.auth.signupWithEmail(this.loginForm.value.email, this.loginForm.value.password);
      await this.finishAuthentication(response);
    } catch (err: any) {
      this.handleLoginError(err, 'Signup failed');
    } finally { this.isLoading = false; }
  }

  async onGoogleLogin(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const response = await this.auth.loginWithGoogle();
      await this.finishAuthentication(response);
    } catch (err: any) {
      const raw = String(err?.message || err?.code || err || '').toLowerCase();
      if (raw.includes('cross-origin-opener-policy') || raw.includes('window.close')) {
        try { await this.auth.startGoogleRedirect(); return; }
        catch (redirectError: any) { this.handleLoginError(redirectError, 'Google login failed'); return; }
      }
      this.handleLoginError(err, 'Google login failed');
    } finally { this.isLoading = false; }
  }

  private finishAuthentication(response: { user?: { role?: unknown } }): Promise<boolean> {
    return this.postAuth.navigate(response?.user, this.returnUrl());
  }

  private returnUrl(): string | null {
    return this.route.snapshot.queryParamMap.get('redirect') || this.route.snapshot.queryParamMap.get('returnUrl');
  }

  private handleLoginError(err: any, title: string): void {
    this.alert.showError(title, err?.error?.message || err?.message || 'Please try again');
  }
}
