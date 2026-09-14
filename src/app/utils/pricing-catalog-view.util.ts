import { BackendPlan } from '../api/plans-api.service';

export type BillingPeriod = 'monthly' | 'annual';
export interface PricingFeature { label: string; value: string }
export interface PricingTier { key: string; title: string; monthly: BackendPlan; annual?: BackendPlan }

const TIER_ORDER = new Map([
  ['free', 0], ['essential', 1], ['starter', 1], ['pro', 2], ['institution', 3]
]);

export function groupPricingPlans(plans: BackendPlan[]): PricingTier[] {
  const grouped = new Map<string, PricingTier>();
  for (const plan of plans.filter(isDisplayablePlan)) {
    const suffix = plan.slug.match(/_(monthly|annual)$/)?.[1];
    let key = plan.slug.replace(/_(monthly|annual)$/, '');
    if (key === 'custom') key = 'institution';
    const tier = grouped.get(key) || { key, title: pricingTierTitle(key, plan), monthly: plan };
    if (suffix === 'annual') tier.annual = plan;
    else tier.monthly = plan;
    if (!suffix && plan.annualBillingAvailable && typeof plan.annualPrice === 'number') tier.annual = plan;
    grouped.set(key, tier);
  }
  return [...grouped.values()].sort((left, right) =>
    (TIER_ORDER.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
      (TIER_ORDER.get(right.key) ?? Number.MAX_SAFE_INTEGER) || left.key.localeCompare(right.key));
}

export function selectedPricingPlan(tier: PricingTier, period: BillingPeriod): BackendPlan {
  return period === 'annual' && tier.annual ? tier.annual : tier.monthly;
}

export function pricingSavingsPercent(tier: PricingTier): number | null {
  if (!tier.annual || typeof tier.monthly.price !== 'number' || tier.monthly.price <= 0) return null;
  const annualPrice = tier.annual === tier.monthly ? tier.monthly.annualPrice : tier.annual.price;
  if (typeof annualPrice !== 'number') return null;
  const annualizedMonthlyPrice = tier.monthly.price * 12;
  if (annualPrice >= annualizedMonthlyPrice) return null;
  return Math.round(((annualizedMonthlyPrice - annualPrice) / annualizedMonthlyPrice) * 100);
}

export function pricingFeatures(plan: BackendPlan): PricingFeature[] {
  const features = plan.features;
  const rows: PricingFeature[] = [
    { label: 'Classes', value: formatCapacity(plan, features.maxClasses) },
    { label: 'Students', value: formatCapacity(plan, features.maxStudents) },
    { label: 'Assessment Credits/month', value: features.essayAnalysesPerMonth === null ? 'Custom' : String(features.essayAnalysesPerMonth) },
    { label: 'AI Flashcards', value: formatAiFeature(features.aiFlashcards, features.aiFlashcardsLimit) },
    { label: 'AI Worksheets', value: formatAiFeature(features.aiWorksheets, features.aiWorksheetsLimit) },
    { label: 'Adaptive Learning', value: formatAiFeature(features.adaptiveLearning, features.adaptiveLearningLimit) },
    { label: 'Storage', value: formatStorage(features.storageMB) },
    { label: 'Priority AI processing', value: features.priorityAIProcessing ? 'Yes' : 'No' },
    { label: 'Analytics access', value: features.analyticsAccess ? 'Yes' : 'No' }
  ];
  if (features.dedicatedSupport) rows.push({ label: 'Dedicated support', value: 'Included' });
  return rows;
}

const PRIMARY_CARD_FEATURES = new Set([
  'Classes', 'Students', 'AI Flashcards', 'AI Worksheets', 'Adaptive Learning', 'Storage'
]);

export function primaryPricingFeatures(plan: BackendPlan): PricingFeature[] {
  return pricingFeatures(plan).filter(feature => PRIMARY_CARD_FEATURES.has(feature.label));
}

export function pricingTierTitle(key: string, plan: BackendPlan): string {
  const canonical = new Map([
    ['free', 'Free'], ['essential', 'Essential'], ['starter', 'Starter'], ['pro', 'Pro'], ['institution', 'Institution']
  ]);
  return canonical.get(key) || plan.display.title.replace(/\s+(Monthly|Annual)$/i, '');
}

function isDisplayablePlan(plan: BackendPlan): boolean {
  const key = plan.slug.replace(/_(monthly|annual)$/, '');
  if (['custom', 'institution'].includes(key)) return plan.price === null;
  if (key === 'free') return plan.price === 0;
  return typeof plan.price === 'number' && plan.price > 0;
}

function formatCapacity(plan: BackendPlan, value: number | null): string {
  if (value === null) return 'Unlimited';
  return plan.slug === 'starter_monthly' ? `Up to ${value}` : String(value);
}

function formatAiFeature(enabled: boolean, limit: number | null): string {
  if (!enabled) return 'No';
  return typeof limit === 'number' ? 'Limited' : 'Included';
}

function formatStorage(storageMB: number | null): string {
  if (storageMB === null) return 'Custom';
  if (storageMB >= 1024 && storageMB % 1024 === 0) return `${storageMB / 1024} GB`;
  return `${storageMB} MB`;
}
