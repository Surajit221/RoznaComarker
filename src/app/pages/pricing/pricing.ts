import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { BackendPlan } from '../../api/plans-api.service';
import { AuthService } from '../../auth/auth.service';
import { formatPlanPeriod, formatPlanPrice } from '../../utils/billing-price.util';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { AccountStateService } from '../../services/account-state.service';

import { BillingPeriod, groupPricingPlans, pricingFeatures, pricingSavingsPercent, PricingTier, selectedPricingPlan } from '../../utils/pricing-catalog-view.util';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class PricingComponent {
  isLoading = true;
  errorMessage: string | null = null;
  readonly plans = computed(() => this.catalog.plans());
  readonly authenticatedRole: string | null;
  billingPeriod: BillingPeriod = 'monthly';
  private readonly preparingPlanSlugs = new Set<string>();
  readonly subscription = computed(() => this.accountState.subscription());
  get starterActive(): boolean {
    const status = String(this.subscription()?.billing?.status || '').toLowerCase();
    return [
      'active',
      'trialing',
      'past_due',
      'unpaid',
      'incomplete',
      'paused',
      'suspended'
    ].includes(status);
  }
  get tiers(): PricingTier[] { return groupPricingPlans(this.plans()); }
  get hasAnnualBilling(): boolean { return this.tiers.some((tier) => tier.annual); }
  get maxSavingsPercent(): number | null {
    const savings = this.tiers.map((tier) => this.savingsPercentForTier(tier)).filter((value): value is number => value !== null);
    return savings.length ? Math.max(...savings) : null;
  }

  constructor(
    private catalog: PricingCatalogStateService,
    auth: AuthService,
    private router: Router,
    private accountState: AccountStateService
  ) {
    this.authenticatedRole = auth.getBackendRole();
  }

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
    if (this.authenticatedRole === 'teacher') {
      try {
        await this.accountState.refreshSubscriptionIfStale();
      } catch { /* public pricing remains usable */ }
    }
  }

  async loadPlans(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = null;
      await this.catalog.refreshPlans();
    } catch {
      this.errorMessage = 'Plans are temporarily unavailable. Please try again later.';
    } finally {
      this.isLoading = false;
    }
  }
  formatPrice(plan: BackendPlan): string {
    return formatPlanPrice(plan, this.billingPeriod);
  }

  formatPeriod(plan: BackendPlan): string {
    return formatPlanPeriod(plan, this.billingPeriod);
  }

  setBillingPeriod(period: BillingPeriod): void {
    this.billingPeriod = period;
  }

  savingsPercent(plan: BackendPlan): number | null {
    if (typeof plan.price !== 'number' || plan.price <= 0 || typeof plan.annualPrice !== 'number') return null;
    const annualizedMonthlyPrice = plan.price * 12;
    if (plan.annualPrice >= annualizedMonthlyPrice) return null;
    return Math.round(((annualizedMonthlyPrice - plan.annualPrice) / annualizedMonthlyPrice) * 100);
  }

  selectedPlan(tier: PricingTier): BackendPlan {
    return selectedPricingPlan(tier, this.billingPeriod);
  }

  savingsPercentForTier(tier: PricingTier): number | null {
    return pricingSavingsPercent(tier);
  }

  isPreparing(plan: BackendPlan): boolean {
    return this.preparingPlanSlugs.has(plan.slug);
  }

  featuresFor(plan: BackendPlan) { return pricingFeatures(plan); }

  isUpgradeDisabled(plan: BackendPlan): boolean {
    return !['free', 'custom', 'institution'].includes(plan.slug) && this.authenticatedRole === 'student';
  }

  async onPlanAction(plan: BackendPlan): Promise<void> {
    if (this.preparingPlanSlugs.has(plan.slug)) return;
    if (['custom', 'institution'].includes(plan.slug)) return;
    if (plan.slug === 'free') {
      await this.router.navigate(this.authenticatedRole ? [`/${this.authenticatedRole}/dashboard`] : ['/signup']);
      return;
    }
    this.preparingPlanSlugs.add(plan.slug);
    this.errorMessage = null;
    try {
      if (this.authenticatedRole !== 'teacher') {
        await this.router.navigate(this.authenticatedRole === 'student' ? ['/student/dashboard'] : ['/login']);
      } else if (this.starterActive) {
        await this.router.navigate(['/billing/paypal/manage']);
      } else {
        const commands = plan.slug === 'starter_monthly' ? ['/checkout/starter'] : ['/checkout', plan.slug];
        if (plan.slug === 'starter_monthly' && this.billingPeriod === 'monthly') await this.router.navigate(commands);
        else await this.router.navigate(commands, { queryParams: { billing: this.billingPeriod } });
      }
    } catch {
      this.errorMessage = "We couldn't start checkout. Please try again.";
    } finally {
      this.preparingPlanSlugs.delete(plan.slug);
    }
  }

}
