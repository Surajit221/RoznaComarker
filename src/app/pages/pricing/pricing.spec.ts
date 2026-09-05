import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { BackendPlan, PlansApiService } from '../../api/plans-api.service';
import { AuthService } from '../../auth/auth.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { PricingComponent } from './pricing';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { signal } from '@angular/core';

const features = (credits: number | null) => ({
  maxClasses: 20, maxStudents: 500, essayAnalysesPerMonth: credits, storageMB: 2048,
  aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: null,
  adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true,
  analyticsAccess: true, dedicatedSupport: false
});

const plans: BackendPlan[] = [
  { name: 'Institution', slug: 'institution', price: null, currency: 'USD', billingInterval: null, popular: false,
    features: { ...features(null), dedicatedSupport: true }, display: { title: 'Institution', description: 'For schools and organizations.', priceLabel: 'Custom', cta: 'Contact Us' } },
  { name: 'Pro Annual', slug: 'pro_annual', price: 199, currency: 'USD', billingInterval: 'year', popular: false,
    features: features(500), display: { title: 'Pro Annual', description: 'For growing teaching teams.', priceLabel: '$199', cta: 'Choose Pro' } },
  { name: 'Pro Monthly', slug: 'pro_monthly', price: 19.99, currency: 'USD', billingInterval: 'month', popular: false,
    features: features(500), display: { title: 'Pro Monthly', description: 'For growing teaching teams.', priceLabel: '$19.99', cta: 'Choose Pro' } },
  { name: 'Free', slug: 'free', price: 0, annualPrice: 0, currency: 'USD', billingInterval: 'month', popular: false,
    features: features(25), display: { title: 'Free', description: 'Perfect to try the workflow.', priceLabel: '$0', cta: 'Get Started' } },
  { name: 'Essential Annual', slug: 'essential_annual', price: 99, currency: 'USD', billingInterval: 'year', popular: true,
    features: features(300), display: { title: 'Essential Annual', description: 'For active teachers.', priceLabel: '$99', cta: 'Choose Essential' } },
  { name: 'Essential Monthly', slug: 'essential_monthly', price: 9.99, currency: 'USD', billingInterval: 'month', popular: true,
    features: features(300), display: { title: 'Essential Monthly', description: 'For active teachers.', priceLabel: '$9.99', cta: 'Choose Essential' } }
];

