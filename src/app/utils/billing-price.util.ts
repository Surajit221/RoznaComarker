import type { BackendPlan } from '../api/plans-api.service';

export type BillingSelection = 'monthly' | 'annual';

export function billingIntervalUnit(plan: Pick<BackendPlan, 'billingInterval' | 'slug'>, selection?: BillingSelection): 'month' | 'year' {
  if (selection === 'annual') return 'year';
  if (selection === 'monthly') return 'month';
  const interval = String(plan.billingInterval || '').trim().toLowerCase();
  return ['year', 'yearly', 'annual'].includes(interval) || /_(?:annual|yearly)$/i.test(plan.slug) ? 'year' : 'month';
}

export function authoritativePlanPrice(plan: BackendPlan, selection?: BillingSelection): number | null {
  if (selection === 'annual' && typeof plan.annualPrice === 'number') return plan.annualPrice;
  return typeof plan.price === 'number' ? plan.price : null;
}

export function formatPlanPrice(plan: BackendPlan, selection?: BillingSelection): string {
  const price = authoritativePlanPrice(plan, selection);
  if (price === null) return plan.display?.priceLabel || 'Custom';
  if (price === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency || 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

export function formatPlanPeriod(plan: BackendPlan, selection?: BillingSelection): string {
  const price = authoritativePlanPrice(plan, selection);
  return typeof price === 'number' && price > 0 ? `/ ${billingIntervalUnit(plan, selection)}` : '';
}
