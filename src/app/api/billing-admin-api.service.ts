import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface Result<T> { data: T }
export interface AdminBillingPlan { name: string; slug: string; tier: string; periods: ('monthly' | 'annual')[];
  promoEligible: boolean; price: number | null; annualPrice?: number | null; currency: string }
export interface PromoInput {
  code: string; active: boolean; discountType: string; discountValue: string; currency: string;
  validFrom: string | null; validUntil: string | null; plans: string[]; billingPeriods: string[];
  totalLimit: number | null; perUserLimit: number | null;
}
export type PromoFormInput = Omit<PromoInput, 'billingPeriods'>;
export interface PromoRecord extends PromoInput { _id: string; allocated: number; consumed: number }
export interface AdminBillingTarget {
  userId: string; email: string; displayName?: string; currentPlan: string; currentExpiry: string | null;
  scheduled: { planSlug: string; startsAt: string; endsAt: string | null }[]; blocked: boolean; message: string | null;
}
export interface AdminAssignmentInput { email: string; planSlug: string; billingPeriod: string; reason: string }
export interface AdminAssignmentQuote extends AdminBillingTarget {
  quoteId: string; planSlug: string; billingPeriod: string; startsAt: string; endsAt: string | null; reason: string;
}
export function billingFailure(error: unknown): { code?: string; message?: string } {
  if (error && typeof error === 'object' && 'error' in error && error.error && typeof error.error === 'object') {
    const body = error.error;
    return { code: 'code' in body && typeof body.code === 'string' ? body.code : undefined,
      message: 'message' in body && typeof body.message === 'string' ? body.message : undefined };
  }
  return {};
}

@Injectable({ providedIn: 'root' })
export class BillingAdminApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/billing/admin`;
  async plans(): Promise<AdminBillingPlan[]> { return (await firstValueFrom(this.http.get<Result<AdminBillingPlan[]>>(`${this.base}/plans`))).data; }
  async promos(page = 1): Promise<{ items: PromoRecord[] }> { return (await firstValueFrom(this.http.get<Result<{ items: PromoRecord[] }>>(`${this.base}/promos`, { params: { page } }))).data; }
  async savePromo(value: PromoFormInput, id?: string): Promise<PromoRecord> {
    return (await firstValueFrom(id ? this.http.put<Result<PromoRecord>>(`${this.base}/promos/${encodeURIComponent(id)}`, value)
      : this.http.post<Result<PromoRecord>>(`${this.base}/promos`, value))).data;
  }
  async lookup(email: string): Promise<AdminBillingTarget> { return (await firstValueFrom(this.http.get<Result<AdminBillingTarget>>(`${this.base}/user`, { params: { email } }))).data; }
  async preview(value: AdminAssignmentInput): Promise<AdminAssignmentQuote> { return (await firstValueFrom(this.http.post<Result<AdminAssignmentQuote>>(`${this.base}/preview`, value))).data; }
  async assign(quoteId: string, operationId: string): Promise<unknown> {
    return (await firstValueFrom(this.http.post<Result<unknown>>(`${this.base}/assign`, { quoteId, operationId }))).data;
  }
}
