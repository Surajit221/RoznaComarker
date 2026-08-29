import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CreditsApiService } from '../../api/credits-api.service';
import { AdminPricing } from './admin-pricing';

describe('AdminPricing', () => {
  const plan = { slug: 'essential', name: 'Essential', price: 24.99, annualPrice: 249, isActive: true,
    displayOrder: 2, popular: true, features: { essayAnalysesPerMonth: 100 },
    stripe: { productId: 'prod_test', monthlyPriceId: 'price_month', annualPriceId: 'price_year' },
    assessmentCreditNudges: { softThresholdPercent: 50, warningThresholdPercent: 80 } };
  const pack = { code: 'TOPUP_SMALL', name: 'Small', credits: 10, price: 4.99, currency: 'USD', active: true,
    allowedPlans: ['essential'], displayOrder: 1, stripePriceId: 'price_topup' };

  it('loads canonical pricing config and submits only the plan and pack mutation DTOs', async () => {
    const api = {
      getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }),
      updatePlan: jasmine.createSpy().and.resolveTo({}), updatePack: jasmine.createSpy().and.resolveTo({})
    };
    await TestBed.configureTestingModule({ imports: [AdminPricing], providers: [provideRouter([]),
      { provide: CreditsApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(AdminPricing); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Pricing & Assessment Credits');
    expect(fixture.nativeElement.textContent).toContain('Essential');
    expect(fixture.nativeElement.textContent).toContain('Save Plan');
    expect(fixture.nativeElement.textContent).toContain('Save Pack');
    expect(fixture.nativeElement.textContent).toContain('Soft threshold (%)');
    expect(api.getPricingConfig).toHaveBeenCalledTimes(1);
    await fixture.componentInstance.savePlan(fixture.componentInstance.plans[0]);
    await fixture.componentInstance.savePack(fixture.componentInstance.packs[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Small saved successfully.');
    expect(api.updatePlan).toHaveBeenCalledWith('essential', jasmine.objectContaining({ monthlyCredits: 100, monthlyPrice: 24.99 }));
    expect(api.updatePack).toHaveBeenCalledWith('TOPUP_SMALL', jasmine.objectContaining({ credits: 10, price: 4.99 }));
  });

  it('does not overflow the page at supported phone widths', async () => {
    const api = { getPricingConfig: jasmine.createSpy().and.resolveTo({ plans: [structuredClone(plan)], packs: [structuredClone(pack)] }) };
    await TestBed.configureTestingModule({ imports: [AdminPricing], providers: [provideRouter([]),
      { provide: CreditsApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(AdminPricing); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 430]) {
      window.resizeTo(width, 800);
      host.style.width = `${width}px`;
      fixture.detectChanges();
      expect(host.scrollWidth).withContext(`${width}px viewport`).toBeLessThanOrEqual(host.clientWidth);
    }
  });
});
