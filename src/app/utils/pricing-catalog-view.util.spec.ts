import { BackendPlan } from '../api/plans-api.service';
import { groupPricingPlans, primaryPricingFeatures, pricingSavingsPercent, selectedPricingPlan } from './pricing-catalog-view.util';

const features = {
  maxClasses: 10, maxStudents: 100, essayAnalysesPerMonth: 50, storageMB: 2048,
  aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: 10,
  adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true,
  analyticsAccess: true, dedicatedSupport: true
};

function plan(slug: string, price: number | null, interval: string | null): BackendPlan {
  return {
    name: slug, slug, price, currency: 'USD', billingInterval: interval, popular: slug === 'essential_monthly',
    features, display: { title: slug.replace('_', ' '), description: 'Catalog description', priceLabel: null, cta: 'Choose' }
  };
}

describe('pricing catalog presentation', () => {
  it('groups billing variants, selects the requested period, and derives savings', () => {
    const tiers = groupPricingPlans([plan('essential_annual', 96, 'year'), plan('essential_monthly', 10, 'month')]);
    expect(tiers.map(tier => tier.title)).toEqual(['Essential']);
    expect(selectedPricingPlan(tiers[0], 'monthly').slug).toBe('essential_monthly');
    expect(selectedPricingPlan(tiers[0], 'annual').slug).toBe('essential_annual');
    expect(pricingSavingsPercent(tiers[0])).toBe(20);
  });

  it('derives six compact card features without hardcoding catalog values', () => {
    const rows = primaryPricingFeatures(plan('essential_monthly', 10, 'month'));
    expect(rows.map(row => row.label)).toEqual(['Classes', 'Students', 'AI Flashcards', 'AI Worksheets', 'Adaptive Learning', 'Storage']);
    expect(rows.map(row => row.value)).toContain('2 GB');
  });

  it('keeps Institution custom and rejects invalid paid entries', () => {
    const tiers = groupPricingPlans([plan('institution', null, null), plan('broken', null, 'month')]);
    expect(tiers.map(tier => tier.key)).toEqual(['institution']);
    expect(tiers[0].monthly.price).toBeNull();
  });
});
