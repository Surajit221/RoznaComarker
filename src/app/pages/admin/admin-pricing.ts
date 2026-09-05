import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreditsApiService } from '../../api/credits-api.service';

@Component({ selector: 'app-admin-pricing', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './admin-pricing.html', styleUrl: './admin-pricing.css' })
export class AdminPricing {
  private api = inject(CreditsApiService);
  plans: any[] = []; packs: any[] = []; loading = true; saving: string | null = null; message = '';
  messageType: 'success' | 'error' | '' = '';
  async ngOnInit() { try { const value = await this.api.getPricingConfig(); this.plans = value.plans; this.packs = value.packs; }
    catch { this.message = "We couldn't load pricing configuration."; this.messageType = 'error'; } finally { this.loading = false; } }
  private planDto(plan: any) { return { name: plan.name, monthlyCredits: plan.features?.essayAnalysesPerMonth,
    monthlyPrice: plan.price, annualPrice: plan.annualPrice, active: plan.isActive, displayOrder: plan.displayOrder,
    recommended: plan.popular, stripeProductId: plan.stripe?.productId, stripeMonthlyPriceId: plan.stripe?.monthlyPriceId || plan.stripe?.priceId,
    stripeAnnualPriceId: plan.stripe?.annualPriceId, softThresholdPercent: plan.assessmentCreditNudges?.softThresholdPercent,
    warningThresholdPercent: plan.assessmentCreditNudges?.warningThresholdPercent }; }
  private packDto(pack: any) { return { name: pack.name, credits: pack.credits, price: pack.price, currency: pack.currency,
    active: pack.active, allowedPlans: pack.allowedPlans, displayOrder: pack.displayOrder, stripePriceId: pack.stripePriceId }; }
  setAllowedPlans(pack: any, value: string) { pack.allowedPlans = value.split(',').map((item) => item.trim()).filter(Boolean); }
  async savePlan(plan: any) { if (this.saving) return; this.saving = `plan:${plan.slug}`; this.message = ''; this.messageType = '';
    try { await this.api.updatePlan(plan.slug, this.planDto(plan)); this.message = `${plan.name} saved successfully.`; this.messageType = 'success'; }
    catch { this.message = "We couldn't save pricing changes."; this.messageType = 'error'; } finally { this.saving = null; } }
  async savePack(pack: any) { if (this.saving) return; this.saving = `pack:${pack.code}`; this.message = ''; this.messageType = '';
    try { await this.api.updatePack(pack.code, this.packDto(pack)); this.message = `${pack.name} saved successfully.`; this.messageType = 'success'; }
    catch { this.message = "We couldn't save pricing changes."; this.messageType = 'error'; } finally { this.saving = null; } }
}
