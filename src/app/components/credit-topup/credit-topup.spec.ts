import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CreditsApiService } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { CreditTopupComponent } from './credit-topup';
import { AlertService } from '../../services/alert.service';

const pack: any = { name: '10 Assessment Credits', code: 'CREDITS_10', credits: 10, price: 1.99, currency: 'USD', allowedPlans: ['free'], displayOrder: 1 };
const pack50: any = { name: '50 Assessment Credits', code: 'CREDITS_50', credits: 50, price: 4.99, currency: 'USD', allowedPlans: ['free'], displayOrder: 2 };

describe('CreditTopupComponent', () => {
  let fixture: ComponentFixture<CreditTopupComponent>; let component: CreditTopupComponent; let credits: any; let state: any;let alerts:any;
  beforeEach(async () => {
    credits = { getPacks: jasmine.createSpy().and.resolveTo({ packs: [pack,pack50], paymentProvider: 'paypal' }),
      createPayPalOrder: jasmine.createSpy().and.resolveTo({ approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SAFE' }),
      createTopupCheckout: jasmine.createSpy().and.resolveTo({ url: 'https://checkout.stripe.com/c/pay/test', sessionId: 'cs_test' }),
      capturePayPalOrder: jasmine.createSpy().and.resolveTo({ credited: true, status: 'credited',credits:10 }), getPayPalPurchase: jasmine.createSpy(), cancelPayPalPurchase: jasmine.createSpy() };
    const wallet = signal<any>({ availableCredits: 25, purchasedCredits: 0 });
    state = { wallet, refreshCredits: jasmine.createSpy().and.callFake(async () => { wallet.set({ availableCredits: 35, purchasedCredits: 10 }); return wallet(); }) };
    alerts={showSuccess:jasmine.createSpy()};await TestBed.configureTestingModule({ imports: [CreditTopupComponent], providers: [
      { provide: CreditsApiService, useValue: credits }, { provide: AccountStateService, useValue: state },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },{provide:AlertService,useValue:alerts}
    ] }).compileComponents();
    fixture = TestBed.createComponent(CreditTopupComponent); component = fixture.componentInstance; fixture.detectChanges();
  });

  it('opens authoritative packs and starts exactly one PayPal order on double click', async () => {
    await component.open(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('10 Credits');
    expect(fixture.nativeElement.textContent).toContain('50 Credits');expect(fixture.nativeElement.textContent).toContain('$1.99');expect(fixture.nativeElement.textContent).toContain('$4.99');
    const navigate = spyOn<any>(component, 'navigateExternal');
    const first = component.purchase(pack); const second = component.purchase(pack); await Promise.all([first, second]);
    expect(credits.createPayPalOrder).toHaveBeenCalledTimes(1);
    expect(credits.createPayPalOrder).toHaveBeenCalledWith('CREDITS_10', jasmine.stringMatching(/^[0-9a-f-]{36}$/));
    expect(navigate).toHaveBeenCalledWith('https://www.sandbox.paypal.com/checkoutnow?token=SAFE');
  });

  it('preserves the Stripe checkout path and trusted navigation', async () => {
    component.paymentProvider = 'stripe'; const navigate = spyOn<any>(component, 'navigateExternal');
    await component.purchase(pack);
    expect(credits.createTopupCheckout).toHaveBeenCalledOnceWith('SMALL');
    expect(credits.createPayPalOrder).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/test');
  });

  it('successful PayPal capture refreshes shared wallet once without granting locally', async () => {
    await (component as any).confirmPayPal('attempt'); fixture.detectChanges();
    expect(credits.capturePayPalOrder).toHaveBeenCalledOnceWith('attempt');
    expect(state.refreshCredits).toHaveBeenCalledTimes(1);
    expect(state.wallet()).toEqual(jasmine.objectContaining({ availableCredits: 35, purchasedCredits: 10 }));
    expect(component.message).toContain('Credits added');
    expect(alerts.showSuccess).toHaveBeenCalledWith('Credits added','10 purchased Assessment Credits were added to your account.');
  });

  it('shows a recoverable empty state when no packs are configured',async()=>{credits.getPacks.and.resolveTo({packs:[],paymentProvider:'paypal'});await component.open();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('No Assessment Credit packs are currently available.')});

  it('reuses a stable PayPal attempt after a transient create failure', async () => {
    credits.createPayPalOrder.and.rejectWith(new Error('network'));
    component.paymentProvider = 'paypal'; await component.purchase(pack); const attempt = component.attemptId;
    await component.purchase(pack);
    expect(credits.createPayPalOrder.calls.allArgs()).toEqual([['SMALL', attempt], ['SMALL', attempt]]);
  });
});
