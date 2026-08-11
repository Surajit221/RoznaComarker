import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { BackendPlan, PlansApiService } from '../../api/plans-api.service';
import { AuthService } from '../../auth/auth.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';

type PricingFeature = {
  label: string;
  value: string;
};

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

  constructor(
    private plansApi: PlansApiService,
    auth: AuthService,
    private router: Router,
    private subscriptionApi: SubscriptionApiService
  ) {
    this.authenticatedRole = auth.getBackendRole();
  }

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
    if (this.authenticatedRole === 'teacher') {
      try {
        const subscription = await this.subscriptionApi.getMySubscription();
        this.starterActive = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(subscription.billing?.status || '');
      } catch { /* public pricing remains usable */ }
    }
  }

  async loadPlans(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = null;
      const order = new Map([
        ['free', 0],
        ['starter_monthly', 1],
        ['custom', 2]
      ]);
      this.plans = (await this.plansApi.getActivePlans()).sort(
        (left, right) =>
          (order.get(left.slug) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(right.slug) ?? Number.MAX_SAFE_INTEGER) ||
          left.slug.localeCompare(right.slug)
      );
    } catch {
      this.errorMessage = 'Plans are temporarily unavailable. Please try again later.';
      this.plans = [];
    } finally {
      this.isLoading = false;
    }
  }

  formatPrice(plan: BackendPlan): string {
    if (typeof plan.price !== 'number') return plan.display.priceLabel || 'Custom';
    if (plan.price === 0) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: plan.currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(plan.price);
  }

  formatPeriod(plan: BackendPlan): string {
    return typeof plan.price === 'number' && plan.price > 0 && plan.billingInterval
      ? `/${plan.billingInterval}`
      : '';
  }

  featuresFor(plan: BackendPlan): PricingFeature[] {
    const features = plan.features;
    const rows: PricingFeature[] = [
      { label: 'Classes', value: this.formatCapacity(plan, features.maxClasses) },
      { label: 'Students', value: this.formatCapacity(plan, features.maxStudents) },
      {
        label: 'Essay analyses/month',
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
    return plan.slug === 'starter_monthly' && this.authenticatedRole === 'student';
  }

  async onPlanAction(plan: BackendPlan): Promise<void> {
    if (plan.slug === 'starter_monthly') {
      if (this.authenticatedRole !== 'teacher') {
        await this.router.navigate(this.authenticatedRole === 'student' ? ['/student/dashboard'] : ['/login']);
      } else if (this.starterActive) {
        const portal = await this.subscriptionApi.createCustomerPortal();
        window.location.assign(portal.url);
      } else {
        await this.router.navigate(['/checkout/starter']);
      }
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
}
