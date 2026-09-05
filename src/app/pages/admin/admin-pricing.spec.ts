import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CreditsApiService } from '../../api/credits-api.service';
import { AlertService } from '../../services/alert.service';
import { AdminPricing, normalizePlan } from './admin-pricing';

describe('AdminPricing', () => {
  const plan = { slug: 'essential', name: 'Essential', price: 24.99, annualPrice: 249, isActive: true, displayOrder: 2, popular: true,
    features: { essayAnalysesPerMonth: 100 }, stripe: { productId: 'prod_test', monthlyPriceId: 'price_month', annualPriceId: 'price_year' },
    assessmentCreditNudges: { softThresholdPercent: 50, warningThresholdPercent: 80 } };
  const pack = { code: 'TOPUP_SMALL', name: 'Small', credits: 10, price: 4.99, currency: 'USD', active: true,
    allowedPlans: ['essential'], displayOrder: 1, stripePriceId: 'price_topup' };
  const alerts = { showSuccess: jasmine.createSpy(), showError: jasmine.createSpy() };
  async function create(api: any) { await TestBed.configureTestingModule({ imports: [AdminPricing], providers: [provideRouter([]),
    { provide: CreditsApiService, useValue: api }, { provide: AlertService, useValue: alerts }] }).compileComponents();
    const fixture = TestBed.createComponent(AdminPricing); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); return fixture; }

  it('submits mutation DTOs, refetches authoritative data, and shows the exact success messages', async () => {
    const api = { getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }),
      updatePlan: jasmine.createSpy().and.resolveTo({}), updatePack: jasmine.createSpy().and.resolveTo({}) };
    const fixture = await create(api); expect(fixture.nativeElement.textContent).toContain('Save Plan'); expect(fixture.nativeElement.textContent).toContain('Save Credit Pack');
    await fixture.componentInstance.savePlan(fixture.componentInstance.plans[0]); await fixture.componentInstance.savePack(fixture.componentInstance.packs[0]); fixture.detectChanges();
    expect(api.getPricingConfig).toHaveBeenCalledTimes(3); expect(fixture.nativeElement.textContent).toContain('Credit pack saved.');
    expect(api.updatePlan).toHaveBeenCalledWith('essential', jasmine.objectContaining({ monthlyCredits: 100, monthlyPrice: 24.99 }));
    expect(api.updatePack).toHaveBeenCalledWith('TOPUP_SMALL', jasmine.objectContaining({ credits: 10, price: 4.99 }));
    const body=api.updatePlan.calls.mostRecent().args[1];expect(typeof body.monthlyCredits).toBe('number');expect(typeof body.monthlyPrice).toBe('number');expect(typeof body.displayOrder).toBe('number');expect(Number.isInteger(body.displayOrder)).toBeTrue();expect(typeof body.active).toBe('boolean');expect(typeof body.recommended).toBe('boolean');expect(typeof body.softThresholdPercent).toBe('number');expect(typeof body.warningThresholdPercent).toBe('number');expect(body.annualPrice===null||typeof body.annualPrice==='number').toBeTrue();expect(Object.keys(body).sort()).toEqual(['active','annualPrice','displayOrder','monthlyCredits','monthlyPrice','name','recommended','softThresholdPercent','stripeAnnualPriceId','stripeMonthlyPriceId','stripeProductId','warningThresholdPercent'].sort());
  });

  it('has readable keyboard-native buttons and disables only the card being saved', async () => {
    const fixture = await create({ getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }) });
    const buttons = [...fixture.nativeElement.querySelectorAll('.admin-primary-action')] as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Save Plan', 'Save Credit Pack']); expect(buttons.every(button => button.type === 'submit')).toBeTrue();
    fixture.componentInstance.saving.add('plan:essential'); fixture.detectChanges(); expect(buttons.map(button => button.disabled)).toEqual([true, false]);
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Saving...', 'Save Credit Pack']);
  });

  it('keeps the rendered labels visible in computed styles', async () => {
    const fixture = await create({ getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }) });
    const label = fixture.nativeElement.querySelector('.admin-primary-action span') as HTMLElement; const style = getComputedStyle(label);
    expect(label.innerText.trim()).toBe('Save Plan'); expect(style.color).toBe('rgb(255, 255, 255)'); expect(style.fontSize).not.toBe('0px');
    expect(style.opacity).toBe('1'); expect(style.visibility).toBe('visible'); expect(style.textIndent).toBe('0px');
  });

  it('surfaces backend validation messages through AlertService', async () => {
    const api = { getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }),
      updatePlan: jasmine.createSpy().and.rejectWith({ error: { message: 'Threshold order is invalid.' } }) };
    const fixture = await create(api); await fixture.componentInstance.savePlan(fixture.componentInstance.plans[0]);
    expect(alerts.showError).toHaveBeenCalledWith('Plan settings were not saved', 'Threshold order is invalid.');
  });
  it('normalizes the exact sparse production plan without nested-object errors', async()=>{
    const legacy:any={slug:'essential_annual',name:'Essential Annual',price:99,isActive:true};const normalized=normalizePlan(legacy);
    expect(normalized.softThresholdPercent).toBe(50);expect(normalized.warningThresholdPercent).toBe(80);expect(normalized.stripeProductId).toBe('');expect(normalized.monthlyCredits).toBe(0);
    const fixture=await create({getPricingConfig:jasmine.createSpy().and.resolveTo({plans:[legacy],packs:[]})});const inputs=[...fixture.nativeElement.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs.some(input=>input.value==='50')).toBeTrue();expect(inputs.some(input=>input.value==='80')).toBeTrue();expect(fixture.nativeElement.textContent).toContain('Save Plan');
  });
  it('keeps separate card edit models isolated',()=>{const first=normalizePlan(plan as any),second=normalizePlan({...plan,slug:'pro_monthly',name:'Pro Monthly'} as any);first.name='Changed';expect(second.name).toBe('Pro Monthly')});
  it('shows PayPal guidance while hiding normal Stripe inputs',async()=>{const api={getPricingConfig:jasmine.createSpy().and.resolveTo({plans:[structuredClone(plan)],packs:[structuredClone(pack)],provider:{activePaymentProvider:'paypal',paypalEnabled:true,stripeEnabled:false}})};const fixture=await create(api);const text=fixture.nativeElement.textContent;expect(text).toContain('PayPal subscription plan references');expect(text).toContain('PayPal top-ups use the Orders API');expect(fixture.nativeElement.querySelector('input[name^="product-"]')).toBeNull();expect(fixture.nativeElement.querySelector('input[name^="pack-stripe-"]')).toBeNull();expect(text).not.toMatch(/client secret|webhook secret/i)});
  it('shows Stripe configuration when Stripe is active',async()=>{const api={getPricingConfig:jasmine.createSpy().and.resolveTo({plans:[structuredClone(plan)],packs:[structuredClone(pack)],provider:{activePaymentProvider:'stripe',paypalEnabled:false,stripeEnabled:true}})};const fixture=await create(api);expect(fixture.nativeElement.querySelectorAll('.stripe-fields input').length).toBe(4)});
});
