import { CommonModule } from '@angular/common';
import { Component, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { BackendPlan } from '../../api/plans-api.service';
import { AuthService } from '../../auth/auth.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { trustedStripePortalUrl } from '../../utils/trusted-navigation.util';
import { formatPlanPeriod, formatPlanPrice } from '../../utils/billing-price.util';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';

type PricingFeature = {
  label: string;
  value: string;
};

type PricingTier = { key: string; title: string; monthly: BackendPlan; annual?: BackendPlan };

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
  plans: BackendPlan[] = [];
  readonly authenticatedRole: string | null;
  starterActive = false;
  activeProvider: 'stripe' | 'paypal' = 'stripe';
  billingPeriod: 'monthly' | 'annual' = 'monthly';
  private readonly preparingPlanSlugs = new Set<string>();
  get tiers(): PricingTier[] { return this.groupPlans(this.plans); }
  get hasAnnualBilling(): boolean { return this.tiers.some((tier) => tier.annual); }
  get maxSavingsPercent(): number | null {
    const savings = this.tiers.map((tier) => this.savingsPercentForTier(tier)).filter((value): value is number => value !== null);
    return savings.length ? Math.max(...savings) : null;
  }

  constructor(
    private catalog: PricingCatalogStateService,
    auth: AuthService,
    private router: Router,
    private subscriptionApi: SubscriptionApiService
  ) {
    this.authenticatedRole = auth.getBackendRole();effect(()=>this.plans=this.sortPlans(this.catalog.plans()));
  }

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
    if (this.authenticatedRole === 'teacher') {
      try {
        const subscription = await this.subscriptionApi.getMySubscription();
        this.activeProvider = subscription.billing?.provider || 'stripe';
        this.starterActive = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'suspended']
          .includes(String(subscription.billing?.status || '').toLowerCase());
      } catch { /* public pricing remains usable */ }
    }
  }

  async loadPlans(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = null;
      await this.catalog.refresh();
      this.plans = this.sortPlans(this.catalog.plans());
    } catch {
      this.errorMessage = 'Plans are temporarily unavailable. Please try again later.';
      this.plans = [];
    } finally {
      this.isLoading = false;
    }
  }
  private sortPlans(plans:BackendPlan[]):BackendPlan[]{const order = new Map([
        ['free', 0],
        ['essential', 1],
        ['starter_monthly', 1],
        ['pro', 2],
        ['custom', 3]
      ]);
      return [...plans].sort(
        (left, right) =>
          (order.get(left.slug) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(right.slug) ?? Number.MAX_SAFE_INTEGER) ||
          left.slug.localeCompare(right.slug)
      );}

  formatPrice(plan: BackendPlan): string {
    return formatPlanPrice(plan, this.billingPeriod);
  }

  formatPeriod(plan: BackendPlan): string {
    return formatPlanPeriod(plan, this.billingPeriod);
  }

  setBillingPeriod(period: 'monthly' | 'annual'): void {
    this.billingPeriod = period;
  }

  savingsPercent(plan: BackendPlan): number | null {
    if (typeof plan.price !== 'number' || plan.price <= 0 || typeof plan.annualPrice !== 'number') return null;
    const annualizedMonthlyPrice = plan.price * 12;
    if (plan.annualPrice >= annualizedMonthlyPrice) return null;
    return Math.round(((annualizedMonthlyPrice - plan.annualPrice) / annualizedMonthlyPrice) * 100);
  }

  selectedPlan(tier: PricingTier): BackendPlan {
    return this.billingPeriod === 'annual' && tier.annual ? tier.annual : tier.monthly;
  }

  savingsPercentForTier(tier: PricingTier): number | null {
    if (!tier.annual || typeof tier.monthly.price !== 'number' || tier.monthly.price <= 0) return null;
    const annualPrice = tier.annual === tier.monthly ? tier.monthly.annualPrice : tier.annual.price;
    if (typeof annualPrice !== 'number') return null;
    const annualizedMonthlyPrice = tier.monthly.price * 12;
    if (annualPrice >= annualizedMonthlyPrice) return null;
    return Math.round(((annualizedMonthlyPrice - annualPrice) / annualizedMonthlyPrice) * 100);
  }

  isPreparing(plan: BackendPlan): boolean {
    return this.preparingPlanSlugs.has(plan.slug);
  }

  featuresFor(plan: BackendPlan): PricingFeature[] {
    const features = plan.features;
    const rows: PricingFeature[] = [
      { label: 'Classes', value: this.formatCapacity(plan, features.maxClasses) },
      { label: 'Students', value: this.formatCapacity(plan, features.maxStudents) },
      {
        label: 'Assessment Credits/month',
        value: features.essayAnalysesPerMonth === null
          ? 'Custom'
          : String(features.essayAnalysesPerMonth)
      },
      {
        label: 'AI Flashcards',
        value: this.formatAiFeature(features.aiFlashcards, features.aiFlashcardsLimit)
      },
      {
        label: 'AI Worksheets',
        value: this.formatAiFeature(features.aiWorksheets, features.aiWorksheetsLimit)
      },
      {
        label: 'Adaptive Learning',
        value: this.formatAiFeature(features.adaptiveLearning, features.adaptiveLearningLimit)
      },
      { label: 'Storage', value: this.formatStorage(features.storageMB) },
      { label: 'Priority AI processing', value: features.priorityAIProcessing ? 'Yes' : 'No' },
      { label: 'Analytics access', value: features.analyticsAccess ? 'Yes' : 'No' }
    ];

    if (features.dedicatedSupport) {
      rows.push({ label: 'Dedicated support', value: 'Included' });
    }

    return rows;
  }

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
        if (this.activeProvider === 'paypal') {
          await this.router.navigate(['/billing/paypal/manage']);
          return;
        }
        const portal = await this.subscriptionApi.createCustomerPortal();
        const portalUrl = trustedStripePortalUrl(portal.url);
        if (portalUrl) window.location.assign(portalUrl);
        else this.errorMessage = 'Billing portal is temporarily unavailable.';
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

  private formatCapacity(plan: BackendPlan, value: number | null): string {
    if (value === null) return 'Unlimited';
    return plan.slug === 'starter_monthly' ? `Up to ${value}` : String(value);
  }

  private formatAiFeature(enabled: boolean, limit: number | null): string {
    if (!enabled) return 'No';
    return typeof limit === 'number' ? 'Limited' : 'Included';
  }

  private formatStorage(storageMB: number | null): string {
    if (storageMB === null) return 'Custom';
    if (storageMB >= 1024 && storageMB % 1024 === 0) return `${storageMB / 1024} GB`;
    return `${storageMB} MB`;
  }

  private groupPlans(plans: BackendPlan[]): PricingTier[] {
    const grouped = new Map<string, PricingTier>();
    for (const plan of plans) {
      const suffix = plan.slug.match(/_(monthly|annual)$/)?.[1];
      let key = plan.slug.replace(/_(monthly|annual)$/, '');
      if (key === 'custom') key = 'institution';
      const tier = grouped.get(key) || { key, title: this.tierTitle(key, plan), monthly: plan };
      if (suffix === 'annual') tier.annual = plan;
      else tier.monthly = plan;
      if (!suffix && plan.annualBillingAvailable && typeof plan.annualPrice === 'number') tier.annual = plan;
      grouped.set(key, tier);
    }
    const order = new Map([['free', 0], ['essential', 1], ['starter', 1], ['pro', 2], ['institution', 3]]);
    return [...grouped.values()].sort((left, right) =>
      (order.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.key) ?? Number.MAX_SAFE_INTEGER) || left.key.localeCompare(right.key));
  }

  private tierTitle(key: string, plan: BackendPlan): string {
    const canonical = new Map([['free', 'Free'], ['essential', 'Essential'], ['starter', 'Starter'], ['pro', 'Pro'], ['institution', 'Institution']]);
    return canonical.get(key) || plan.display.title.replace(/\s+(Monthly|Annual)$/i, '');
  }
}
