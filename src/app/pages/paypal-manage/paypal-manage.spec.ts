import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { PlansApiService } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';
import { PayPalManageComponent } from './paypal-manage';
import { AccountStateService } from '../../services/account-state.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { CreditTopupUiService } from '../../services/credit-topup-ui.service';

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
      markPayPalPlanChangeCancelled: jasmine.createSpy().and.resolveTo() };
    const subscriptionSignal = signal<any>(subscription); const walletSignal = signal<any>({ availableCredits: 42 });
    accountState = { refreshSubscription: jasmine.createSpy().and.callFake(() => Promise.resolve(subscriptionSignal())),
      refreshCredits: jasmine.createSpy().and.callFake(() => Promise.resolve(walletSignal())), refreshIfStale: jasmine.createSpy().and.resolveTo(),
      subscription: subscriptionSignal, wallet: walletSignal };
    creditsApi = { getPacks: jasmine.createSpy().and.resolveTo({ packs: [{ name: 'Small', code: 'SMALL', credits: 10, price: 5, currency: 'USD', allowedPlans: [], displayOrder: 1 }], paymentProvider: 'paypal' }),
      createPayPalOrder: jasmine.createSpy(), createTopupCheckout: jasmine.createSpy(), capturePayPalOrder: jasmine.createSpy(),
      getPayPalPurchase: jasmine.createSpy(), cancelPayPalPurchase: jasmine.createSpy() };
    await TestBed.configureTestingModule({ imports: [PayPalManageComponent], providers: [
      ...routedComponentProviders(),
      { provide: SubscriptionApiService, useValue: api },
      { provide: AccountStateService, useValue: accountState },
      { provide: CreditsApiService, useValue: creditsApi },
      { provide: PlansApiService, useValue: { getActivePlans: () => Promise.resolve([essential, pro]) } },
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
    expect(api.changePayPalPlan).toHaveBeenCalledWith('pro_monthly', attemptId);
    expect(fixture.componentInstance.subscription()?.plan.slug).toBe('essential_monthly');
  });

  it('reuses one attempt ID after a transient failure', async () => {
    api.changePayPalPlan.and.rejectWith(new Error('network'));
    fixture.componentInstance.choosePlan(pro);
    const attemptId = fixture.componentInstance.changeAttemptId;
    await fixture.componentInstance.confirmChange();
    api.changePayPalPlan.and.resolveTo({ requiresApproval: false, status: 'provider_pending', targetPlanCode: 'pro_monthly' });
    await fixture.componentInstance.confirmChange();
    expect(api.changePayPalPlan.calls.allArgs()).toEqual([
      ['pro_monthly', attemptId], ['pro_monthly', attemptId]
    ]);
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
    let resolve!: (value: any) => void;
    api.changePayPalPlan.and.returnValue(new Promise((done) => { resolve = done; }));
    fixture.componentInstance.choosePlan(pro);
    const first = fixture.componentInstance.confirmChange();
    const second = fixture.componentInstance.confirmChange();
    expect(api.changePayPalPlan).toHaveBeenCalledTimes(1);
    resolve({ requiresApproval: false, status: 'provider_pending', targetPlanCode: 'pro_monthly' });
    await Promise.all([first, second]);
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
});
