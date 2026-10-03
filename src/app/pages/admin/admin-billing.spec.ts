import { TestBed } from '@angular/core/testing';
import { AdminBilling } from './admin-billing';
import { BillingAdminApiService } from '../../api/billing-admin-api.service';

describe('Admin billing confirmed assignment', () => {
  let component: AdminBilling;
  let api: { plans: jasmine.Spy; promos: jasmine.Spy; lookup: jasmine.Spy; preview: jasmine.Spy; assign: jasmine.Spy; savePromo: jasmine.Spy };
  const target = { userId: 'teacher-id', message: null, email: 'teacher@example.test', currentPlan: 'Pro', currentExpiry: '2026-10-01', scheduled: [], blocked: false };
  const quote = { ...target, quoteId: 'server-quote', planSlug: 'essential', billingPeriod: 'annual', reason: 'Support correction',
    startsAt: '2026-09-29', endsAt: '2027-09-29', scheduled: [{ planSlug: 'pro', startsAt: '2026-10-01', endsAt: '2026-11-01' }] };
  beforeEach(() => {
    api = { plans: jasmine.createSpy().and.resolveTo([]), promos: jasmine.createSpy().and.resolveTo({ items: [] }),
      lookup: jasmine.createSpy().and.resolveTo(target), preview: jasmine.createSpy().and.resolveTo(quote),
      assign: jasmine.createSpy().and.resolveTo({}), savePromo: jasmine.createSpy().and.resolveTo({}) };
    TestBed.configureTestingModule({ imports: [AdminBilling], providers: [{ provide: BillingAdminApiService, useValue: api }] });
    component = TestBed.runInInjectionContext(() => new AdminBilling());
    component.target = target; component.reason = 'Support correction';
  });
  afterEach(() => { document.body.style.overflow = ''; });
  it('shows server preview in structured dialog before writing, with human labels and dates', async () => {
    api.plans.and.resolveTo([{slug:'essential',tier:'essential',name:'Essential',periods:['monthly','annual'],promoEligible:true}]);
    const fixture = TestBed.createComponent(AdminBilling);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.target = target;
    fixture.componentInstance.reason = quote.reason;
    await fixture.componentInstance.assign(); fixture.detectChanges();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const text = dialog.textContent || '';
    for (const value of ['Confirm manual plan assignment','Current user & plan','New plan details','Important',target.email,'Pro','Essential','Annual','Support correction','superseded','without a payment','purchased/bonus']) expect(text).toContain(value);
    expect(text).not.toContain('essential_monthly');
    expect(text).not.toContain('2026-09-29');
    expect(api.assign).not.toHaveBeenCalled();
    await fixture.componentInstance.confirmAssignment();
    expect(api.assign).toHaveBeenCalledOnceWith('server-quote', jasmine.any(String));
  });
  it('cancelling confirmation never assigns', async () => { await component.assign(); component.cancelConfirmation(); expect(component.confirmation).toBeNull(); expect(api.assign).not.toHaveBeenCalled(); });
  it('keeps long server values as text and formats scheduled dates', async () => {
    api.preview.and.resolveTo({ ...quote, email:'very.long.address.with.sections@example.test', reason:'Support <script>alert(1)</script> correction',
      planSlug:'essential_monthly', billingPeriod:'monthly', startsAt:'2026-10-03T08:44:45.253Z', endsAt:'2026-11-03T08:44:45.253Z',
      scheduled:[{planSlug:'pro_annual',startsAt:'2026-10-05T08:44:45.253Z',endsAt:'2027-10-05T08:44:45.253Z'}] });
    api.plans.and.resolveTo([{slug:'essential_monthly',tier:'essential',name:'Essential Monthly',periods:['monthly'],promoEligible:true},
      {slug:'pro_annual',tier:'pro',name:'Pro Annual',periods:['annual'],promoEligible:true}]);
    const fixture=TestBed.createComponent(AdminBilling);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.target=target;fixture.componentInstance.reason=quote.reason;
    await fixture.componentInstance.assign();fixture.detectChanges();
    const dialog:HTMLElement=fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('very.long.address.with.sections@example.test');
    expect(dialog.textContent).toContain('Support <script>alert(1)</script> correction');
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.textContent).toContain('Pro');
    expect(dialog.textContent).not.toContain('pro_annual');
    expect(dialog.textContent).not.toContain('2026-10-03T08:44:45.253Z');
    expect(dialog.querySelector('[title="2026-10-03T08:44:45.253Z"]')).not.toBeNull();
    expect(dialog.querySelectorAll('.assignment-row').length).toBe(9);
  });
  it('Escape and Cancel close without assigning and restore focus', async () => {
    const fixture=TestBed.createComponent(AdminBilling);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.target=target;fixture.componentInstance.reason=quote.reason;
    const trigger:HTMLButtonElement=fixture.nativeElement.querySelector('.admin-card .admin-btn-primary');
    trigger.focus();await fixture.componentInstance.assign();fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(api.assign).not.toHaveBeenCalled();
    await fixture.componentInstance.assign();fixture.detectChanges();
    const cancel:HTMLButtonElement=fixture.nativeElement.querySelector('.assignment-actions .admin-btn-secondary');
    cancel.click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(api.assign).not.toHaveBeenCalled();
  });
  it('disables actions and sends exactly one confirm request while assignment is pending', async () => {
    let finish!: (value: object) => void;
    api.assign.and.returnValue(new Promise<object>(resolve=>{finish=resolve;}));
    const fixture=TestBed.createComponent(AdminBilling);fixture.detectChanges();await fixture.whenStable();
    fixture.componentInstance.target=target;fixture.componentInstance.reason=quote.reason;
    await fixture.componentInstance.assign();fixture.detectChanges();
    const action:HTMLButtonElement=fixture.nativeElement.querySelector('.assignment-actions .admin-btn-primary');
    const first=fixture.componentInstance.confirmAssignment();fixture.detectChanges();
    expect(action.disabled).toBeTrue();
    expect(action.textContent).toContain('Assigning');
    expect((fixture.nativeElement.querySelector('.assignment-actions .admin-btn-secondary') as HTMLButtonElement).disabled).toBeTrue();
    await fixture.componentInstance.confirmAssignment();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(fixture.componentInstance.confirmation).not.toBeNull();
    expect(api.assign).toHaveBeenCalledTimes(1);
    finish({});await first;fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
  it('legacy recurring block never previews or assigns', async () => { component.target = { ...target, blocked: true }; await component.assign(); expect(api.preview).not.toHaveBeenCalled(); expect(api.assign).not.toHaveBeenCalled(); });
  it('ambiguous response retries the exact operation, not a second grant', async () => {
    api.assign.and.rejectWith(new Error('network')); await component.assign(); await component.confirmAssignment(); const first = api.assign.calls.mostRecent().args;
    api.assign.and.resolveTo({}); await component.confirmAssignment(); expect(api.assign.calls.mostRecent().args).toEqual(first); expect(api.preview).toHaveBeenCalledTimes(1);
  });
  it('stale preview requires a new preview on retry', async () => {
    api.assign.and.rejectWith({ error: { code: 'ADMIN_PREVIEW_CHANGED' } }); await component.assign(); await component.confirmAssignment();
    api.assign.and.resolveTo({}); await component.assign(); expect(api.preview).toHaveBeenCalledTimes(2);
  });
  it('creates or disables a promo through the admin API', async () => {
    component.promo.code = 'TEST20'; await component.savePromo(); expect(api.savePromo.calls.first().args[0].code).toBe('TEST20');
    component.editPromo({ ...component.emptyPromo(), billingPeriods: [], _id: 'promo-id', code: 'TEST20', allocated: 0, consumed: 0 }); component.promo.active = false;
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
    component.cancelConfirmation();
    component.planSlug = 'pro'; component.billingPeriod = 'monthly';
    await component.assign();
    expect(api.preview.calls.mostRecent().args[0].planSlug).toBe('pro_monthly');
  });

  it('uses date-time input, validates range, and preserves unchanged stored timestamps', async () => {
    const row = { ...component.emptyPromo(), billingPeriods: [], _id: 'promo-id', code: 'DATE20', allocated: 0, consumed: 0,
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
  it('renders promo restrictions and all existing row actions using the loaded catalog', async () => {
    api.plans.and.resolveTo([
      { slug: 'essential_annual', name: 'Essential Annual', periods: ['annual'], tier: 'essential', promoEligible: true },
      { slug: 'pro_monthly', name: 'Pro', periods: ['monthly'], tier: 'pro', promoEligible: true }
    ]);
    api.promos.and.resolveTo({ items: [
      { ...component.emptyPromo(), _id: 'tat', code: 'TAT', plans: ['essential_annual'], billingPeriods: ['annual'], allocated: 0, consumed: 0 },
      { ...component.emptyPromo(), _id: 'pro', code: 'PRO15', plans: ['pro_monthly'], billingPeriods: ['monthly'], allocated: 2, consumed: 1 },
      { ...component.emptyPromo(), billingPeriods: [], _id: 'all', code: 'ALL', allocated: 0, consumed: 0 }
    ] });
    const fixture = TestBed.createComponent(AdminBilling);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.promo-table tbody tr');
    for (const value of ['TAT', '20', 'Essential Annual', 'Annual', 'Active', '0 / 0', 'Edit']) expect(rows[0].textContent).toContain(value);
    expect(rows[1].textContent).toContain('Pro');
    expect(rows[2].textContent).toContain('All paid plans');
    expect(api.plans).toHaveBeenCalledTimes(1); expect(api.promos).toHaveBeenCalledTimes(1);
    expect(rows[0].querySelectorAll('[data-label]').length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('select[multiple]').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Periods (none means both)');
    expect(fixture.nativeElement.querySelector('[data-label="Period"]')).toBeNull();
  });
  it('editing and saving retains exact restrictions and does not mutate the listed row', async () => {
    const row = { ...component.emptyPromo(), _id: 'tat', code: 'TAT', plans: ['essential_annual'], billingPeriods: ['annual'], allocated: 0, consumed: 0 };
    component.editPromo(row);
    expect(component.promo.plans).not.toBe(row.plans);
    expect('billingPeriods' in component.promo).toBeFalse();
    await component.savePromo();
    expect(api.savePromo.calls.mostRecent().args[0].plans).toEqual(['essential_annual']);
    expect('billingPeriods' in api.savePromo.calls.mostRecent().args[0]).toBeFalse();
    expect(row.plans).toEqual(['essential_annual']);
  });
  it('preserves multiple plan selections and sends only the edited plans for server derivation', async () => {
    component.editPromo({ ...component.emptyPromo(), _id: 'mixed', code: 'MIXED', plans: ['essential', 'essential_annual'], billingPeriods: ['monthly', 'annual'], allocated: 0, consumed: 0 });
    expect(component.promo.plans).toEqual(['essential', 'essential_annual']);
    component.promo.plans = ['pro_annual'];
    await component.savePromo();
    expect(api.savePromo.calls.mostRecent().args[0].plans).toEqual(['pro_annual']);
    expect('billingPeriods' in api.savePromo.calls.mostRecent().args[0]).toBeFalse();
  });
  it('shows legacy narrower restrictions inline and uses catalog annual metadata for labels', () => {
    component.plans = [{ slug: 'essential', name: 'Essential', tier: 'essential', periods: ['monthly', 'annual'], promoEligible: true, price: 10, annualPrice: 100, currency: 'USD' }];
    const row = { ...component.emptyPromo(), _id: 'old', code: 'OLD', billingPeriods: ['annual'], allocated: 0, consumed: 0 };
    expect(component.promoPlanLabel(row)).toBe('All paid plans (Annual)');
    expect(component.promoPlanLabel({ ...row, plans: ['essential'] })).toBe('Essential (Annual)');
    expect(component.promoCatalogLabel({ ...component.plans[0], slug: 'essential_annual', periods: ['annual'] })).toBe('Essential Annual');
  });
});