describe('PricingComponent', () => {
  async function create(activePlans = plans, role: string | null = null, subscription: any = { billing: null }): Promise<ComponentFixture<PricingComponent>> {
    await TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [
        ...routedComponentProviders(),
        { provide: PlansApiService, useValue: { getActivePlans: () => Promise.resolve(activePlans) } },
        { provide: PricingCatalogStateService, useValue: { plans:signal(activePlans),refresh:()=>Promise.resolve() } },
        { provide: AuthService, useValue: { getBackendRole: () => role } },
        { provide: SubscriptionApiService, useValue: {
          getMySubscription: () => Promise.resolve(subscription),
          createCustomerPortal: () => Promise.resolve({ url: 'https://billing.stripe.test' })
        } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(PricingComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture;
  }

  function card(fixture: ComponentFixture<PricingComponent>, tier: string): HTMLElement {
    return fixture.nativeElement.querySelector(`[data-plan-tier="${tier}"]`);
  }

  it('selects monthly by default and shows monthly Essential and Pro pricing', async () => {
    const fixture = await create();
    expect(fixture.componentInstance.billingPeriod).toBe('monthly');
    expect(fixture.nativeElement.querySelectorAll('[data-plan-tier]').length).toBe(4);
    expect(fixture.nativeElement.textContent).not.toContain('Essential Annual');
    expect(fixture.nativeElement.textContent).not.toContain('Pro Annual');
    expect(card(fixture, 'essential').textContent).toContain('$9.99');
    expect(card(fixture, 'pro').textContent).toContain('$19.99');
    expect(card(fixture, 'free').textContent).toContain('25');
    expect(card(fixture, 'essential').textContent).toContain('300');
    expect(card(fixture, 'pro').textContent).toContain('500');
    expect(card(fixture, 'free').textContent).toContain('per month');
    expect(card(fixture, 'essential').textContent).toContain('per month');
    expect(card(fixture, 'pro').textContent).toContain('per month');
    expect(fixture.nativeElement.querySelector('[role="tab"][aria-selected="true"]').textContent).toContain('Monthly');
  });

  it('switches the same Essential and Pro cards to yearly prices', async () => {
    const fixture = await create();
    const cardsBefore = fixture.nativeElement.querySelectorAll('[data-plan-tier]').length;
    fixture.componentInstance.setBillingPeriod('annual'); fixture.detectChanges();
    expect(card(fixture, 'essential').textContent).toContain('$99.00');
    expect(card(fixture, 'pro').textContent).toContain('$199.00');
    expect(fixture.nativeElement.querySelectorAll('[data-plan-tier]').length).toBe(cardsBefore);
    expect(card(fixture, 'essential').dataset['planSlug']).toBe('essential_annual');
    expect(card(fixture, 'pro').dataset['planSlug']).toBe('pro_annual');
  });

  it('keeps Free unchanged and Institution custom across billing periods', async () => {
    const fixture = await create();
    fixture.componentInstance.setBillingPeriod('annual'); fixture.detectChanges();
    expect(card(fixture, 'free').textContent).toContain('$0');
    expect(card(fixture, 'free').textContent).toContain('25');
    expect(card(fixture, 'institution').textContent).toContain('Custom');
    expect(card(fixture, 'institution').textContent).not.toContain('$0');
  });

  it('maps monthly and yearly Essential CTAs to its canonical backend plan and billing interval', async () => {
    const fixture = await create(plans, 'teacher'); const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    await fixture.componentInstance.onPlanAction(fixture.componentInstance.selectedPlan(fixture.componentInstance.tiers.find((tier) => tier.key === 'essential')!));
    expect(navigate).toHaveBeenCalledWith(['/checkout', 'essential_monthly'], { queryParams: { billing: 'monthly' } });
    fixture.componentInstance.setBillingPeriod('annual');
    await fixture.componentInstance.onPlanAction(fixture.componentInstance.selectedPlan(fixture.componentInstance.tiers.find((tier) => tier.key === 'essential')!));
    expect(navigate).toHaveBeenCalledWith(['/checkout', 'essential_annual'], { queryParams: { billing: 'annual' } });
  });

  it('maps monthly and yearly Pro CTAs to its canonical backend plan and billing interval', async () => {
    const fixture = await create(plans, 'teacher'); const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    await fixture.componentInstance.onPlanAction(fixture.componentInstance.selectedPlan(fixture.componentInstance.tiers.find((tier) => tier.key === 'pro')!));
    expect(navigate).toHaveBeenCalledWith(['/checkout', 'pro_monthly'], { queryParams: { billing: 'monthly' } });
    fixture.componentInstance.setBillingPeriod('annual');
    await fixture.componentInstance.onPlanAction(fixture.componentInstance.selectedPlan(fixture.componentInstance.tiers.find((tier) => tier.key === 'pro')!));
    expect(navigate).toHaveBeenCalledWith(['/checkout', 'pro_annual'], { queryParams: { billing: 'annual' } });
  });

  it('does not let the legacy Stripe-only purchasable flag swallow Essential or Pro button clicks', async () => {
    const paypalPlans = plans.map((plan) => ['essential_monthly', 'pro_monthly'].includes(plan.slug)
      ? { ...plan, purchasable: false }
      : plan);
    const fixture = await create(paypalPlans, 'teacher');
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);

    for (const tier of ['essential', 'pro']) {
      const button = card(fixture, tier).querySelector<HTMLButtonElement>('button.plan-cta')!;
      expect(button.disabled).toBeFalse();
      button.click();
      await fixture.whenStable();
    }

    expect(navigate.calls.allArgs()).toEqual([
      [['/checkout', 'essential_monthly'], { queryParams: { billing: 'monthly' } }],
      [['/checkout', 'pro_monthly'], { queryParams: { billing: 'monthly' } }]
    ]);
  });

  it('calculates savings dynamically and omits them when annual is not cheaper', async () => {
    const fixture = await create(); const component = fixture.componentInstance;
    expect(component.savingsPercentForTier(component.tiers.find((tier) => tier.key === 'essential')!)).toBe(17);
    const proTier = component.tiers.find((tier) => tier.key === 'pro')!;
    expect(component.savingsPercentForTier({ ...proTier, annual: { ...proTier.annual!, price: 300 } })).toBeNull();
    component.setBillingPeriod('annual'); fixture.detectChanges();
    expect(card(fixture, 'essential').textContent).toContain('Save 17%');
  });

  it('preserves the current-plan management state', async () => {
    const base = plans.find((plan) => plan.slug === 'essential_monthly')!;
    const legacy = { ...base, slug: 'starter_monthly', display: { ...base.display, cta: 'Upgrade Now' } };
    const fixture = await create([legacy], 'teacher', { billing: { status: 'active' } });
    expect(card(fixture, 'starter').textContent).toContain('Manage Plan');
  });

  it('routes active PayPal subscribers to native management instead of Stripe', async () => {
    const fixture = await create(plans, 'teacher', { billing: { provider: 'paypal', status: 'ACTIVE' } });
    const router = TestBed.inject(Router); const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    await fixture.componentInstance.onPlanAction(plans.find((plan) => plan.slug === 'pro_monthly')!);
    expect(navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
  });

  it('prevents duplicate checkout submits while the selected CTA is loading', async () => {
    const fixture = await create(plans, 'teacher'); const router = TestBed.inject(Router);
    let resolve!: (value: boolean) => void; const pending = new Promise<boolean>((done) => { resolve = done; });
    const navigate = spyOn(router, 'navigate').and.returnValue(pending); const essential = plans.find((plan) => plan.slug === 'essential_monthly')!;
    const first = fixture.componentInstance.onPlanAction(essential); fixture.detectChanges();
    void fixture.componentInstance.onPlanAction(essential);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(card(fixture, 'essential').textContent).toContain('Preparing checkout...');
    expect(card(fixture, 'essential').querySelector('button')?.getAttribute('aria-busy')).toBe('true');
    resolve(true); await first;
  });

  it('shows friendly errors without exposing raw checkout failures', async () => {
    const fixture = await create(plans, 'teacher'); const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.rejectWith(new Error('Stripe secret and internal payload'));
    await fixture.componentInstance.onPlanAction(plans.find((plan) => plan.slug === 'essential_monthly')!); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("We couldn't start checkout");
    expect(fixture.nativeElement.textContent).not.toContain('Stripe secret');
  });

  it('renders without page-level overflow at supported responsive widths', async () => {
    const fixture = await create(); const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
      host.style.width = `${width}px`;
      expect(host.scrollWidth).withContext(`${width}px viewport`).toBeLessThanOrEqual(host.clientWidth);
    }
  });
});
