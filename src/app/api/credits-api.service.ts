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
export type CreditPaymentProvider = 'stripe' | 'paypal';
export interface CreditPackOptions { packs: CreditPack[]; paymentProvider: CreditPaymentProvider; }
export interface PayPalCreditPurchase { attemptId: string; orderId?: string; approvalUrl?: string; status: string;
  packCode: string; credits: number; amount: string; currency: string; credited: boolean; message?: string; }
export interface CreditTeacher { _id: string; displayName?: string; email: string; plan?: string; monthlyRemaining?: number; purchasedCredits?: number; bonusCredits?: number; totalAvailable?: number; }
export interface CreditTeacherDirectory { teachers: CreditTeacher[]; pagination: { page:number;limit:number;total:number;pages:number } }
export interface CreditTransaction { _id: string; type: string; amount: number; balanceAfter: number; reason: string; createdAt: string; metadata?: { adminActorId?: string }; }
export interface BonusRewardHistory { _id: string; eventType: string; amount: number; grantedAt: string; }
export interface AdminCreditWalletResponse { teacher: CreditTeacher; wallet: AssessmentCreditWallet;
  transactions: CreditTransaction[]; pagination: { page: number; limit: number; total: number; pages: number }; }
export interface AdminPricingPlanDto { name:string;slug:string;monthlyPrice:number;annualPrice:number|null;currency:string;monthlyCredits:number;active:boolean;recommended:boolean;displayOrder:number;assessmentCreditNudges:{softThresholdPercent:number;warningThresholdPercent:number};stripe:{productId:string;monthlyPriceId:string;annualPriceId:string};kind?:'canonical'|'legacy'|'institution';editable?:boolean; }
export interface AdminPricingPackDto { name:string;code:string;credits:number;price:number;currency:string;active:boolean;allowedPlans:string[];displayOrder:number;stripePriceId:string; }
export interface AdminPlanUpdateDto { name:string;monthlyCredits:number;monthlyPrice:number;annualPrice:number|null;active:boolean;displayOrder:number;recommended:boolean;softThresholdPercent:number;warningThresholdPercent:number;stripeProductId:string;stripeMonthlyPriceId:string;stripeAnnualPriceId:string; }
export interface AdminPackUpdateDto { name:string;credits:number;price:number;currency:string;active:boolean;allowedPlans:string[];displayOrder:number;stripePriceId:string; }
export interface SafePaymentProviderMetadata { activePaymentProvider:CreditPaymentProvider;paypalEnabled:boolean;stripeEnabled:boolean; }
export interface AdminPricingConfig { plans: AdminPricingPlanDto[]; packs: AdminPricingPackDto[]; provider:SafePaymentProviderMetadata; }

@Injectable({ providedIn: 'root' })
export class CreditsApiService {
  private readonly http = inject(HttpClient);
  async getWallet(): Promise<AssessmentCreditWallet> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; wallet: AssessmentCreditWallet }>(
      `${environment.apiUrl}/credits/wallet`));
    return response.wallet;
  }
  async getRewards(): Promise<BonusRewardHistory[]> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; rewards: BonusRewardHistory[] }>(
      `${environment.apiUrl}/credits/rewards`));
    return response.rewards;
  }
  async getPacks(): Promise<CreditPackOptions> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; packs: CreditPack[]; paymentProvider?: CreditPaymentProvider }>(`${environment.apiUrl}/credits/packs`));
    return { packs: response.packs, paymentProvider: response.paymentProvider === 'paypal' ? 'paypal' : 'stripe' };
  }
  async createTopupCheckout(packCode: string): Promise<{ url: string; sessionId: string }> {
    return firstValueFrom(this.http.post<{ success: boolean; url: string; sessionId: string }>(
      `${environment.apiUrl}/credits/topups/checkout-session`, { packCode }));
  }
  async createPayPalOrder(packCode: string, checkoutAttemptId: string): Promise<PayPalCreditPurchase> {
    const response = await firstValueFrom(this.http.post<{ success: boolean; data: PayPalCreditPurchase }>(
      `${environment.apiUrl}/credits/paypal/create-order`, { packCode, checkoutAttemptId }));
    return response.data;
  }
  async capturePayPalOrder(checkoutAttemptId: string): Promise<PayPalCreditPurchase> {
    const response = await firstValueFrom(this.http.post<{ success: boolean; data: PayPalCreditPurchase }>(
      `${environment.apiUrl}/credits/paypal/capture`, { checkoutAttemptId }));
    return response.data;
  }
  async getPayPalPurchase(checkoutAttemptId: string): Promise<PayPalCreditPurchase> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; data: PayPalCreditPurchase }>(
      `${environment.apiUrl}/credits/paypal/purchase/${encodeURIComponent(checkoutAttemptId)}`));
    return response.data;
  }
  async cancelPayPalPurchase(checkoutAttemptId: string): Promise<PayPalCreditPurchase> {
    const response = await firstValueFrom(this.http.post<{ success: boolean; data: PayPalCreditPurchase }>(
      `${environment.apiUrl}/credits/paypal/cancel`, { checkoutAttemptId }));
    return response.data;
  }
  async acknowledgeNudge(): Promise<AssessmentCreditWallet> {
    const response = await firstValueFrom(this.http.post<{ success: boolean; wallet: AssessmentCreditWallet }>(
      `${environment.apiUrl}/credits/nudges/acknowledge`, { threshold: 80 }));
    return response.wallet;
  }
  async searchTeachers(q: string, page=1, limit=25): Promise<CreditTeacherDirectory> {
    const response = await firstValueFrom(this.http.get<{ success: boolean; teachers: CreditTeacher[];pagination?:CreditTeacherDirectory['pagination'] }>(
      `${environment.apiUrl}/credits/admin/teachers`, { params: { q,page,limit } }));
    return {teachers:response.teachers,pagination:response.pagination||{page:1,limit,total:response.teachers.length,pages:1}};
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
  async updatePlan(slug: string, value: AdminPlanUpdateDto): Promise<any> {
    return firstValueFrom(this.http.put(`${environment.apiUrl}/credits/admin/pricing/plans/${encodeURIComponent(slug)}`, value));
  }
  async updatePack(code: string, value: AdminPackUpdateDto): Promise<any> {
    return firstValueFrom(this.http.put(`${environment.apiUrl}/credits/admin/pricing/packs/${encodeURIComponent(code)}`, value));
  }
}
