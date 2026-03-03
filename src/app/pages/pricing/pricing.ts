import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PricingPlan, PricingPlansApiService } from '../../api/pricing-plans-api.service';

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

  allPlans: PricingPlan[] = [];

  constructor(private plansApi: PricingPlansApiService) {}

  async ngOnInit(): Promise<void> {
    await this.loadPlans();
  }

  async loadPlans(): Promise<void> {
    try {
      this.isLoading = true;
      this.errorMessage = null;
      this.allPlans = await this.plansApi.getActivePlans();
    } catch (err) {
      this.errorMessage = 'Failed to load plans';
      this.allPlans = [];
    } finally {
      this.isLoading = false;
    }
  }

  get freePlan(): PricingPlan | null {
    return this.allPlans.find((p) => p.slug === 'free') || null;
  }

  get expertPlan(): PricingPlan | null {
    return this.allPlans.find((p) => p.slug === 'expert') || null;
  }

  get researcherPlan(): PricingPlan | null {
    return this.allPlans.find((p) => p.slug === 'researcher') || null;
  }

  formatPrice(plan: PricingPlan | null): string {
    if (!plan) return '';
    if (typeof plan.price !== 'number') return '';

    if (plan.price === 0) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(plan.price);
  }

  formatPeriod(plan: PricingPlan | null): string {
    if (!plan) return '';
    return '';
  }

  limitsList(plan: PricingPlan | null): Array<{ label: string; value: any }> {
    if (!plan) return [];
    const f = plan.features || ({} as any);
    return [
      { label: 'Classes', value: f.classes ?? null },
      { label: 'Students', value: f.maxStudentsPerClass ?? null },
      { label: 'Essays/month', value: f.essaysPerMonth ?? null },
      { label: 'Storage', value: { storageMB: f.storageMB ?? null, storageGB: f.storageGB ?? null } },
      { label: 'AI tokens', value: f.aiTokens ?? null },
      { label: 'Priority AI processing', value: !!f.priorityProcessing },
      { label: 'Analytics access', value: !!f.analyticsAccess }
    ];
  }

  private isUnlimitedValue(value: unknown): boolean {
    if (value === null || typeof value === 'undefined') return true;
    if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return true;
    return false;
  }

  formatLimitValue(label: string, value: any): string {
    if (label === 'Storage') {
      const mb = value?.storageMB;
      const gb = value?.storageGB;
      if (typeof gb === 'number' && Number.isFinite(gb)) return `${gb} GB`;
      if (typeof mb === 'number' && Number.isFinite(mb)) return `${mb} MB`;
      return 'Unlimited';
    }

    if (label === 'Priority AI processing' || label === 'Analytics access') {
      return value ? 'Yes' : 'No';
    }

    if (label === 'AI tokens') {
      if (this.isUnlimitedValue(value)) return 'Unlimited';
      if (typeof value === 'string') {
        const v = value.toLowerCase();
        if (v === 'limited') return 'Limited';
        if (v === 'unlimited') return 'Unlimited';
        return value;
      }
      return String(value);
    }

    if (this.isUnlimitedValue(value)) return 'Unlimited';
    return String(value);
  }
}
