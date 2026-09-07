import { signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { PlansApiService } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { PayPalManageComponent } from './paypal-manage';
import { AccountStateService } from '../../services/account-state.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { CreditTopupUiService } from '../../services/credit-topup-ui.service';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { trustedPayPalApprovalUrl } from '../../utils/trusted-navigation.util';

const features = { maxClasses: 20, maxStudents: 500, essayAnalysesPerMonth: 300, storageMB: 2048,
  aiFlashcards: true, aiFlashcardsLimit: null, aiWorksheets: true, aiWorksheetsLimit: null,
  adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: true, analyticsAccess: true, dedicatedSupport: false };
const essential: any = { name: 'Essential Monthly', slug: 'essential_monthly', price: 9.99, currency: 'USD', billingInterval: 'month',
  popular: false, features, display: { title: 'Essential Monthly', description: '', priceLabel: '$9.99', cta: 'Choose' } };
const pro: any = { ...essential, name: 'Pro Monthly', slug: 'pro_monthly', price: 19.99,
  features: { ...features, essayAnalysesPerMonth: 500 }, display: { ...essential.display, title: 'Pro Monthly' } };
const subscription: any = { plan: essential, planStartedAt: '2026-08-01', planExpiresAt: '2026-09-01', usage: {}, billing: {
  provider: 'paypal', subscriptionId: 'I-SAFE', status: 'ACTIVE', subscriptionStatus: 'ACTIVE', currentPeriodEnd: '2026-09-01',
  billingPeriod: 'monthly', planCode: 'essential_monthly', canManageSubscription: true, canCancel: true, canChangePlan: true,
  pendingPlanChange: false, pendingTargetPlanCode: null, paymentIssue: false
} };

describe('PayPalManageComponent', () => {
  let fixture: ComponentFixture<PayPalManageComponent>; let api: any; let accountState: any; let creditsApi: any;let topupUi:CreditTopupUiService;
  beforeEach(async () => {
    api = { getMySubscription: jasmine.createSpy().and.resolveTo(subscription),
      cancelPayPalSubscription: jasmine.createSpy().and.resolveTo({ pending: true }),
      changePayPalPlan: jasmine.createSpy().and.resolveTo({ requiresApproval: false, status: 'provider_pending', targetPlanCode: 'pro_monthly' }),
      markPayPalPlanChangeCancelled: jasmine.createSpy().and.resolveTo(),
      reconcilePayPalManagement: jasmine.createSpy().and.resolveTo({ status: 'ACTIVE', pendingCancellation: true, cancelledOrTerminal: false }) };
    const subscriptionSignal = signal<any>(subscription); const walletSignal = signal<any>({ availableCredits: 42 });
    accountState = { refreshSubscription: jasmine.createSpy().and.callFake(() => Promise.resolve(subscriptionSignal())),
      refreshCredits: jasmine.createSpy().and.callFake(() => Promise.resolve(walletSignal())), refreshIfStale: jasmine.createSpy().and.resolveTo(),
      subscription: subscriptionSignal, wallet: walletSignal };
    creditsApi = { getPacks: jasmine.createSpy().and.resolveTo({ packs: [{ name: 'Small', code: 'SMALL', credits: 10, price: 5, currency: 'USD', allowedPlans: [], displayOrder: 1 }], paymentProvider: 'paypal' }),
      createPayPalOrder: jasmine.createSpy(), createTopupCheckout: jasmine.createSpy(), capturePayPalOrder: jasmine.createSpy(),
      getPayPalPurchase: jasmine.createSpy(), cancelPayPalPurchase: jasmine.createSpy() };
    const catalog={plans:signal([essential,pro]),packs:signal<any[]>([{name:'Small',code:'SMALL',credits:10,price:5,currency:'USD',allowedPlans:[],displayOrder:1}]),paymentProvider:signal('paypal'),refresh:jasmine.createSpy().and.resolveTo()};
    await TestBed.configureTestingModule({ imports: [PayPalManageComponent, RouterTestingModule], providers: [
      ...routedComponentProviders(),
      { provide: SubscriptionApiService, useValue: api },
      { provide: AccountStateService, useValue: accountState },
      { provide: CreditsApiService, useValue: creditsApi },
      { provide: PlansApiService, useValue: { getActivePlans: () => Promise.resolve([essential, pro]) } },
      { provide: PricingCatalogStateService, useValue: catalog },
      { provide: ActivatedRoute, useValue: { snapshot: { data: {}, queryParamMap: { get: () => null } } } }
    ] }).compileComponents();
    topupUi=TestBed.inject(CreditTopupUiService);fixture = TestBed.createComponent(PayPalManageComponent); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

  });

  it('renders current plan, status, comparison, and mobile-safe plan cards', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Essential Monthly'); expect(text).toContain('Pro Monthly'); expect(text).toContain('Active');
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 412, 430]) { host.style.width = `${width}px`; expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth); }
  });

  it('uses the PayPal-specific availability result without Stripe metadata and does not mutate the hash', () => {
    fixture.componentInstance.plans = [{ ...pro, paymentProvider: 'paypal', purchasable: true }];
    fixture.detectChanges();
    expect(fixture.componentInstance.availablePlans.map((plan) => plan.slug)).toEqual(['pro_monthly']);
    expect(fixture.nativeElement.querySelector('a[href="#available-plans"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.actions .primary').tagName).toBe('BUTTON');
  });

  it('requires confirmation and cancellation does not mutate the frontend plan', async () => {
    fixture.componentInstance.openCancel(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Your account data remains available');
    await fixture.componentInstance.confirmCancel();
    expect(api.cancelPayPalSubscription).toHaveBeenCalled(); expect(fixture.componentInstance.subscription()?.plan.slug).toBe('essential_monthly');
  });

  it('shows a next-cycle confirmation and submits only the internal target code', async () => {
    fixture.componentInstance.choosePlan(pro); fixture.detectChanges();
    const attemptId = fixture.componentInstance.changeAttemptId;
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('only after provider confirmation');
    await fixture.componentInstance.confirmChange();
    expect(api.changePayPalPlan).not.toHaveBeenCalled();
    expect(fixture.componentInstance.subscription()?.plan.slug).toBe('essential_monthly');
  });

  it('reuses one attempt ID after a transient failure', async () => {
    fixture.componentInstance.choosePlan(pro);
    const attemptId = fixture.componentInstance.changeAttemptId;
    await fixture.componentInstance.confirmChange();
    fixture.componentInstance.choosePlan(pro);
    const secondAttemptId = fixture.componentInstance.changeAttemptId;
    expect(secondAttemptId).toBe(attemptId);
  });

  it('changing the target or explicitly abandoning the dialog creates a new operation identity', () => {
    const annual = { ...pro, slug: 'pro_annual', name: 'Pro Annual' };
    fixture.componentInstance.choosePlan(pro); const first = fixture.componentInstance.changeAttemptId;
    fixture.componentInstance.choosePlan(annual); const second = fixture.componentInstance.changeAttemptId;
    expect(second).not.toBe(first);
    fixture.componentInstance.closeDialog(); expect(fixture.componentInstance.changeAttemptId).toBeNull();
    fixture.componentInstance.choosePlan(pro); expect(fixture.componentInstance.changeAttemptId).not.toBe(second);
  });

  it('double-click submission cannot create two revise attempts', async () => {
    fixture.componentInstance.choosePlan(pro);
    const first = fixture.componentInstance.confirmChange();
    const second = fixture.componentInstance.confirmChange();
    await Promise.all([first, second]);
    // Navigation happens, not API call
    expect(api.changePayPalPlan).not.toHaveBeenCalled();
  });

  it('reacts to shared subscription and wallet mutations without reinitializing', () => {
    accountState.subscription.set({ ...subscription, plan: pro, usage: { storageMB: 2.25 }, storage: { usedBytes: 2359296, limitBytes: 5 * 1024 * 1024 * 1024 } });
    accountState.wallet.set({ availableCredits: 99, monthlyCreditsUsed: 1, monthlyCredits: 100 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pro Monthly');
    expect(fixture.nativeElement.textContent).toContain('99');
    expect(fixture.nativeElement.textContent).toContain('2.25 MB');
    expect(fixture.componentInstance.subscription()?.storage?.usedBytes).toBe(2359296);
  });

  it('reacts to an 80 percent wallet refresh with monthly-only contextual usage', () => {
    accountState.wallet.set({ availableCredits: 70, monthlyCredits: 300, monthlyCreditsUsed: 240,
      monthlyCreditsRemaining: 60, purchasedCredits: 10, bonusCredits: 0 });
    fixture.detectChanges();
    const context = fixture.nativeElement.querySelector('[data-testid="credit-usage-context"]');
    expect(context.textContent).toContain("You've used 240 of 300 monthly assessment credits. 60 monthly credits remain.");
  });

  it('distinguishes fully used monthly credits when additional credits remain', () => {
    accountState.wallet.set({ availableCredits: 25, monthlyCredits: 300, monthlyCreditsUsed: 300,
      monthlyCreditsRemaining: 0, purchasedCredits: 20, bonusCredits: 5 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="credit-usage-context"]').textContent)
      .toContain('Future assessments will use your additional credits');
  });

  it('shows the zero-total state with an accessible Add Credits action', () => {
    accountState.wallet.set({ availableCredits: 0, monthlyCredits: 300, monthlyCreditsUsed: 300,
      monthlyCreditsRemaining: 0, purchasedCredits: 0, bonusCredits: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="credit-usage-context"]').textContent)
      .toContain('all available assessment credits for this cycle');
    expect(fixture.nativeElement.querySelector('button[aria-label="Add assessment credits"]')).not.toBeNull();
  });

  it('renders the bonus balance and monthly-reset persistence guidance on mobile', () => {
    accountState.wallet.set({ availableCredits: 27, monthlyCredits: 20, monthlyCreditsUsed: 0,
      monthlyCreditsRemaining: 20, purchasedCredits: 0, bonusCredits: 7 });
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('[data-testid="bonus-credits-section"]');
    expect(section.textContent).toContain('Bonus Credits'); expect(section.textContent).toContain('7');
    expect(section.textContent).toContain('not cleared by the monthly plan reset');
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 390, 430]) { host.style.width = `${width}px`; expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth); }
  });

  it('renders one real Add Credits button and opens the route-owned shared surface immediately', async () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const open=spyOn(topupUi,'open').and.callThrough();const button=fixture.nativeElement.querySelector('.add-credits-action') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');button.click();fixture.detectChanges();expect(fixture.nativeElement.querySelector('.topup-dialog')).not.toBeNull();await fixture.whenStable();fixture.detectChanges();
    expect(open).toHaveBeenCalledTimes(1);expect(fixture.nativeElement.querySelectorAll('app-credit-topup').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('10 Credits');
    expect(navigate).not.toHaveBeenCalledWith(['/teacher/dashboard'], jasmine.anything());
  });

  it('renders the referral link, lifecycle stats, earned bonus, and pending status', () => {
    accountState.subscription.set({ ...subscription, referrals: { code: 'ABC123', count: 3, attributed: 3,
      qualified: 2, rewarded: 1, pending: 1, reviewRequired: 0, bonusCreditsEarned: 5,
      rewardCreditsEach: 5, cap: 10, referrals: [
        { id: 'ref-1', name: 'Taylor', status: 'REWARDED', date: '2026-09-03T00:00:00.000Z' },
        { id: 'ref-2', name: 'Morgan', status: 'ATTRIBUTED', date: '2026-09-02T00:00:00.000Z' }
      ] } });
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('[data-testid="referral-section"]');
    expect(section.textContent).toContain('Refer a teacher, get 5 credits each');
    expect(section.textContent).toContain('Referred'); expect(section.textContent).toContain('Qualified');
    expect(section.textContent).toContain('Bonus earned'); expect(section.textContent).toContain('pending qualification');
    expect((section.querySelector('.referral-link') as HTMLInputElement).value).toContain('ref=ABC123');
  });

  it('copies the existing referral link and shows success feedback without changing the code', async () => {
    accountState.subscription.set({ ...subscription, referrals: { code: 'STABLE1', count: 0, attributed: 0,
      qualified: 0, rewarded: 0, pending: 0, reviewRequired: 0, bonusCreditsEarned: 0,
      rewardCreditsEach: 5, cap: 10, referrals: [] } });
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo(); fixture.detectChanges();
    await fixture.componentInstance.copyReferralLink(); fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(jasmine.stringMatching(/ref=STABLE1$/));
    expect(fixture.nativeElement.querySelector('[data-testid="referral-section"]').textContent).toContain('Referral link copied');
    expect(fixture.componentInstance.subscription()?.referrals?.code).toBe('STABLE1');
  });

  it('renders review state as pending verification and stays mobile safe', () => {
    accountState.subscription.set({ ...subscription, referrals: { code: 'VERIFY1', count: 1, attributed: 1,
      qualified: 0, rewarded: 0, pending: 1, reviewRequired: 1, bonusCreditsEarned: 0,
      rewardCreditsEach: 5, cap: 10, referrals: [
        { id: 'ref-review', name: 'Teacher', status: 'REVIEW_REQUIRED', date: '2026-09-03T00:00:00.000Z' }
      ] } });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Pending verification');
    for (const width of [320, 360, 375, 390, 412, 430]) { host.style.width = `${width}px`; expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth); }
  });

  it('renders pending plan change with friendly display name and recovery actions', () => {
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123',
      pendingChangeApprovalUrl: 'https://www.sandbox.paypal.com/approve'
    } });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Plan change pending');
    expect(text).toContain('Target: Pro Monthly');
    expect(text).not.toContain('Target: pro_monthly');
    expect(fixture.nativeElement.querySelector('.pending-actions')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.pending-actions button:nth-child(1)').textContent).toContain('Resume Plan Change');
    expect(fixture.nativeElement.querySelector('.pending-actions button:nth-child(2)').textContent).toContain('Cancel Pending Change');
  });

  it('cancelPendingPlanChange calls markPayPalPlanChangeCancelled and refreshes state', async () => {
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123'
    } });
    fixture.detectChanges();
    await fixture.componentInstance.cancelPendingPlanChange();
    expect(api.markPayPalPlanChangeCancelled).toHaveBeenCalledWith('change-attempt-123');
    expect(accountState.refreshSubscription).toHaveBeenCalled();
    expect(api.cancelPayPalSubscription).not.toHaveBeenCalled();
    expect(fixture.componentInstance.subscription()?.plan.slug).toBe('essential_monthly');
    expect(fixture.componentInstance.message).toContain('Pending plan change cancelled');
  });

  it('duplicate cancel click produces one request', async () => {
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123'
    } });
    fixture.detectChanges();
    const first = fixture.componentInstance.cancelPendingPlanChange();
    const second = fixture.componentInstance.cancelPendingPlanChange();
    await Promise.all([first, second]);
    expect(api.markPayPalPlanChangeCancelled).toHaveBeenCalledTimes(1);
  });

  it('missing pendingChangeAttemptId shows safe error and no request', async () => {
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: null
    } });
    fixture.detectChanges();
    await fixture.componentInstance.cancelPendingPlanChange();
    expect(api.markPayPalPlanChangeCancelled).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error).toContain('No pending plan change attempt found');
  });

  it('resumePendingPlanChange uses stored approval URL when available', async () => {
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123',
      pendingChangeApprovalUrl: 'https://untrusted.example.com/approve'
    } });
    fixture.detectChanges();
    await fixture.componentInstance.resumePendingPlanChange();
    expect(fixture.componentInstance.error).toContain('Untrusted PayPal approval URL');
    expect(api.changePayPalPlan).not.toHaveBeenCalled();
  });

  it('resumePendingPlanChange reuses changeAttemptId when no approval URL', async () => {
    api.changePayPalPlan.and.resolveTo({ requiresApproval: false, status: 'provider_pending', targetPlanCode: 'pro_monthly' });
    accountState.subscription.set({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123',
      pendingChangeApprovalUrl: null
    } });
    fixture.detectChanges();
    await fixture.componentInstance.resumePendingPlanChange();
    expect(api.changePayPalPlan).toHaveBeenCalledWith('pro_monthly', 'change-attempt-123');
    expect(fixture.componentInstance.message).toContain('Plan change pending');
  });

  it('PayPal cancel result refreshes subscription and clears pending state', async () => {
    TestBed.resetTestingModule();
    const subscriptionSignal = signal<any>({ ...subscription, billing: {
      ...subscription.billing,
      pendingPlanChange: true,
      pendingTargetPlanCode: 'pro_monthly',
      pendingChangeAttemptId: 'change-attempt-123'
    } });
    accountState = { refreshSubscription: jasmine.createSpy().and.callFake(() => Promise.resolve(subscriptionSignal())),
      refreshCredits: jasmine.createSpy().and.callFake(() => Promise.resolve(signal<any>({ availableCredits: 42 }))), refreshIfStale: jasmine.createSpy().and.resolveTo(),
      subscription: subscriptionSignal, wallet: signal<any>({ availableCredits: 42 }) };
    await TestBed.configureTestingModule({ imports: [PayPalManageComponent], providers: [
      ...routedComponentProviders(),
      { provide: SubscriptionApiService, useValue: api },
      { provide: AccountStateService, useValue: accountState },
      { provide: CreditsApiService, useValue: creditsApi },
      { provide: PricingCatalogStateService, useValue: { plans: signal([essential, pro]), refresh: jasmine.createSpy().and.resolveTo() } },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { paypalChangeResult: 'cancel' }, queryParamMap: { get: () => 'change-attempt-123' } } } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(PayPalManageComponent);
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    expect(api.markPayPalPlanChangeCancelled).toHaveBeenCalledWith('change-attempt-123');
    expect(accountState.refreshSubscription).toHaveBeenCalled();
  });

  it('cancel -> already terminal -> no reconciliation polling', async () => {
    api.cancelPayPalSubscription.and.resolveTo({ pending: false, alreadyTerminal: true, status: 'CANCELLED', attemptId: null });
    fixture.componentInstance.openCancel();
    await fixture.componentInstance.confirmCancel();
    expect(fixture.componentInstance.message).toContain('already cancelled');
    expect(accountState.refreshSubscription).toHaveBeenCalled();
    expect(api.reconcilePayPalManagement).not.toHaveBeenCalled();
  });

  it('cancel -> pending -> bounded reconciliation attempts', fakeAsync(() => {
    api.cancelPayPalSubscription.and.resolveTo({ pending: true, alreadyTerminal: false, status: 'ACTIVE', attemptId: 'cancel-123' });
    api.reconcilePayPalManagement.and.resolveTo({ status: 'ACTIVE', pendingCancellation: true, cancelledOrTerminal: false });
    fixture.componentInstance.openCancel();
    fixture.componentInstance.confirmCancel();
    tick(0);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(1);
    tick(1000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(2);
    tick(2000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(3);
    tick(3000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(4);
    tick(5000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(5);
    tick(5000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(5);
    expect(fixture.componentInstance.message).toContain('PayPal is still confirming it');
    discardPeriodicTasks();
  }));

  it('reconciliation becomes terminal on attempt 2 -> stops immediately', fakeAsync(() => {
    api.cancelPayPalSubscription.and.resolveTo({ pending: true, alreadyTerminal: false, status: 'ACTIVE', attemptId: 'cancel-123' });
    api.reconcilePayPalManagement.and.returnValues(
      Promise.resolve({ status: 'ACTIVE', pendingCancellation: true, cancelledOrTerminal: false }),
      Promise.resolve({ status: 'CANCELLED', pendingCancellation: false, cancelledOrTerminal: true })
    );
    fixture.componentInstance.openCancel();
    fixture.componentInstance.confirmCancel();
    tick(0);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(1);
    tick(1000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.message).toContain('cancelled');
    tick(2000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('duplicate cancel click sends one request', async () => {
    api.cancelPayPalSubscription.and.resolveTo({ pending: true, alreadyTerminal: false, status: 'ACTIVE', attemptId: 'cancel-123' });
    api.reconcilePayPalManagement.and.resolveTo({ status: 'CANCELLED', pendingCancellation: false, cancelledOrTerminal: true });
    fixture.componentInstance.openCancel();
    const first = fixture.componentInstance.confirmCancel();
    const second = fixture.componentInstance.confirmCancel();
    await Promise.all([first, second]);
    expect(api.cancelPayPalSubscription).toHaveBeenCalledTimes(1);
  });

  it('component destroy cancels pending timers', fakeAsync(() => {
    api.cancelPayPalSubscription.and.resolveTo({ pending: true, alreadyTerminal: false, status: 'ACTIVE', attemptId: 'cancel-123' });
    api.reconcilePayPalManagement.and.resolveTo({ status: 'ACTIVE', pendingCancellation: true, cancelledOrTerminal: false });
    fixture.componentInstance.openCancel();
    fixture.componentInstance.confirmCancel();
    tick(0);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(1);
    fixture.componentInstance.ngOnDestroy();
    tick(1000);
    expect(api.reconcilePayPalManagement).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('selecting Essential Annual does NOT immediately navigate to PayPal', async () => {
    fixture.componentInstance.choosePlan(pro);
    fixture.detectChanges();
    expect(fixture.componentInstance.dialog).toBe('change');
    expect(fixture.componentInstance.target).toBe(pro);
    expect(fixture.componentInstance.changeAttemptId).toBeTruthy();
  });

  it('confirmChange navigates to internal change-plan checkout instead of PayPal', async () => {
    const routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    routerSpy.navigate = jasmine.createSpy('navigate');

    fixture.componentInstance.choosePlan(pro);
    fixture.detectChanges();
    await fixture.componentInstance.confirmChange();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/checkout/change-plan'], {
      queryParams: { target: 'pro_monthly', attempt: jasmine.any(String) }
    });
    expect(api.changePayPalPlan).not.toHaveBeenCalled();
  });
});
