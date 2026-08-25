import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { authErrorMessage } from '../../../auth/auth-error.util';

@Component({ selector: 'app-verify-email', imports: [CommonModule],
  templateUrl: './verify-email.html', styleUrl: './verify-email.css' })
export class VerifyEmail implements OnInit, OnDestroy {
  email = '';
  checking = false;
  resending = false;
  cooldown = 0;
  message = '';
  error = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private auth: AuthService, private postAuth: PostAuthNavigationService,
    private router: Router) {}

  async ngOnInit(): Promise<void> {
    const email = await this.auth.pendingVerificationEmail();
    if (!email) {
      await this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }
    this.email = email;
    if (history.state?.verificationDeliveryWarning) {
      this.error = "Your account was created, but we couldn't send the verification email right now. Please use Resend Verification.";
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get maskedEmail(): string {
    const [name, domain] = this.email.split('@');
    if (!name || !domain) return this.email;
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  }

  async checkVerification(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    this.message = '';
    this.error = '';
    try {
      const response = await this.auth.completeEmailVerification();
      if (!response) {
        this.error = 'Your email is not verified yet. Please open the link we sent and try again.';
        return;
      }
      await this.postAuth.navigate(response.user);
    } catch (err: any) {
      if (err?.code === 'auth/no-current-user' || err?.status === 401) {
        await this.router.navigate(['/login'], { replaceUrl: true });
      } else {
        this.error = authErrorMessage(err, 'verification');
      }
    } finally { this.checking = false; }
  }

  async resend(): Promise<void> {
    if (this.resending || this.cooldown > 0) return;
    this.resending = true;
    this.message = '';
    this.error = '';
    try {
      await this.auth.resendVerificationEmail();
      this.message = 'A new verification email has been sent.';
      this.cooldown = 60;
      this.startCooldown();
    } catch (err: any) {
      if (err?.code === 'auth/no-current-user') await this.router.navigate(['/login'], { replaceUrl: true });
      else this.error = authErrorMessage(err, 'verification');
    } finally { this.resending = false; }
  }

  async backToLogin(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login'], { replaceUrl: true });
  }

  private startCooldown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.cooldown > 0) this.cooldown--;
      if (this.cooldown === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    }, 1000);
  }

}
