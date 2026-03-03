import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type PricingPlan = {
  name: string;
  slug: string;
  price: number | null;
  currency: string;
  features: {
    classes: number | 'unlimited' | null;
    maxStudentsPerClass: number | 'unlimited' | null;
    essaysPerMonth: number | 'unlimited' | null;
    storageMB?: number | null;
    storageGB?: number | null;
    aiTokens: 'limited' | 'unlimited' | number | null;
    priorityProcessing: boolean;
    analyticsAccess: boolean;
  };
  isPopular?: boolean;
  badgeText?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class PricingPlansApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getActivePlans(): Promise<PricingPlan[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<PricingPlan[]>>(`${apiBaseUrl}/plans`)
    );

    return resp?.data || [];
  }
}
