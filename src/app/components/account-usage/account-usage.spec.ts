import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccountUsage } from './account-usage';
import { buildAccountUsageViewModel, clampedUsagePercent, monthlyCreditUsage, preciseStoragePercent } from './account-usage.model';

const wallet: any = { plan: 'essential', monthlyCredits: 100, monthlyCreditsUsed: 96, monthlyCreditsRemaining: 4,
  purchasedCredits: 20, bonusCredits: 10, availableCredits: 34, billingCycleStart: '2026-08-12', billingCycleEnd: '2026-09-12',
  resetDate: '2026-09-12', usagePercent: 96, nudgeThresholds: { soft: 50, warning: 80 }, warningAcknowledged: false };
const subscription: any = { plan: { name: 'Essential', slug: 'essential', price: 15, currency: 'USD', billingInterval: 'month', popular: false,
  features: { storageMB: 500 }, display: { title: 'Essential' } }, planStartedAt: null, planExpiresAt: null,
  usage: { storageMB: 250 }, billing: null };

describe('account usage calculations', () => {
  it('keeps purchased and bonus credits out of monthly percentage', () => {
    expect(monthlyCreditUsage(wallet).percent).toBe(96);
    expect(clampedUsagePercent(750, 500)).toBe(100);
    expect(buildAccountUsageViewModel(wallet, subscription).storageUsagePercent).toBe(50);
  });

  it('uses authoritative bytes and preserves a non-zero percentage below one percent', () => {
    expect(preciseStoragePercent(0, 500 * 1024 * 1024, 0, 500)).toBe(0);
    expect(preciseStoragePercent(2.25 * 1024 * 1024, 500 * 1024 * 1024, 2, 500)).toBe(0.45);
    expect(preciseStoragePercent(250 * 1024 * 1024, 500 * 1024 * 1024, 250, 500)).toBe(50);
    expect(preciseStoragePercent(600 * 1024 * 1024, 500 * 1024 * 1024, 600, 500)).toBe(100);
    const value = buildAccountUsageViewModel(wallet, { ...subscription,
      storage: { usedBytes: 2.25 * 1024 * 1024, limitBytes: 500 * 1024 * 1024 }, usage: { storageMB: 2 } });
    expect(value.storageUsagePercent).toBe(0.45);
  });
});

describe('AccountUsage storage indicator', () => {
  let fixture: ComponentFixture<AccountUsage>;
  beforeEach(async () => { await TestBed.configureTestingModule({ imports: [AccountUsage] }).compileComponents();
    fixture = TestBed.createComponent(AccountUsage); fixture.componentInstance.wallet = wallet; fixture.componentInstance.subscription = subscription; fixture.detectChanges(); });

  it('shows compact server-provided storage in MB and has no usage modal trigger', () => {
    expect(fixture.nativeElement.textContent).toContain('250 MB / 500 MB');
    expect(fixture.nativeElement.textContent).toContain('50%');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.componentInstance.ringUsagePercent).toBe(50);
  });

  it('keeps a 2 GB allowance explicitly normalized to 2048 MB', () => {
    fixture.componentInstance.subscription = { ...subscription, plan: { ...subscription.plan,
      features: { ...subscription.plan.features, storageMB: 2048 } }, usage: { storageMB: 0 } };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('0 MB / 2048 MB');
  });

  it('shows a safe unavailable state without NaN', () => {
    fixture.componentInstance.subscription = null; fixture.componentInstance.subscriptionError = true; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Storage unavailable');
    expect(fixture.nativeElement.innerHTML).not.toContain('NaN');
  });
});
