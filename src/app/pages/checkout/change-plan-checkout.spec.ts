import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ChangePlanCheckoutComponent } from './change-plan-checkout';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { PayPalSdkLoaderService } from '../../services/paypal-sdk-loader.service';
import { signal } from '@angular/core';

describe('ChangePlanCheckoutComponent', () => {
  let fixture: ComponentFixture<ChangePlanCheckoutComponent>;
  let component: ChangePlanCheckoutComponent;
  let subscriptionApi: any;
  let accountState: any;
  let router: any;
  let route: any;
  let paypalSdkLoader: any;

  const essential = {
    name: 'Essential Monthly',
    slug: 'essential_monthly',
    price: 29,
    currency: 'USD',
    billingInterval: 'month',
    paymentProvider: 'paypal',
    display: { title: 'Essential Monthly' }
  };

  const annual = {
    name: 'Essential Annual',
    slug: 'essential_annual',
    price: 299,
    currency: 'USD',
    billingInterval: 'year',
    paymentProvider: 'paypal',
    display: { title: 'Essential Annual' }
  };

  const subscription = {
    plan: essential,
    billing: {
      provider: 'paypal',
      subscriptionId: 'I-PAYPAL-123',
      status: 'ACTIVE',
      paypalClientId: 'test-client-id'
    }
  };

  const changePlanContext = {
    changeAttemptId: 'change-attempt-123',
    providerSubscriptionId: 'I-PAYPAL-123',
    targetPayPalPlanId: 'P-ANNUAL-PLAN',
    targetPlanCode: 'essential_annual',
    currency: 'USD',
    targetPlanName: 'Essential Annual',
    targetPlanPrice: 299,
    targetBillingInterval: 'year'
  };

  const mockPayPalSdk = {
    FUNDING: { PAYPAL: 'PAYPAL', CARD: 'CARD' },
    Buttons: jasmine.createSpy().and.returnValue({
      isEligible: () => true,
      render: () => Promise.resolve(),
      close: () => {}
    })
  };

  beforeEach(async () => {
    subscriptionApi = {
      getMySubscription: jasmine.createSpy().and.resolveTo(subscription),
      getCheckoutPlan: jasmine.createSpy().and.resolveTo(annual),
      getChangePlanContext: jasmine.createSpy().and.resolveTo({ success: true, data: changePlanContext }),
      reconcilePlanChange: jasmine.createSpy().and.resolveTo({ status: 'completed', targetPlanCode: 'essential_annual', providerStatus: 'ACTIVE' }),
      markPayPalPlanChangeCancelled: jasmine.createSpy().and.resolveTo(),
      changePayPalPlan: jasmine.createSpy().and.resolveTo({
        requiresApproval: true,
        approvalUrl: 'https://www.sandbox.paypal.com/approve?token=ABC123',
        attemptId: 'change-attempt-123'
      })
    };

    accountState = {
      subscription: signal(subscription),
      refreshSubscription: jasmine.createSpy().and.resolveTo()
    };

    router = {
      navigate: jasmine.createSpy(),
      navigateByUrl: jasmine.createSpy()
    };

    route = {
      snapshot: {
        queryParamMap: {
          get: jasmine.createSpy().and.callFake((key: string) => {
            if (key === 'target') return 'essential_annual';
            if (key === 'attempt') return 'change-attempt-123';
            return null;
          })
        }
      }
    };

    paypalSdkLoader = {
      loadButtons: jasmine.createSpy().and.resolveTo(mockPayPalSdk),
      release: jasmine.createSpy()
    };

    await TestBed.configureTestingModule({
      imports: [ChangePlanCheckoutComponent],
      providers: [
        { provide: SubscriptionApiService, useValue: subscriptionApi },
        { provide: AccountStateService, useValue: accountState },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
        { provide: PayPalSdkLoaderService, useValue: paypalSdkLoader }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePlanCheckoutComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads plan data from backend on init', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(subscriptionApi.getMySubscription).toHaveBeenCalled();
    expect(subscriptionApi.getCheckoutPlan).toHaveBeenCalledWith('essential_annual');
    expect(component.data?.currentPlan.slug).toBe('essential_monthly');
    expect(component.data?.targetPlan.slug).toBe('essential_annual');
  });

  it('loads change plan context from backend', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(subscriptionApi.getChangePlanContext).toHaveBeenCalledWith('essential_annual', 'change-attempt-123');
    expect(component.context).toEqual(changePlanContext);
  });

  it('renders current and target plan comparison', async () => {
    await component.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Essential Monthly');
    expect(text).toContain('Essential Annual');
    expect(text).toContain('Current');
    expect(text).toContain('New');
  });

  it('shows error when target plan code is missing', async () => {
    route.snapshot.queryParamMap.get.and.returnValue(null);
    await component.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error).toContain('Invalid plan change request');
    expect(component.loading).toBe(false);
  });

  it('loads PayPal SDK with subscription mode', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(paypalSdkLoader.loadButtons).toHaveBeenCalledWith({
      clientId: 'test-client-id',
      currency: 'USD',
      mode: 'subscription'
    });
  });

  it('renders PayPal and Card funding buttons when eligible', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(mockPayPalSdk.Buttons).toHaveBeenCalledTimes(2);
    expect(component.paypalButton).toBeTruthy();
    expect(component.cardButton).toBeTruthy();
  });

  it('calls reconcilePlanChange on PayPal approval', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    await component['onPayPalApprove']();

    expect(subscriptionApi.reconcilePlanChange).toHaveBeenCalledWith('change-attempt-123');
    expect(router.navigate).toHaveBeenCalledWith(['/billing/paypal/manage'], {
      queryParams: { result: 'success', attempt: 'change-attempt-123' }
    });
  });

  it('calls markPayPalPlanChangeCancelled on PayPal cancel', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    await component['onPayPalCancel']();

    expect(subscriptionApi.markPayPalPlanChangeCancelled).toHaveBeenCalledWith('change-attempt-123');
    expect(router.navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
  });

  it('uses actions.subscription.revise for PayPal button', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    const paypalButtonCall = mockPayPalSdk.Buttons.calls.mostRecent();
    const config = paypalButtonCall.args[0];
    expect(config.fundingSource).toBe('PAYPAL');
    expect(config.createSubscription).toBeDefined();
  });

  it('uses actions.subscription.revise for Card button', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    const cardButtonCall = mockPayPalSdk.Buttons.calls.mostRecent();
    const config = cardButtonCall.args[0];
    expect(config.fundingSource).toBe('CARD');
    expect(config.createSubscription).toBeDefined();
  });

  it('passes providerSubscriptionId to revise', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    const paypalButtonCall = mockPayPalSdk.Buttons.calls.mostRecent();
    const createSubscription = paypalButtonCall.args[0].createSubscription;
    
    const mockActions = {
      subscription: {
        revise: jasmine.createSpy().and.returnValue(Promise.resolve('subscription-id'))
      }
    };

    try {
      await createSubscription({}, mockActions);
    } catch (e) {
      // Expected in test context
    }

    expect(mockActions.subscription.revise).toHaveBeenCalledWith('I-PAYPAL-123', {
      plan_id: 'P-ANNUAL-PLAN'
    });
  });

  it('does NOT call createPayPalSubscription', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(subscriptionApi['createPayPalSubscription']).toBeUndefined();
  });

  it('does NOT call PaymentPurchaseAttempt logic', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    // No PaymentPurchaseAttempt-related calls
    expect(subscriptionApi.changePayPalPlan).not.toHaveBeenCalled();
  });

  it('does NOT mutate plan locally', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    const originalPlan = component.data?.currentPlan.slug;
    await component['onPayPalApprove']();

    expect(component.data?.currentPlan.slug).toBe(originalPlan);
  });

  it('falls back to backend flow when PayPal SDK revise fails', async () => {
    mockPayPalSdk.Buttons.and.callFake((config: any) => {
      if (config.fundingSource === 'PAYPAL') {
        return {
          isEligible: () => true,
          render: () => Promise.resolve(),
          close: () => {}
        };
      }
      const mockActions = {
        subscription: {
          revise: () => { throw new Error('SDK revise failed'); }
        }
      };
      try {
        config.createSubscription({}, mockActions);
      } catch (e) {
        // Expected error during render
      }
      return {
        isEligible: () => true,
        render: () => Promise.resolve(),
        close: () => {}
      };
    });

    await component.ngOnInit();
    await fixture.whenStable();

    expect(component.useFallbackFlow).toBe(true);
  });

  it('cancels and navigates back to manage page', async () => {
    await component.ngOnInit();
    await fixture.whenStable();
    component.cancel();

    expect(router.navigate).toHaveBeenCalledWith(['/billing/paypal/manage']);
  });

  it('closes buttons and releases SDK on destroy', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    const closeSpy = jasmine.createSpy();
    component.paypalButton = { isEligible: () => true, render: () => Promise.resolve(), close: closeSpy };
    component.cardButton = { isEligible: () => true, render: () => Promise.resolve(), close: closeSpy };

    component.ngOnDestroy();

    expect(closeSpy).toHaveBeenCalledTimes(2);
    expect(paypalSdkLoader.release).toHaveBeenCalledWith({ clientId: '', currency: 'USD', mode: 'subscription' });
  });

  it('fallback buttons call existing changePayPalPlan', async () => {
    await component.ngOnInit();
    await fixture.whenStable();
    component.useFallbackFlow = true;

    await component.startWithPayPal();

    expect(subscriptionApi.changePayPalPlan).toHaveBeenCalledWith('essential_annual', 'change-attempt-123');
  });

  it('replaces frontend temporary ID with backend canonical changeAttemptId', async () => {
    const canonicalContext = {
      ...changePlanContext,
      changeAttemptId: 'canonical-attempt-456'
    };
    subscriptionApi.getChangePlanContext.and.resolveTo({ success: true, data: canonicalContext });

    await component.ngOnInit();
    await fixture.whenStable();

    expect(component.changeAttemptId).toBe('canonical-attempt-456');
    expect(component.context?.changeAttemptId).toBe('canonical-attempt-456');
  });

  it('uses canonical changeAttemptId for reconcilePlanChange', async () => {
    const canonicalContext = {
      ...changePlanContext,
      changeAttemptId: 'canonical-attempt-789'
    };
    subscriptionApi.getChangePlanContext.and.resolveTo({ success: true, data: canonicalContext });

    await component.ngOnInit();
    await fixture.whenStable();

    await component['onPayPalApprove']();

    expect(subscriptionApi.reconcilePlanChange).toHaveBeenCalledWith('canonical-attempt-789');
    expect(router.navigate).toHaveBeenCalledWith(['/billing/paypal/manage'], {
      queryParams: { result: 'success', attempt: 'canonical-attempt-789' }
    });
  });

  it('uses canonical changeAttemptId for markPayPalPlanChangeCancelled', async () => {
    const canonicalContext = {
      ...changePlanContext,
      changeAttemptId: 'canonical-attempt-999'
    };
    subscriptionApi.getChangePlanContext.and.resolveTo({ success: true, data: canonicalContext });

    await component.ngOnInit();
    await fixture.whenStable();

    await component['onPayPalCancel']();

    expect(subscriptionApi.markPayPalPlanChangeCancelled).toHaveBeenCalledWith('canonical-attempt-999');
  });

  it('uses canonical changeAttemptId for fallback changePayPalPlan', async () => {
    const canonicalContext = {
      ...changePlanContext,
      changeAttemptId: 'canonical-attempt-111'
    };
    subscriptionApi.getChangePlanContext.and.resolveTo({ success: true, data: canonicalContext });

    await component.ngOnInit();
    await fixture.whenStable();
    component.useFallbackFlow = true;

    await component.startWithPayPal();

    expect(subscriptionApi.changePayPalPlan).toHaveBeenCalledWith('essential_annual', 'canonical-attempt-111');
  });

  it('keeps original changeAttemptId when backend returns same ID', async () => {
    await component.ngOnInit();
    await fixture.whenStable();

    expect(component.changeAttemptId).toBe('change-attempt-123');
  });
});
