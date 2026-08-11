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
};

export type BackendMySubscription = {
  plan: BackendPlan;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  usage: BackendSubscriptionUsage;
  billing: {
    customerConfigured: boolean;
    subscriptionId: string | null;
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    paymentIssue: boolean;
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

  async getCheckoutPlan(): Promise<BackendPlan> {
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendPlan>>(`${this.getApiBaseUrl()}/subscription/checkout-plan`)
    );
    return resp.data;
  }

  async createCheckoutSession(planSlug: string, checkoutAttemptId: string): Promise<{ clientSecret: string }> {
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<{ clientSecret: string }>>(
        `${this.getApiBaseUrl()}/subscription/checkout-session`, { planSlug, checkoutAttemptId }
      )
    );
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
}
