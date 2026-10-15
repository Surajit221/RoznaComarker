import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { authErrorMessage } from '../../../auth/auth-error.util';
import { isQrJoinUrl, safeInternalReturnUrl } from '../../../auth/safe-return-url';

@Component({ selector: 'app-verify-email', imports: [CommonModule],
  templateUrl: './verify-email.html', styleUrl: './verify-email.css' })
export class VerifyEmail implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  email = '';
  checking = false;
  resending = false;
  cooldown = 0;
  message = '';
  error = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private auth: AuthService, private postAuth: PostAuthNavigationService,
    private router: Router) {}

  private qrReturn(): string | null {
    const url = safeInternalReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
    return isQrJoinUrl(url) ? url : null;
  }

  private loginOptions() {
    const returnUrl = this.qrReturn();
    return { replaceUrl: true, ...(returnUrl ? { queryParams: { returnUrl } } : {}) };
  }

  async ngOnInit(): Promise<void> {
    const email = await this.auth.pendingVerificationEmail();
    if (!email) {
      await this.router.navigate(['/login'], this.loginOptions());
      return;
    }
    this.email = email;
    if (history.state?.verificationDeliveryWarning) {
      this.error = "Your account was created, but we couldn't send the verification email right now. Please use the Resend verification email button below. If you don't see the email after resending, check your Spam or Junk folder.";
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
    if (this.checking || this.resending) return;
    this.checking = true;
    this.message = '';
    this.error = '';
    try {
      const response = await this.auth.completeEmailVerification();
      if (!response) {
        this.error = "Your email is not verified yet. Please open the verification link, then try again. If you can't find the email, check your Spam or Junk folder.";
        return;
      }
      const returnUrl = this.qrReturn();
      if (returnUrl) await this.postAuth.navigate(response.user, returnUrl);
      else await this.postAuth.navigate(response.user);
    } catch (err: any) {
      if (err?.code === 'auth/no-current-user' || err?.status === 401) {
        await this.router.navigate(['/login'], this.loginOptions());
      } else {
        this.error = authErrorMessage(err, 'verification');
      }
    } finally { this.checking = false; }
  }

  async resend(): Promise<void> {
    if (this.checking || this.resending || this.cooldown > 0) return;
    this.resending = true;
    this.message = '';
    this.error = '';
    try {
      const returnUrl = this.qrReturn();
      if (returnUrl) await this.auth.resendVerificationEmail(returnUrl);
      else await this.auth.resendVerificationEmail();
      this.message = 'Verification email sent. Please check your inbox and Spam/Junk folder.';
      this.cooldown = 60;
      this.startCooldown();
    } catch (err: any) {
      if (err?.code === 'auth/no-current-user') await this.router.navigate(['/login'], this.loginOptions());
      else this.error = authErrorMessage(err, 'verification');
    } finally { this.resending = false; }
  }

  async backToLogin(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login'], this.loginOptions());
  }

  private startCooldown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.cooldown > 0) this.cooldown--;
      if (this.cooldown === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    }, 1000);
  }

}
