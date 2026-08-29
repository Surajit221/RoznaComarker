import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AssessmentCreditWallet } from '../../api/credits-api.service';
import type { BackendMySubscription } from '../../api/subscription-api.service';
import { AccountUsage } from './account-usage';
import { buildAccountUsageViewModel, clampedUsagePercent, monthlyCreditUsage } from './account-usage.model';

const wallet = (overrides: Partial<AssessmentCreditWallet> = {}): AssessmentCreditWallet => ({
  plan: 'starter_monthly', monthlyCredits: 100, monthlyCreditsUsed: 96, monthlyCreditsRemaining: 4,
  purchasedCredits: 20, bonusCredits: 10, availableCredits: 34,
  billingCycleStart: '2026-08-12', billingCycleEnd: '2026-09-12', resetDate: '2026-09-12',
  usagePercent: 96, nudgeThresholds: { soft: 50, warning: 80 }, warningAcknowledged: false,
  ...overrides
});

const subscription = (): BackendMySubscription => ({
  plan: {
    name: 'Starter', slug: 'starter_monthly', price: 15, currency: 'USD', billingInterval: 'month', popular: false,
    features: { maxClasses: 5, maxStudents: 100, essayAnalysesPerMonth: 100, storageMB: 500,
      aiFlashcards: true, aiFlashcardsLimit: 20, aiWorksheets: true, aiWorksheetsLimit: 10,
      adaptiveLearning: true, adaptiveLearningLimit: null, priorityAIProcessing: false,
      analyticsAccess: true, dedicatedSupport: false },
    display: { title: 'Starter', description: null, priceLabel: '$15', cta: 'Choose Starter' },
    limits: { classes: 5, assignments: null, students: 100, submissions: null, storageMB: 500 }
  },
  planStartedAt: '2026-08-12', planExpiresAt: null,
  usage: { classes: 2, assignments: 4, students: 24, submissions: 30, storageMB: 250 },
  billing: { customerConfigured: true, subscriptionId: 'sub_test', status: 'active',
    currentPeriodEnd: '2026-09-12', cancelAtPeriodEnd: false, paymentIssue: false }
});

describe('account usage calculations', () => {
  it('derives monthly usage without purchased or bonus credits changing the percentage', () => {
    expect(monthlyCreditUsage(wallet())).toEqual({ allowance: 100, remaining: 4, used: 96, percent: 96 });
    expect(monthlyCreditUsage(wallet({ monthlyCreditsUsed: undefined as any, purchasedCredits: 900,
      bonusCredits: 700 }))).toEqual({ allowance: 100, remaining: 4, used: 96, percent: 96 });
    expect(monthlyCreditUsage(wallet({ monthlyCreditsUsed: 0, monthlyCreditsRemaining: 100 }))).toEqual({
      allowance: 100, remaining: 100, used: 0, percent: 0
    });
    expect(monthlyCreditUsage(wallet({ monthlyCreditsUsed: 100, monthlyCreditsRemaining: 0 }))).toEqual({
      allowance: 100, remaining: 0, used: 100, percent: 100
    });
    expect(monthlyCreditUsage(wallet({ monthlyCredits: 0, monthlyCreditsUsed: 0 }))).toEqual({
      allowance: 0, remaining: 4, used: 0, percent: null
    });
    expect(monthlyCreditUsage(null).percent).toBeNull();
  });

  it('clamps storage progress while preserving real storage values in the view model', () => {
    expect(clampedUsagePercent(0, 500)).toBe(0);
    expect(clampedUsagePercent(250, 500)).toBe(50);
    expect(clampedUsagePercent(750, 500)).toBe(100);
    expect(clampedUsagePercent(10, 0)).toBeNull();
    const usage = buildAccountUsageViewModel(wallet(), {
      ...subscription(), usage: { ...subscription().usage, storageMB: 750 }
    });
    expect(usage).toEqual(jasmine.objectContaining({ storageUsedMB: 750, storageLimitMB: 500, storageUsagePercent: 100 }));
  });
});

