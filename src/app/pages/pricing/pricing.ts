import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { BackendPlan, PlansApiService } from '../../api/plans-api.service';

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

  allPlans: BackendPlan[] = [];
  starterBilling: 'monthly' | 'yearly' = 'monthly';

  constructor(private plansApi: PlansApiService) {}

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

  setStarterBilling(next: 'monthly' | 'yearly'): void {
    this.starterBilling = next;
  }

  get freePlan(): BackendPlan | null {
    return this.allPlans.find((p) => p.name === 'Free') || null;
  }

  get starterPlan(): BackendPlan | null {
    const targetName = this.starterBilling === 'monthly' ? 'Starter Monthly' : 'Starter Yearly';
    return this.allPlans.find((p) => p.name === targetName) || null;
  }

  get customPlan(): BackendPlan | null {
    return this.allPlans.find((p) => p.name === 'Custom') || null;
  }

  formatPrice(plan: BackendPlan | null): string {
    if (!plan) return '';
    if (plan.billingType === 'custom') return 'Contact Us';
    if (typeof plan.price !== 'number') return '';

    if (plan.price === 0) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(plan.price);
  }

  formatPeriod(plan: BackendPlan | null): string {
    if (!plan) return '';
    if (plan.billingType === 'monthly') return '/month';
    if (plan.billingType === 'yearly') return '/year';
    return '';
  }

  limitsList(plan: BackendPlan | null): Array<{ label: string; value: number | null }> {
    if (!plan) return [];
    const limits = plan.limits || ({} as any);
    return [
      { label: 'Classes', value: limits.classes ?? null },
      { label: 'Assignments', value: limits.assignments ?? null },
      { label: 'Students', value: limits.students ?? null },
      { label: 'Submissions', value: limits.submissions ?? null },
      { label: 'Storage', value: limits.storageMB ?? null }
    ];
  }

  formatLimitValue(label: string, value: number | null): string {
    if (value === null) return 'Unlimited';
    if (label === 'Storage') return `${value} MB`;
    return String(value);
  }
}
