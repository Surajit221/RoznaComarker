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
  _id: string;
  name: string;
  price: number | null;
  durationDays: number | null;
  limits: {
    classes: number | null;
    assignments: number | null;
    students: number | null;
    submissions: number | null;
    storageMB: number | null;
  };
  createdAt: string;
  isActive: boolean;
  isPopular: boolean;
  billingType: 'monthly' | 'yearly' | 'custom';
  stripePriceId: string | null;
  badgeText?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class PlansApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getActivePlans(): Promise<BackendPlan[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendPlan[]>>(`${apiBaseUrl}/plans`)
    );

    return resp?.data || [];
  }
}
