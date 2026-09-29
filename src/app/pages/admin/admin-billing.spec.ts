import { TestBed } from '@angular/core/testing';
import { AdminBilling } from './admin-billing';
import { BillingAdminApiService } from '../../api/billing-admin-api.service';
import { AlertService } from '../../services/alert.service';

describe('Admin billing confirmed assignment', () => {
  let component: AdminBilling;
  let api: { plans: jasmine.Spy; promos: jasmine.Spy; lookup: jasmine.Spy; preview: jasmine.Spy; assign: jasmine.Spy; savePromo: jasmine.Spy };
  let alerts: { showConfirm: jasmine.Spy };
  const target = { userId: 'teacher-id', message: null, email: 'teacher@example.test', currentPlan: 'Pro', currentExpiry: '2026-10-01', scheduled: [], blocked: false };
  const quote = { ...target, quoteId: 'server-quote', planSlug: 'essential', billingPeriod: 'annual', reason: 'Support correction',
    startsAt: '2026-09-29', endsAt: '2027-09-29', scheduled: [{ planSlug: 'pro', startsAt: '2026-10-01', endsAt: '2026-11-01' }] };
  beforeEach(() => {
    api = { plans: jasmine.createSpy().and.resolveTo([]), promos: jasmine.createSpy().and.resolveTo({ items: [] }),
      lookup: jasmine.createSpy().and.resolveTo(target), preview: jasmine.createSpy().and.resolveTo(quote),
      assign: jasmine.createSpy().and.resolveTo({}), savePromo: jasmine.createSpy().and.resolveTo({}) };
    alerts = { showConfirm: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ imports: [AdminBilling], providers: [{ provide: BillingAdminApiService, useValue: api }, { provide: AlertService, useValue: alerts }] });
    component = TestBed.runInInjectionContext(() => new AdminBilling());
    component.target = target; component.reason = 'Support correction';
  });
  it('shows target, old/future/new terms and supersession warning before writing', async () => {
    await component.assign();
    const text = alerts.showConfirm.calls.mostRecent().args[1];
    for (const value of [target.email, 'Pro', '2026-10-01', '2026-11-01', 'essential annual', '2026-09-29', '2027-09-29', 'superseded', 'purchased/bonus']) expect(text).toContain(value);
    expect(api.assign).toHaveBeenCalledOnceWith('server-quote', jasmine.any(String));
  });
  it('cancelling confirmation never assigns', async () => { alerts.showConfirm.and.resolveTo(false); await component.assign(); expect(api.assign).not.toHaveBeenCalled(); });
  it('legacy recurring block never previews or assigns', async () => { component.target = { ...target, blocked: true }; await component.assign(); expect(api.preview).not.toHaveBeenCalled(); expect(api.assign).not.toHaveBeenCalled(); });
  it('ambiguous response retries the exact operation, not a second grant', async () => {
    api.assign.and.rejectWith(new Error('network')); await component.assign(); const first = api.assign.calls.mostRecent().args;
    api.assign.and.resolveTo({}); await component.assign(); expect(api.assign.calls.mostRecent().args).toEqual(first); expect(api.preview).toHaveBeenCalledTimes(1);
  });
  it('stale preview requires a new preview on retry', async () => {
    api.assign.and.rejectWith({ error: { code: 'ADMIN_PREVIEW_CHANGED' } }); await component.assign();
    api.assign.and.resolveTo({}); await component.assign(); expect(api.preview).toHaveBeenCalledTimes(2);
  });
  it('creates or disables a promo through the admin API', async () => {
    component.promo.code = 'TEST20'; await component.savePromo(); expect(api.savePromo.calls.first().args[0].code).toBe('TEST20');
    component.editPromo({ ...component.emptyPromo(), _id: 'promo-id', code: 'TEST20', allocated: 0, consumed: 0 }); component.promo.active = false;
    await component.savePromo(); expect(api.savePromo.calls.mostRecent().args[1]).toBe('promo-id'); expect(api.savePromo.calls.mostRecent().args[0].active).toBeFalse();
  });
  it('uses one catalog for tier selection and paid promo restrictions', async () => {
    api.plans.and.resolveTo([
      { slug: 'free', tier: 'free', name: 'Free', periods: [], promoEligible: false },
      { slug: 'essential_monthly', tier: 'essential', name: 'Essential', periods: ['monthly'], promoEligible: true },
      { slug: 'essential_annual', tier: 'essential', name: 'Essential Annual', periods: ['annual'], promoEligible: true },
      { slug: 'pro_monthly', tier: 'pro', name: 'Pro', periods: ['monthly'], promoEligible: true },
      { slug: 'pro_annual', tier: 'pro', name: 'Pro Annual', periods: ['annual'], promoEligible: true }
    ]);
    await component.ngOnInit();
    expect(api.plans).toHaveBeenCalledTimes(1);
    expect(component.planTiers.map(plan => plan.name)).toEqual(['Free', 'Essential', 'Pro']);
    expect(component.promoPlans.map(plan => plan.slug)).not.toContain('free');
    component.planSlug = 'essential'; component.billingPeriod = 'annual';
    await component.assign();
    expect(api.preview.calls.mostRecent().args[0].planSlug).toBe('essential_annual');
    component.planSlug = 'pro'; component.billingPeriod = 'monthly';
    await component.assign();
    expect(api.preview.calls.mostRecent().args[0].planSlug).toBe('pro_monthly');
  });

  it('uses date-time input, validates range, and preserves unchanged stored timestamps', async () => {
    const row = { ...component.emptyPromo(), _id: 'promo-id', code: 'DATE20', allocated: 0, consumed: 0,
      validFrom: '2026-09-28T18:00:23.000Z', validUntil: '2026-10-28T18:00:23.000Z' };
    component.editPromo(row);
    await component.savePromo();
    expect(api.savePromo.calls.mostRecent().args[0].validFrom).toBe(row.validFrom);
    component.newPromo();
    component.promoDateFrom = '2026-10-02T12:00'; component.promoDateUntil = '2026-10-01T12:00';
    await component.savePromo();
    expect(component.dateError).toContain('End date');
    expect(api.savePromo).toHaveBeenCalledTimes(1);
    component.promoDateUntil = '2026-10-03T12:00';
    await component.savePromo();
    expect(api.savePromo.calls.mostRecent().args[0].validFrom).toBe(new Date('2026-10-02T12:00').toISOString());
    expect(api.savePromo.calls.mostRecent().args[0].validUntil).toBe(new Date('2026-10-03T12:00').toISOString());
    component.editPromo({ ...row, validFrom: api.savePromo.calls.mostRecent().args[0].validFrom });
    expect(component.promoDateFrom).toBe('2026-10-02T12:00');
  });
  it('renders native calendar controls instead of ISO text fields', async () => {
    const fixture = TestBed.createComponent(AdminBilling);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input[type="datetime-local"]').length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('UTC ISO date');
  });
});
