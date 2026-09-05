import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { SubscriptionApiService } from '../../../api/subscription-api.service';

type OnboardingRole = 'teacher' | 'student';

@Component({
  selector: 'app-select-role',
  imports: [CommonModule],
  templateUrl: './select-role.html',
  styleUrl: './select-role.css'
})
export class SelectRole {
  selectedRole: OnboardingRole | null = null;
  isSaving = false;
  errorMessage = '';

  constructor(private auth: AuthService, private postAuth: PostAuthNavigationService,
    private route: ActivatedRoute, private subscriptions: SubscriptionApiService) {}

  select(role: OnboardingRole): void {
    if (!this.isSaving) this.selectedRole = role;
  }

  async continue(): Promise<void> {
    if (!this.selectedRole || this.isSaving) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      const response = await this.auth.setMyRole(this.selectedRole);
      const referral = sessionStorage.getItem('pending_referral_code');
      if (referral) {
        try { await this.subscriptions.claimReferral(referral); }
        finally { sessionStorage.removeItem('pending_referral_code'); }
      }
      await this.postAuth.navigate(response.user, this.route.snapshot.queryParamMap.get('returnUrl'));
    } catch (err: any) {
      if (err?.status === 401) {
        this.errorMessage = 'Your session has expired. Please log in again.';
      } else if (err?.status === 409) {
        this.errorMessage = 'Your account role has already been selected. Please sign in again.';
      } else {
        this.errorMessage = err?.error?.message || 'We could not save your role. Please try again.';
      }
    } finally {
      this.isSaving = false;
    }
  }
}
