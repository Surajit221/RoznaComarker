import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AssessmentCreditWallet {
  plan: string; monthlyCredits: number; monthlyCreditsUsed: number; monthlyCreditsRemaining: number;
  purchasedCredits: number; bonusCredits: number; availableCredits: number; billingCycleStart: string; billingCycleEnd: string; resetDate: string;
  usagePercent: number; nudgeThresholds: { soft: number; warning: number }; warningAcknowledged: boolean;
}
export interface CreditPack { name: string; code: string; credits: number; price: number; currency: string; allowedPlans: string[]; displayOrder: number; }
export interface CreditTeacher { _id: string; displayName?: string; email: string; }
export interface CreditTransaction { _id: string; type: string; amount: number; balanceAfter: number; reason: string; createdAt: string; metadata?: { adminActorId?: string }; }
export interface AdminCreditWalletResponse { teacher: CreditTeacher; wallet: AssessmentCreditWallet;
  transactions: CreditTransaction[]; pagination: { page: number; limit: number; total: number; pages: number }; }
export interface AdminPricingConfig { plans: any[]; packs: any[]; }

@Injectable({ providedIn: 'root' })
export class CreditsApiService {
  private readonly http = inject(HttpClient);
  async getWallet(): Promise<AssessmentCreditWallet> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; wallet: AssessmentCreditWallet }>(
      `${environment.apiUrl}/credits/wallet`));
    return response.wallet;
  }
  async getPacks(): Promise<CreditPack[]> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; packs: CreditPack[] }>(`${environment.apiUrl}/credits/packs`));
    return response.packs;
  }
  async createTopupCheckout(packCode: string): Promise<{ url: string; sessionId: string }> {
    return firstValueFrom(this.http.post<{ success: boolean; url: string; sessionId: string }>(
      `${environment.apiUrl}/credits/topups/checkout-session`, { packCode }));
  }
  async acknowledgeNudge(): Promise<AssessmentCreditWallet> {
    const response = await firstValueFrom(this.http.post<{ success: boolean; wallet: AssessmentCreditWallet }>(
      `${environment.apiUrl}/credits/nudges/acknowledge`, { threshold: 80 }));
    return response.wallet;
  }
  async searchTeachers(q: string): Promise<CreditTeacher[]> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; teachers: CreditTeacher[] }>(
      `${environment.apiUrl}/credits/admin/teachers`, { params: { q } }));
    return response.teachers;
  }
  async getAdminWallet(userId: string, page = 1): Promise<AdminCreditWalletResponse> {
    return firstValueFrom(this.http.get<AdminCreditWalletResponse & { success: boolean }>(
      `${environment.apiUrl}/credits/admin/${encodeURIComponent(userId)}`, { params: { page, limit: 20 } }));
  }
  async adjust(userId: string, amount: number, reason: string): Promise<{ wallet: AssessmentCreditWallet }> {
    return firstValueFrom(this.http.post<{ success: boolean; wallet: AssessmentCreditWallet }>(
      `${environment.apiUrl}/credits/admin/${encodeURIComponent(userId)}/adjust`, { amount, reason }));
  }
  async getPricingConfig(): Promise<AdminPricingConfig> {
    return firstValueFrom(this.http.get<AdminPricingConfig & { success: boolean }>(`${environment.apiUrl}/credits/admin/pricing`));
  }
  async updatePlan(slug: string, value: any): Promise<any> {
    return firstValueFrom(this.http.put(`${environment.apiUrl}/credits/admin/pricing/plans/${encodeURIComponent(slug)}`, value));
  }
  async updatePack(code: string, value: any): Promise<any> {
    return firstValueFrom(this.http.put(`${environment.apiUrl}/credits/admin/pricing/packs/${encodeURIComponent(code)}`, value));
  }
}
