import { Injectable, signal } from '@angular/core';
import { CreditsApiService, type AssessmentCreditWallet } from '../api/credits-api.service';
import { SubscriptionApiService, type BackendMySubscription } from '../api/subscription-api.service';
import { InstitutionApiService, type InstitutionContext } from '../api/institution-api.service';

@Injectable({ providedIn: 'root' })
export class AccountStateService {
  readonly subscription = signal<BackendMySubscription | null>(null);
  readonly wallet = signal<AssessmentCreditWallet | null>(null);
  readonly institution = signal<InstitutionContext | null>(null);
  readonly subscriptionLoading = signal(false);
  readonly creditsLoading = signal(false);
  readonly subscriptionError = signal(false);
  readonly creditsError = signal(false);
  readonly refreshedAt = signal(0);
  private subscriptionRequest: Promise<BackendMySubscription | null> | null = null;
  private creditsRequest: Promise<AssessmentCreditWallet | null> | null = null;
  private institutionRequest: Promise<InstitutionContext | null> | null = null;

  constructor(private subscriptions: SubscriptionApiService, private credits: CreditsApiService, private institutions: InstitutionApiService) {}

  refreshInstitution(): Promise<InstitutionContext | null> {
    if (this.institutionRequest) return this.institutionRequest;
    this.institutionRequest = this.institutions.getMine().then(value => { this.institution.set(value); return value; })
      .catch(() => this.institution()).finally(() => { this.institutionRequest = null; });
    return this.institutionRequest;
  }

  refreshSubscription(): Promise<BackendMySubscription | null> {
    if (this.subscriptionRequest) return this.subscriptionRequest;
    this.subscriptionLoading.set(true);
    this.subscriptionRequest = this.subscriptions.getMySubscription()
      .then((value) => { this.subscription.set(value); this.subscriptionError.set(false); this.refreshedAt.set(Date.now()); return value; })
      .catch(() => { this.subscriptionError.set(true); return this.subscription(); })
      .finally(() => { this.subscriptionLoading.set(false); this.subscriptionRequest = null; });
    return this.subscriptionRequest;
  }

  refreshCredits(): Promise<AssessmentCreditWallet | null> {
    if (this.creditsRequest) return this.creditsRequest;
    this.creditsLoading.set(true);
    this.creditsRequest = this.credits.getWallet()
      .then((value) => { this.wallet.set(value); this.creditsError.set(false); this.refreshedAt.set(Date.now()); return value; })
      .catch(() => { this.creditsError.set(true); return this.wallet(); })
      .finally(() => { this.creditsLoading.set(false); this.creditsRequest = null; });
    return this.creditsRequest;
  }

  async refresh(): Promise<void> { await Promise.all([this.refreshSubscription(), this.refreshCredits(), this.refreshInstitution()]); }
  async refreshIfStale(maxAgeMs = 15_000): Promise<void> {
    if (Date.now() - this.refreshedAt() >= maxAgeMs) await this.refresh();
  }
}
