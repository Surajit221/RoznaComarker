import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import { Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-login-pages',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-pages.html',
  styleUrl: './login-pages.css',
})
export class LoginPages {
  loginForm: FormGroup;
  showPassword = false;
  device = inject(DeviceService);
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private alert: AlertService,
    private router: Router,
    private auth: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['', Validators.required],
      remember: [false],
    });
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  private getSelectedRole(): 'teacher' | 'student' | null {
    const role = this.loginForm.value.role;
    if (role === 'teacher' || role === 'student') return role;
    return null;
  }

  private navigateByRole(role: 'teacher' | 'student') {
    if (role === 'student') {
      this.router.navigate(['/student/my-classes']);
    } else {
      this.router.navigate(['/teacher/my-classes']);
    }
  }

  async onSubmit() {
    if (this.isLoading) return;
    if (this.loginForm.invalid) return;

    const role = this.getSelectedRole();
    if (!role) return;

    const email = this.loginForm.value.email;
    const password = this.loginForm.value.password;

    this.isLoading = true;
    try {
      const resp = await this.auth.loginWithEmail(email, password);
      const backendRole = resp?.user?.role;
      if (backendRole !== role) {
        await this.auth.setMyRole(role);
      }
      this.navigateByRole(role);
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
      this.navigateByRole(role);
    } catch (err: any) {
      this.alert.showError('Signup failed', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onGoogleLogin() {
    if (this.isLoading) return;

    const role = this.getSelectedRole();
    if (!role) {
      this.alert.showWarning('Select role', 'Please select Teacher or Student before continuing.');
      return;
    }

    this.isLoading = true;
    try {
      const resp = await this.auth.loginWithGoogle();
      const backendRole = resp?.user?.role;
      if (backendRole !== role) {
        await this.auth.setMyRole(role);
      }
      this.navigateByRole(role);
    } catch (err: any) {
      this.alert.showError('Google login failed', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }
}
