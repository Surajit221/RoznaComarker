import { TestBed } from '@angular/core/testing';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { environment } from '../../../environments/environment';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { CheckoutComponent } from './checkout';
import { CheckoutSuccessComponent } from './checkout-success';
import { CheckoutCancelComponent } from './checkout-cancel';
import { AccountStateService } from '../../services/account-state.service';

const starter: any = {
  name: 'Starter Monthly', slug: 'starter_monthly', price: 9.99, currency: 'USD',
  billingInterval: 'month', popular: true,
  display: { title: 'Starter Monthly', description: '', priceLabel: '$9.99', cta: 'Upgrade Now' },
  features: { maxClasses: 20, maxStudents: 500, essayAnalysesPerMonth: 1000, storageMB: 2048,
    aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: null,
    adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true,
    analyticsAccess: true, dedicatedSupport: false }
};

describe('Stripe checkout pages', () => {
  const originalKey = environment.stripePublishableKey;
  afterEach(() => {
    environment.stripePublishableKey = originalKey;
    delete (window as any).Stripe;
    TestBed.resetTestingModule();
  });

  it('loads Starter from API and mounts the Embedded Checkout container with Rozna pricing', async () => {
    environment.stripePublishableKey = 'pk_test_browser';
    const mount = jasmine.createSpy('mount');
    const destroy = jasmine.createSpy('destroy');
    const createEmbeddedCheckoutPage = jasmine.createSpy('createEmbeddedCheckoutPage')
      .and.resolveTo({ mount, destroy });
    (window as any).Stripe = jasmine.createSpy('Stripe').and.returnValue({ createEmbeddedCheckoutPage });
    const api = {
      getCheckoutPlan: jasmine.createSpy().and.resolveTo(starter),
      createCheckoutSession: jasmine.createSpy().and.resolveTo({ clientSecret: 'cs_test' })
    };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Starter Monthly');
    expect(text).toContain('$9.99');
    expect(text).toContain('Up to 20 Classes');
    expect(fixture.nativeElement.querySelector('#embedded-checkout')).toBeTruthy();
    expect(createEmbeddedCheckoutPage).toHaveBeenCalledWith(jasmine.objectContaining({
      fetchClientSecret: jasmine.any(Function),
      onComplete: jasmine.any(Function)
    }));
    expect(mount).toHaveBeenCalledWith('#embedded-checkout');
    expect(mount).toHaveBeenCalledTimes(1);

    const fetchClientSecret = createEmbeddedCheckoutPage.calls.mostRecent().args[0].fetchClientSecret;
    await fetchClientSecret();
    await fetchClientSecret();
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(2);
    const firstAttemptId = api.createCheckoutSession.calls.argsFor(0)[1];
    const secondAttemptId = api.createCheckoutSession.calls.argsFor(1)[1];
    expect(firstAttemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(secondAttemptId).toBe(firstAttemptId);

    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rotates the attempt ID only for an explicit new initialization and mounts once', async () => {
    environment.stripePublishableKey = 'pk_test_browser';
    const mount = jasmine.createSpy('mount');
    const createEmbeddedCheckoutPage = jasmine.createSpy('createEmbeddedCheckoutPage').and.returnValues(
      Promise.reject(new Error('first attempt failed')),
      Promise.resolve({ mount, destroy: jasmine.createSpy('destroy') })
    );
    (window as any).Stripe = () => ({ createEmbeddedCheckoutPage });
    const api = {
      getCheckoutPlan: jasmine.createSpy().and.resolveTo(starter),
      createCheckoutSession: jasmine.createSpy().and.resolveTo({ clientSecret: 'cs_test' })
    };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

    const firstFetch = createEmbeddedCheckoutPage.calls.argsFor(0)[0].fetchClientSecret;
    await firstFetch();
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    const secondFetch = createEmbeddedCheckoutPage.calls.argsFor(1)[0].fetchClientSecret;
    await secondFetch();

    const firstAttemptId = api.createCheckoutSession.calls.argsFor(0)[1];
    const secondAttemptId = api.createCheckoutSession.calls.argsFor(1)[1];
    expect(secondAttemptId).not.toBe(firstAttemptId);
    expect(createEmbeddedCheckoutPage).toHaveBeenCalledTimes(2);
    expect(api.getCheckoutPlan).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it('shows a sanitized initialization error state', async () => {
    environment.stripePublishableKey = 'pk_test_browser';
    (window as any).Stripe = () => ({ createEmbeddedCheckoutPage: () => Promise.reject(new Error('Stripe unavailable')) });
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: { getCheckoutPlan: () => Promise.resolve(starter) } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const alertText = fixture.nativeElement.querySelector('[role="alert"]').textContent;
    expect(alertText).toContain('temporarily unavailable');
    expect(alertText).not.toContain('Stripe unavailable');
    expect(alertText).toContain('Try Again');
  });

  it('does not describe a suspended PayPal subscription as active', async () => {
    const api = {
      getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: 'paypal' }),
      createPayPalSubscription: jasmine.createSpy().and.rejectWith({ error: { code: 'SUBSCRIPTION_REQUIRES_MANAGEMENT' } })
    };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

    const text = fixture.nativeElement.querySelector('[role="alert"]').textContent;
    expect(text).toContain('needs attention');
    expect(text).toContain('Manage Plan');
    expect(text).not.toContain('already active');
  });

  for (const planCode of ['essential_monthly', 'pro_monthly']) {
    it(`creates exactly one PayPal subscription for ${planCode} checkout`, async () => {
      const createPayPalSubscription = jasmine.createSpy('createPayPalSubscription').and.resolveTo({
        subscriptionId: 'I-PAYPAL',
        approvalUrl: 'https://untrusted.example.test/approve',
        status: 'APPROVAL_PENDING'
      });
      const api = {
        getCheckoutPlan: jasmine.createSpy('getCheckoutPlan').and.resolveTo({
          ...starter,
          slug: planCode,
          paymentProvider: 'paypal'
        }),
        createPayPalSubscription,
        createCheckoutSession: jasmine.createSpy('createCheckoutSession')
      };
      await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
        ...routedComponentProviders({ planCode }),
        { provide: SubscriptionApiService, useValue: api }
      ] }).compileComponents();

      const fixture = TestBed.createComponent(CheckoutComponent);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(api.getCheckoutPlan).toHaveBeenCalledOnceWith(planCode);
      expect(createPayPalSubscription).toHaveBeenCalledTimes(1);
      expect(createPayPalSubscription.calls.mostRecent().args[0]).toBe(planCode);
      expect(createPayPalSubscription.calls.mostRecent().args[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(api.createCheckoutSession).not.toHaveBeenCalled();
    });
  }

  it('success page only polls the authoritative subscription endpoint', async () => {
    const getMySubscription = jasmine.createSpy().and.resolveTo({ plan: starter, billing: { status: 'active' } });
    const refreshCredits = jasmine.createSpy().and.resolveTo({ availableCredits: 300 });
    await TestBed.configureTestingModule({ imports: [CheckoutSuccessComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: { getMySubscription } },
      { provide: AccountStateService, useValue: { refreshSubscription: getMySubscription, refreshCredits } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutSuccessComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(getMySubscription).toHaveBeenCalled();
    expect(refreshCredits).toHaveBeenCalledOnceWith();
    expect(fixture.nativeElement.textContent).toContain('Your paid plan is active');
  });

  it('cancel page states that billing and subscription state are unchanged', async () => {
    await TestBed.configureTestingModule({ imports: [CheckoutCancelComponent], providers: routedComponentProviders() }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutCancelComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No plan changes were made');
    expect(fixture.nativeElement.textContent).toContain('has not changed');
  });
});
