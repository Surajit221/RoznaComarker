import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceService } from '../../../services/device.service';
import { AuthService } from '../../../auth/auth.service';
import { JoinIntentService } from '../../../services/join-intent.service';

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
    private route: ActivatedRoute,
    private auth: AuthService,
    private joinIntent: JoinIntentService
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

    const redirect = this.getPostLoginRedirect();
    this.clearPostLoginRedirect();

    if (redirect) {
      this.router.navigateByUrl(redirect);
      return;
    }

    this.navigateByRole(role);
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
      this.navigateAfterLogin(role);
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
      this.navigateAfterLogin(role);
    } catch (err: any) {
      this.alert.showError('Google login failed', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }
}
