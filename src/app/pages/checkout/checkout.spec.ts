import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { environment } from '../../../environments/environment';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { CheckoutComponent } from './checkout';
import { CheckoutSuccessComponent } from './checkout-success';
import { CheckoutCancelComponent } from './checkout-cancel';
import { AccountStateService } from '../../services/account-state.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { PayPalSdkLoaderService } from '../../services/paypal-sdk-loader.service';

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
  let paypalButtonOptions:any[]=[];
  beforeEach(()=>{paypalButtonOptions=[];TestBed.configureTestingModule({providers:[
    {provide:CreditsApiService,useValue:{getPayPalCapabilities:()=>Promise.resolve({paypalCheckout:true,clientId:'safe-client'})}},
    {provide:AccountStateService,useValue:{refreshSubscription:jasmine.createSpy().and.resolveTo({})}},
    {provide:PayPalSdkLoaderService,useValue:{loadButtons:()=>Promise.resolve({FUNDING:{PAYPAL:'paypal',CARD:'card'},Buttons:(options:any)=>{paypalButtonOptions.push(options);return{isEligible:()=>true,render:()=>Promise.resolve(),close:()=>{}}}}),release:()=>{}}}
  ]});});
  afterEach(() => {
    environment.stripePublishableKey = originalKey;
    delete (window as any).Stripe;
    TestBed.resetTestingModule();
  });

  for (const provider of [undefined, 'stripe', 'unexpected']) {
    it('fails closed for provider metadata ' + provider, async () => {
      const stripe = jasmine.createSpy('Stripe');
      (window as any).Stripe = stripe;
      const api = { getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: provider }),
        createCheckoutSession: jasmine.createSpy() };
      await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
        ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: api }
      ] }).compileComponents();
      const fixture = TestBed.createComponent(CheckoutComponent);
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      expect(fixture.componentInstance.errorMessage).toContain('temporarily unavailable');
      expect(api.createCheckoutSession).not.toHaveBeenCalled();
      expect(stripe).not.toHaveBeenCalled();
      expect(paypalButtonOptions.length).toBe(0);
    });
  }

  it('shows a sanitized initialization error state', async () => {
    environment.stripePublishableKey = 'pk_test_browser';
    (window as any).Stripe = () => ({ createEmbeddedCheckoutPage: () => Promise.reject(new Error('Stripe unavailable')) });
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: { getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: () => Promise.resolve(starter) } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const alertText = fixture.nativeElement.querySelector('[role="alert"]').textContent;
    expect(alertText).toContain('temporarily unavailable');
    expect(alertText).not.toContain('Stripe unavailable');
    expect(alertText).toContain('Try Again');
  });

  it('does not create on page load and does not describe a suspended PayPal subscription as active', async () => {
    const api = {
      getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: 'paypal' }),
      createPayPalPlanOrder: jasmine.createSpy().and.rejectWith(new Error('PLAN_ENTITLEMENT_CONFLICT'))
    };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders(), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(api.createPayPalPlanOrder).not.toHaveBeenCalled();
    try { await paypalButtonOptions[0].createOrder(); } catch {}
    fixture.detectChanges();
    const alertElement = fixture.nativeElement.querySelector('[role="alert"]');
    if (alertElement) {
      const text = alertElement.textContent;
      expect(text).toContain('needs attention');
      expect(text).toContain('Manage Plan');
      expect(text).not.toContain('already active');
    }
  });

  for (const planCode of ['essential_monthly', 'pro_monthly']) {
    it(`creates exactly one prepaid PayPal Order for ${planCode} checkout`, async () => {
      const createPayPalPlanOrder = jasmine.createSpy('createPayPalPlanOrder').and.resolveTo({
        attemptId: '00000000-0000-4000-8000-000000000001', orderId: 'ORDER-PAYPAL', status: 'approval_pending'
      });
      const api = {
        getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy('getCheckoutPlan').and.resolveTo({
          ...starter,
          slug: planCode,
          paymentProvider: 'paypal'
        }),
        createPayPalPlanOrder,
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
      expect(createPayPalPlanOrder).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#paypal-subscription-button')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#paypal-subscription-card-button')).toBeTruthy();
      const value = await paypalButtonOptions[0].createOrder();
      expect(createPayPalPlanOrder).toHaveBeenCalledTimes(1);
      expect(createPayPalPlanOrder.calls.mostRecent().args[0]).toBe(planCode);
      expect(createPayPalPlanOrder.calls.mostRecent().args[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(value).toBe('ORDER-PAYPAL');
      expect(api.createCheckoutSession).not.toHaveBeenCalled();
    });

    it(`hides only ineligible Card funding and preserves PayPal for ${planCode}`, async () => {
      const api = {
        getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy('getCheckoutPlan').and.resolveTo({
          ...starter,
          slug: planCode,
          paymentProvider: 'paypal'
        }),
        createPayPalPlanOrder: jasmine.createSpy('createPayPalPlanOrder').and.resolveTo({ orderId: 'ORDER-PAYPAL' })
      };
      const sdk = { loadButtons: jasmine.createSpy().and.resolveTo({
        FUNDING: { PAYPAL: 'paypal', CARD: 'card' },
        Buttons: (options: any) => ({
          isEligible: () => options.fundingSource === 'paypal',
          render: () => Promise.resolve(),
          close: () => {}
        })
      }), release: () => {} };
      await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
        ...routedComponentProviders({ planCode }),
        { provide: SubscriptionApiService, useValue: api },
        { provide: PayPalSdkLoaderService, useValue: sdk }
      ] }).compileComponents();

      const fixture = TestBed.createComponent(CheckoutComponent);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('#paypal-subscription-button')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#paypal-subscription-card-button')).toBeNull();
    });

    it(`coalesces duplicate createOrder callbacks for ${planCode}`, async () => {
      const createPayPalPlanOrder = jasmine.createSpy('createPayPalPlanOrder').and.resolveTo({ orderId: 'ORDER-PAYPAL' });
      const api = {
        getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy('getCheckoutPlan').and.resolveTo({
          ...starter,
          slug: planCode,
          paymentProvider: 'paypal'
        }),
        createPayPalPlanOrder
      };
      await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
        ...routedComponentProviders({ planCode }),
        { provide: SubscriptionApiService, useValue: api }
      ] }).compileComponents();

      const fixture = TestBed.createComponent(CheckoutComponent);
      fixture.detectChanges();
      await fixture.whenStable();

      const results = await Promise.all([
        paypalButtonOptions[0].createOrder(),
        paypalButtonOptions[1].createOrder()
      ]);
      expect(createPayPalPlanOrder).toHaveBeenCalledTimes(1);
      expect(results[0]).toBe(results[1]);
    });

    it(`reconciles response loss against the same attempt for ${planCode}`, async () => {
      const newAttemptId = '00000000-0000-4000-8000-000000000001';
      const createPayPalPlanOrder = jasmine.createSpy('createPayPalPlanOrder').and.resolveTo({ orderId: 'ORDER-PAYPAL' });
      const capturePayPalPlanOrder = jasmine.createSpy('capturePayPalPlanOrder').and.rejectWith(new Error('response lost'));
      const getPayPalPlanPurchase = jasmine.createSpy('getPayPalPlanPurchase').and.resolveTo({ fulfilled: true, status: 'fulfilled' });
      const api = {
        getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy('getCheckoutPlan').and.resolveTo({
          ...starter,
          slug: planCode,
          paymentProvider: 'paypal'
        }),
        createPayPalPlanOrder, capturePayPalPlanOrder, getPayPalPlanPurchase
      };
      const accountState = { refreshSubscription: jasmine.createSpy().and.resolveTo() };
      await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
        ...routedComponentProviders({ planCode }),
        { provide: SubscriptionApiService, useValue: api },
        { provide: AccountStateService, useValue: accountState }
      ] }).compileComponents();

      const fixture = TestBed.createComponent(CheckoutComponent);
      fixture.detectChanges();
      await fixture.whenStable();

      const component = fixture.componentInstance;
      component.paypalCheckoutAttemptId = newAttemptId;
      fixture.detectChanges();

      expect(await paypalButtonOptions[0].createOrder()).toBe('ORDER-PAYPAL');
      expect(component.paypalCheckoutAttemptId).toBe(newAttemptId);

      await paypalButtonOptions[0].onApprove();
      expect(capturePayPalPlanOrder).toHaveBeenCalledOnceWith(newAttemptId);
      expect(getPayPalPlanPurchase).toHaveBeenCalledOnceWith(newAttemptId);
    });
  }

  it('restarts funding once for a plan INSTRUMENT_DECLINED and succeeds on the next approval', async () => {
    const capturePayPalPlanOrder = jasmine.createSpy().and.returnValues(
      Promise.reject(new HttpErrorResponse({ status: 422, error: { code: 'INSTRUMENT_DECLINED',
        message: "PayPal couldn't use this payment method. Please choose another card or payment method." } })),
      Promise.resolve({ fulfilled: true, status: 'fulfilled' })
    );
    const getPayPalPlanPurchase = jasmine.createSpy();
    const accountState = { refreshSubscription: jasmine.createSpy().and.resolveTo() };
    const api = { getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: 'paypal' }),
      createPayPalPlanOrder: jasmine.createSpy().and.resolveTo({ orderId: 'ORDER-PAYPAL' }),
      capturePayPalPlanOrder, getPayPalPlanPurchase };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders({ planCode: 'starter_monthly' }),
      { provide: SubscriptionApiService, useValue: api }, { provide: AccountStateService, useValue: accountState }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent); fixture.detectChanges(); await fixture.whenStable();
    await paypalButtonOptions[0].createOrder();
    const component = fixture.componentInstance;
    const actions = { restart: jasmine.createSpy().and.callFake(async()=>{expect(component.errorMessage).toBe('');}) };
    await Promise.all([paypalButtonOptions[0].onApprove({}, actions), paypalButtonOptions[0].onApprove({}, actions)]);
    expect(actions.restart).toHaveBeenCalledTimes(1);
    expect(capturePayPalPlanOrder).toHaveBeenCalledTimes(1);
    expect(getPayPalPlanPurchase).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('');
    expect(accountState.refreshSubscription).not.toHaveBeenCalled();

    await paypalButtonOptions[0].onApprove({}, actions);
    expect(capturePayPalPlanOrder).toHaveBeenCalledTimes(2);
    expect(actions.restart).toHaveBeenCalledTimes(1);
    expect(accountState.refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it('shows a safe error only when PayPal cannot restart declined funding', async () => {
    const api = { getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: 'paypal' }),
      createPayPalPlanOrder: jasmine.createSpy().and.resolveTo({ orderId: 'ORDER-PAYPAL' }),
      capturePayPalPlanOrder: jasmine.createSpy().and.rejectWith(new HttpErrorResponse({ status: 422,
        error: { code: 'INSTRUMENT_DECLINED' } })), getPayPalPlanPurchase: jasmine.createSpy() };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders({ planCode: 'starter_monthly' }), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent); fixture.detectChanges(); await fixture.whenStable();
    await paypalButtonOptions[0].createOrder();
    const actions = { restart: jasmine.createSpy().and.rejectWith(new Error('restart unavailable')) };
    await paypalButtonOptions[0].onApprove({}, actions);
    expect(actions.restart).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.errorMessage).toContain("couldn't restart checkout");
    expect(fixture.componentInstance.errorMessage).not.toContain('confirmation is still pending');
  });

  it('does not restart or reconcile a terminal plan capture error', async () => {
    const getPayPalPlanPurchase = jasmine.createSpy();
    const api = { getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan: jasmine.createSpy().and.resolveTo({ ...starter, paymentProvider: 'paypal' }),
      createPayPalPlanOrder: jasmine.createSpy().and.resolveTo({ orderId: 'ORDER-PAYPAL' }),
      capturePayPalPlanOrder: jasmine.createSpy().and.rejectWith(new HttpErrorResponse({ status: 409,
        error: { code: 'UNPROCESSABLE_ENTITY', message: 'PayPal could not complete this plan payment.' } })),
      getPayPalPlanPurchase };
    await TestBed.configureTestingModule({ imports: [CheckoutComponent], providers: [
      ...routedComponentProviders({ planCode: 'starter_monthly' }), { provide: SubscriptionApiService, useValue: api }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutComponent); fixture.detectChanges(); await fixture.whenStable();
    await paypalButtonOptions[0].createOrder();
    const actions = { restart: jasmine.createSpy().and.resolveTo() };
    await paypalButtonOptions[0].onApprove({}, actions);
    expect(actions.restart).not.toHaveBeenCalled();
    expect(getPayPalPlanPurchase).not.toHaveBeenCalled();
    expect(fixture.componentInstance.errorMessage).toContain('could not complete this plan payment');
    expect(fixture.componentInstance.errorMessage).not.toContain('confirmation is still pending');
  });

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
    expect(fixture.nativeElement.textContent).toContain('Your plan is active');
  });

  it('cancel page states that billing and subscription state are unchanged', async () => {
    await TestBed.configureTestingModule({ imports: [CheckoutCancelComponent], providers: routedComponentProviders() }).compileComponents();
    const fixture = TestBed.createComponent(CheckoutCancelComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No plan changes were made');
    expect(fixture.nativeElement.textContent).toContain('has not changed');
  });

  it('annual UI selection reaches the API and retry preserves its attempt identity', async () => {
    const api={getBillingQuote: jasmine.createSpy().and.resolveTo({ quoteId: 'test-quote', expiresAt: new Date(Date.now()+600000).toISOString(), baseAmount: '20.00', prorationCredit: '5.00', subtotalBeforeDiscount: '15.00', discountAmount: '3.00', finalAmount: '12.00', currency: 'USD', transition: 'upgrade' }), getCheckoutPlan:jasmine.createSpy().and.resolveTo({...starter,slug:'essential',annualPrice:249,paymentProvider:'paypal'}),
      createPayPalPlanOrder:jasmine.createSpy().and.resolveTo({orderId:'ORDER-ANNUAL'})};
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders({planCode:'essential'}),{provide:SubscriptionApiService,useValue:api}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.billingPeriod='annual';
    await paypalButtonOptions[0].createOrder();
    const attempt=fixture.componentInstance.paypalCheckoutAttemptId;
    expect(api.createPayPalPlanOrder).toHaveBeenCalledWith('essential',attempt,'annual','test-quote');
    await fixture.componentInstance.retry();
    expect(fixture.componentInstance.paypalCheckoutAttemptId).toBe(attempt);
  });

  it('displays server proration and promo, applies explicitly, and locks the quote after order creation', async () => {
    const serverQuote = { quoteId: 'server-quote', expiresAt: new Date(Date.now()+600000).toISOString(), currency:'USD',
      baseAmount:'20.00', prorationCredit:'5.00', subtotalBeforeDiscount:'15.00', discountAmount:'3.00', finalAmount:'12.00', transition:'upgrade' };
    const api = { getCheckoutPlan: jasmine.createSpy().and.resolveTo({...starter,paymentProvider:'paypal'}),
      getBillingQuote: jasmine.createSpy().and.resolveTo(serverQuote), createPayPalPlanOrder: jasmine.createSpy().and.resolveTo({orderId:'ORDER'}),
      cancelPayPalPlanOrder: jasmine.createSpy().and.resolveTo({}) };
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders(),{provide:SubscriptionApiService,useValue:api}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('USD 12.00');
    fixture.componentInstance.promoCode=' SAVE20 ';fixture.detectChanges();expect(api.getBillingQuote).toHaveBeenCalledTimes(1);
    await fixture.componentInstance.applyPromo();expect(api.getBillingQuote.calls.mostRecent().args[2]).toBe('SAVE20');
    await paypalButtonOptions.at(-1).createOrder();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(api.createPayPalPlanOrder.calls.mostRecent().args[3]).toBe('server-quote');
    expect(fixture.nativeElement.querySelector('#promo-code').disabled).toBeTrue();
    await fixture.componentInstance.applyPromo(true);expect(api.getBillingQuote).toHaveBeenCalledTimes(2);
    await fixture.componentInstance.restartOrder();expect(api.cancelPayPalPlanOrder).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.orderStarted).toBeFalse();
  });
  it('invalid promo preserves input and previous server quote', async () => {
    const api = { getCheckoutPlan: jasmine.createSpy().and.resolveTo({...starter,paymentProvider:'paypal'}),
      getBillingQuote: jasmine.createSpy().and.resolveTo({quoteId:'q',expiresAt:new Date(Date.now()+600000).toISOString(),currency:'USD',baseAmount:'9.99',prorationCredit:'0.00',discountAmount:'0.00',finalAmount:'9.99'}), createPayPalPlanOrder:jasmine.createSpy() };
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders(),{provide:SubscriptionApiService,useValue:api}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.promoCode = 'EXPIRED';
    api.getBillingQuote.and.rejectWith({error:{message:'Promo expired'}});await fixture.componentInstance.applyPromo();fixture.detectChanges();
    expect(fixture.componentInstance.promoError).toBe('Promo expired');expect(fixture.componentInstance.promoCode).toBe('EXPIRED');
    expect(fixture.componentInstance.quote?.quoteId).toBe('q');
    expect(fixture.nativeElement.querySelector('#promo-error').textContent).toContain('Promo expired');
    expect(api.createPayPalPlanOrder).not.toHaveBeenCalled();
  });

  it('shows only nonzero server pricing rows and one promo action per state', async () => {
    const initial = {quoteId:'base',expiresAt:new Date(Date.now()+600000).toISOString(),currency:'USD',baseAmount:'20.00',prorationCredit:'0.00',discountAmount:'0.00',finalAmount:'20.00',transition:'purchase',promo:null};
    const applied = {...initial,quoteId:'promo',prorationCredit:'2.50',discountAmount:'1.50',finalAmount:'16.00',promo:{code:'SAVE20'}};
    const api = {getCheckoutPlan:jasmine.createSpy().and.resolveTo({...starter,paymentProvider:'paypal'}),getBillingQuote:jasmine.createSpy().and.returnValues(Promise.resolve(initial),Promise.resolve(applied),Promise.resolve(initial))};
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders(),{provide:SubscriptionApiService,useValue:api}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(api.getBillingQuote).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#promo-code')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.promo-remove')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.price-row').length).toBe(2);
    fixture.componentInstance.promoCode='SAVE20';fixture.detectChanges();
    await fixture.componentInstance.applyPromo();fixture.detectChanges();
    expect(api.getBillingQuote).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('.promo-apply')).toBeNull();
    expect(fixture.nativeElement.querySelector('.promo-remove')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.price-row').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.price-row--total').textContent).toContain('USD 16.00');
    await fixture.componentInstance.applyPromo(true);fixture.detectChanges();
    expect(api.getBillingQuote).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelector('.promo-remove')).toBeNull();
  });

  it('keeps deterministic scheduled conflicts out of promo and PayPal paths', async () => {
    const api = {getCheckoutPlan:jasmine.createSpy().and.resolveTo({...starter,paymentProvider:'paypal'}),getBillingQuote:jasmine.createSpy().and.rejectWith(new HttpErrorResponse({status:409,error:{code:'SCHEDULED_PLAN_REVIEW_REQUIRED'}}))};
    const sdk = {loadButtons:jasmine.createSpy(),release:jasmine.createSpy()};
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders(),{provide:SubscriptionApiService,useValue:api},{provide:PayPalSdkLoaderService,useValue:sdk}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Upcoming paid plan already scheduled');
    expect(fixture.nativeElement.textContent).not.toContain('Try Again');
    expect(fixture.nativeElement.textContent).not.toContain('Payment methods');
    expect(fixture.nativeElement.querySelector('#promo-code').disabled).toBeTrue();
    expect(sdk.loadButtons).not.toHaveBeenCalled();
    await fixture.componentInstance.applyPromo();
    expect(api.getBillingQuote).toHaveBeenCalledTimes(1);
  });

  it('disables Apply and coalesces clicks while a promo quote is pending', async () => {
    const quote={quoteId:'base',expiresAt:new Date(Date.now()+600000).toISOString(),currency:'USD',baseAmount:'9.99',prorationCredit:'0.00',discountAmount:'0.00',finalAmount:'9.99',transition:'purchase',promo:null};
    let finish!: (value: typeof quote) => void;
    const pending=new Promise<typeof quote>(resolve => { finish=resolve; });
    const api={getCheckoutPlan:jasmine.createSpy().and.resolveTo({...starter,paymentProvider:'paypal'}),getBillingQuote:jasmine.createSpy().and.returnValues(Promise.resolve(quote),pending)};
    await TestBed.configureTestingModule({imports:[CheckoutComponent],providers:[...routedComponentProviders(),{provide:SubscriptionApiService,useValue:api}]}).compileComponents();
    const fixture=TestBed.createComponent(CheckoutComponent);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.promoCode='SAVE20';
    const first=fixture.componentInstance.applyPromo();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.promo-apply').disabled).toBeTrue();
    await fixture.componentInstance.applyPromo();
    expect(api.getBillingQuote).toHaveBeenCalledTimes(2);
    finish(quote);await first;
  });
});
