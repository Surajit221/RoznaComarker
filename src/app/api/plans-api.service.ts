import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendPlan = {
  name: string;
  slug: 'free' | 'starter_monthly' | 'custom' | string;
  price: number | null;
  annualPrice?: number | null;
  displayOrder?: number;
  currency: string;
  billingInterval: string | null;
  popular: boolean;
  assessmentCreditNudges?: { softThresholdPercent: number; warningThresholdPercent: number };
  purchasable?: boolean;
  annualBillingAvailable?: boolean;
  paymentProvider?: 'stripe' | 'paypal';
  features: {
    maxClasses: number | null;
    maxStudents: number | null;
    essayAnalysesPerMonth: number | null;
    storageMB: number | null;
    aiFlashcards: boolean;
    aiFlashcardsLimit: number | null;
    aiWorksheets: boolean;
    aiWorksheetsLimit: number | null;
    adaptiveLearning: boolean;
    adaptiveLearningLimit: number | null;
    priorityAIProcessing: boolean;
    analyticsAccess: boolean;
    dedicatedSupport: boolean;
  };
  display: {
    title: string;
    description: string | null;
    priceLabel: string | null;
    cta: string | null;
  };
  // /subscription/me still returns the complete legacy Plan document.
  limits?: {
    classes: number | null;
    assignments: number | null;
    students: number | null;
    submissions: number | null;
    storageMB: number | null;
  };
};

@Injectable({ providedIn: 'root' })
export class PlansApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return environment.apiUrl;
  }

  async getActivePlans(): Promise<BackendPlan[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendPlan[]>>(`${apiBaseUrl}/plans`)
    );

    return resp?.data || [];
  }
}
