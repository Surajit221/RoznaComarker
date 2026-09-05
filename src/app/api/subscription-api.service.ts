import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import type { BackendPlan } from './plans-api.service';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendSubscriptionUsage = {
  classes: number;
  assignments: number;
  students: number;
  submissions: number;
  storageMB: number;
  aiFlashcards?: number;
  aiWorksheets?: number;
};

export type BackendMySubscription = {
  plan: BackendPlan;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  usage: BackendSubscriptionUsage;
  storage?: { usedBytes: number; limitBytes: number | null; usedMb: number; limitMb: number | null; percent: number | null };
  billing: {
    provider?: 'stripe' | 'paypal';
    customerConfigured: boolean;
    subscriptionId: string | null;
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentIssue: boolean;
    canManageSubscription?: boolean;
    canCancel?: boolean;
    canChangePlan?: boolean;
    planCode?: string;
    billingPeriod?: 'monthly' | 'annual';
    subscriptionStatus?: string | null;
    pendingPlanChange?: boolean;
    pendingTargetPlanCode?: string | null;
    pendingCancellation?: boolean;
  } | null;
  referrals?: {
    code: string;
    count: number;
    attributed: number;
    qualified: number;
    rewarded: number;
    pending: number;
    reviewRequired: number;
    bonusCreditsEarned: number;
    rewardCreditsEach: number;
    cap?: number;
    referrals: Array<{ id: string; name: string; status: 'ATTRIBUTED' | 'QUALIFIED' | 'REWARDED' | 'REJECTED' | 'REVIEW_REQUIRED'; date: string }>;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return environment.apiUrl;
  }

  private logHttpError(context: string, err: unknown) {
    if (err instanceof HttpErrorResponse) {
      console.error(`[${context}] HTTP error`, {
        url: err.url,
        status: err.status,
        statusText: err.statusText,
        message: err.message,
        error: err.error
      });
      return;
    }

    console.error(`[${context}] Unknown error`, err);
  }

  async getMySubscription(): Promise<BackendMySubscription> {
    const apiBaseUrl = this.getApiBaseUrl();

    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendMySubscription>>(`${apiBaseUrl}/subscription/me`)
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('getMySubscription', err);
      throw err;
    }
  }

  async getCheckoutPlan(planCode = 'starter_monthly'): Promise<BackendPlan> {
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendPlan>>(`${this.getApiBaseUrl()}/subscription/checkout-plan`, { params: { planCode } })
    );
    return resp.data;
  }

  async createCheckoutSession(planCode: string, checkoutAttemptId: string, billingPeriod: 'monthly' | 'annual' = 'monthly'): Promise<{ clientSecret: string }> {
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<{ clientSecret: string }>>(
        `${this.getApiBaseUrl()}/subscription/checkout-session`, { planCode, billingPeriod, checkoutAttemptId }
      )
    );
    return resp.data;
  }

  async createPayPalSubscription(planCode: string, checkoutAttemptId: string): Promise<{ subscriptionId: string; approvalUrl: string; status: string }> {
    const resp = await firstValueFrom(this.http.post<BackendResponse<{ subscriptionId: string; approvalUrl: string; status: string }>>(
      `${this.getApiBaseUrl()}/subscription/paypal/create`, { planCode, checkoutAttemptId }
    ));
    return resp.data;
  }

  async createCustomerPortal(): Promise<{ url: string }> {
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<{ url: string }>>(
        `${this.getApiBaseUrl()}/subscription/customer-portal`, {}
      )
    );
    return resp.data;
  }

  async cancelPayPalSubscription(): Promise<{ pending: boolean; alreadyTerminal: boolean; status: string; attemptId: string | null }> {
    const resp = await firstValueFrom(this.http.post<BackendResponse<{ pending: boolean; alreadyTerminal: boolean; status: string; attemptId: string | null }>>(
      `${this.getApiBaseUrl()}/subscription/paypal/cancel`, {}
    ));
    return resp.data;
  }

  async changePayPalPlan(targetPlanCode: string, changeAttemptId: string): Promise<{
    attemptId: string; status: string; targetPlanCode: string; requiresApproval: boolean; approvalUrl: string | null;
  }> {
    const resp = await firstValueFrom(this.http.post<BackendResponse<{
      attemptId: string; status: string; targetPlanCode: string; requiresApproval: boolean; approvalUrl: string | null;
    }>>(`${this.getApiBaseUrl()}/subscription/paypal/change-plan`, { targetPlanCode, changeAttemptId }));
    return resp.data;
  }

  async markPayPalPlanChangeCancelled(changeAttemptId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.getApiBaseUrl()}/subscription/paypal/change-plan/cancelled`, { changeAttemptId }));
  }

  async claimReferral(code: string): Promise<{ applied: boolean }> {
    const resp = await firstValueFrom(this.http.post<BackendResponse<{ applied: boolean }>>(
      `${this.getApiBaseUrl()}/users/me/referral`, { code }
    ));
    return resp.data;
  }
}
