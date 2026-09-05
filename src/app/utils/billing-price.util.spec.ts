import type { BackendPlan } from '../api/plans-api.service';
import { formatPlanPeriod, formatPlanPrice } from './billing-price.util';

const plan = (name: string, slug: string, price: number, billingInterval: string): BackendPlan => ({
  name, slug, price, currency: 'USD', billingInterval, popular: false, features: {} as any,
  display: { title: name, description: null, priceLabel: null, cta: null }
});

describe('authoritative billing price presentation', () => {
  it('renders monthly and annual records without converting annual totals', () => {
    const cases = [
      [plan('Essential Monthly', 'essential_monthly', 9.99, 'month'), '$9.99', '/ month'],
      [plan('Essential Annual', 'essential_annual', 99, 'year'), '$99.00', '/ year'],
      [plan('Pro Monthly', 'pro_monthly', 19.99, 'monthly'), '$19.99', '/ month'],
      [plan('Pro Annual', 'pro_annual', 199, 'yearly'), '$199.00', '/ year']
    ] as const;
    for (const [input, price, period] of cases) {
      expect(formatPlanPrice(input)).toBe(price);
      expect(formatPlanPeriod(input)).toBe(period);
    }
  });
});