describe('AccountUsage', () => {
  let fixture: ComponentFixture<AccountUsage>;
  let component: AccountUsage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AccountUsage] }).compileComponents();
    fixture = TestBed.createComponent(AccountUsage);
    component = fixture.componentInstance;
    component.wallet = wallet();
    component.subscription = subscription();
    fixture.detectChanges();
  });

  afterEach(() => { component.close(); document.body.style.overflow = ''; });

  it('renders the live monthly percentage in a clamped ring with danger starting at 90%', () => {
    const cases = [
      { used: 0, remaining: 100, expected: 0, danger: false },
      { used: 50, remaining: 50, expected: 50, danger: false },
      { used: 89, remaining: 11, expected: 89, danger: false },
      { used: 90, remaining: 10, expected: 90, danger: true },
      { used: 96, remaining: 4, expected: 96, danger: true },
      { used: 100, remaining: 0, expected: 100, danger: true },
      { used: 140, remaining: 0, expected: 100, danger: true }
    ];

    for (const item of cases) {
      component.wallet = wallet({ monthlyCreditsUsed: item.used, monthlyCreditsRemaining: item.remaining });
      fixture.detectChanges();
      const ring = fixture.nativeElement.querySelector('[data-testid="usage-ring"]');
      const progress = ring.querySelector('.usage-ring-progress');
      const expectedOffset = component.ringCircumference - (item.expected / 100) * component.ringCircumference;
      expect(component.ringUsagePercent).withContext(`${item.used}% input`).toBe(item.expected);
      expect(Number(progress.getAttribute('stroke-dashoffset'))).withContext(`${item.expected}% offset`).toBeCloseTo(expectedOffset, 5);
      expect(ring.classList.contains('danger')).withContext(`${item.expected}% danger state`).toBe(item.danger);
      expect(fixture.nativeElement.querySelector('.usage-percent').textContent.trim()).toBe(`${item.expected}%`);
      expect(fixture.nativeElement.querySelector('.usage-trigger').getAttribute('aria-label'))
        .toContain(`${item.expected} percent`);
    }
  });

  it('uses a neutral safe ring while usage is loading and never renders NaN', () => {
    component.wallet = null;
    component.creditsLoading = true;
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.usage-trigger');
    const ring = fixture.nativeElement.querySelector('[data-testid="usage-ring"]');
    expect(ring.classList).toContain('unavailable');
    expect(ring.querySelector('.usage-ring-progress')).toBeNull();
    expect(fixture.nativeElement.querySelector('.usage-percent').textContent.trim()).toBe('--%');
    expect(trigger.getAttribute('aria-label')).toBe('Usage and plan');
    expect(ring.outerHTML).not.toContain('NaN');
    expect(ring.outerHTML).not.toContain('Infinity');
  });

  it('uses pointer cursors for enabled Usage and modal actions', () => {
    const trigger = fixture.nativeElement.querySelector('.usage-trigger');
    expect(getComputedStyle(trigger).cursor).toBe('pointer');
    component.open(); fixture.detectChanges();
    const actions = fixture.nativeElement.querySelectorAll('.usage-close, .warning-actions button, .manage-plan-action');
    expect(actions.length).toBeGreaterThan(0);
    actions.forEach((action: Element) => expect(getComputedStyle(action).cursor).toBe('pointer'));
  });

  it('opens a modal with live credit, storage, plan, and supported allowance data', () => {
    fixture.nativeElement.querySelector('[data-testid="account-usage-button"]').click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Starter');
    expect(dialog.textContent).toContain('34 remaining');
    expect(dialog.textContent).toContain('96% used');
    expect(dialog.textContent).toContain('250 MB of 500 MB');
    expect(dialog.textContent).toContain('AI worksheets');
    expect(dialog.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('96');
  });

  it('closes from the close button and Escape and returns focus to Usage', async () => {
    const trigger = fixture.nativeElement.querySelector('[data-testid="account-usage-button"]') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    fixture.nativeElement.querySelector('.usage-close').click(); fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.click(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('preserves Add Credits, plan, and warning dismissal actions', () => {
    const add = spyOn(component.addCredits, 'emit');
    const upgrade = spyOn(component.upgradePlan, 'emit');
    const dismiss = spyOn(component.dismissWarning, 'emit');
    component.open(); fixture.detectChanges();
    fixture.nativeElement.querySelector('.warning-actions button:first-child').click();
    expect(add).toHaveBeenCalled();
    component.open(); fixture.detectChanges();
    fixture.nativeElement.querySelector('.dismiss-action').click();
    expect(dismiss).toHaveBeenCalled();
    component.open(); fixture.detectChanges();
    fixture.nativeElement.querySelector('.manage-plan-action').click();
    expect(upgrade).toHaveBeenCalled();
  });

  it('renders loading and recoverable error states without fabricated zero values', () => {
    component.wallet = null; component.subscription = null;
    component.creditsLoading = true; component.subscriptionLoading = true;
    component.open(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.usage-skeleton')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('0 remaining');
    component.creditsLoading = false; component.subscriptionLoading = false;
    component.creditsError = true; component.subscriptionError = true; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Usage information couldn't be loaded.");
    expect(fixture.nativeElement.querySelector('.usage-error button').textContent.trim()).toBe('Retry');
    const retry = spyOn(component.retryUsage, 'emit');
    fixture.nativeElement.querySelector('.usage-error button').click();
    expect(retry).toHaveBeenCalled();
  });
});
