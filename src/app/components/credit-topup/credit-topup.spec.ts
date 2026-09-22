import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CreditsApiService } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { CreditTopupComponent } from './credit-topup';
import { AlertService } from '../../services/alert.service';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { PayPalSdkLoaderService } from '../../services/paypal-sdk-loader.service';

const pack: any = { name: '10 Assessment Credits', code: 'CREDITS_10', credits: 10, price: 1.99, currency: 'USD', allowedPlans: ['free'], displayOrder: 1 };
const pack50: any = { name: '50 Assessment Credits', code: 'CREDITS_50', credits: 50, price: 4.99, currency: 'USD', allowedPlans: ['free'], displayOrder: 2 };

describe('CreditTopupComponent', () => {
  let fixture: ComponentFixture<CreditTopupComponent>; let component: CreditTopupComponent; let credits: any; let state: any;let alerts:any;let catalog:any;let sdk:any;let buttonOptions:any[];
  beforeEach(async () => {
    credits = { getPacks: jasmine.createSpy().and.resolveTo({ packs: [pack,pack50], paymentProvider: 'paypal' }),
      createPayPalOrder: jasmine.createSpy().and.resolveTo({ orderId:'ORDER',approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SAFE' }),
      capturePayPalOrder: jasmine.createSpy().and.resolveTo({ credited: true, status: 'credited',credits:10 }), getPayPalPurchase: jasmine.createSpy(), cancelPayPalPurchase: jasmine.createSpy() };
    credits.getPayPalCapabilities=jasmine.createSpy().and.resolveTo({provider:'paypal',environment:'sandbox',clientId:'safe-client',browserToken:'safe-browser-token',paypalCheckout:true,advancedCardPayments:true,cardTopups:true,cardSubscriptions:false});
    credits.createPayPalCardOrder=jasmine.createSpy().and.resolveTo({orderId:'ORDER',status:'approval_pending'});
    buttonOptions=[];sdk={release:jasmine.createSpy()};sdk.loadButtons=jasmine.createSpy().and.resolveTo({FUNDING:{PAYPAL:'paypal',CARD:'card'},Buttons:(options:any)=>{buttonOptions.push(options);return{isEligible:()=>true,render:jasmine.createSpy().and.resolveTo(),close:jasmine.createSpy()}}});
    const wallet = signal<any>({ availableCredits: 25, purchasedCredits: 0 });
    state = { wallet, refreshCredits: jasmine.createSpy().and.callFake(async () => { wallet.set({ availableCredits: 35, purchasedCredits: 10 }); return wallet(); }) };
    catalog={packs:signal<any[]>([]),paymentProvider:signal('paypal')};catalog.refreshCreditPacks=jasmine.createSpy().and.callFake(async()=>{const value=await credits.getPacks();catalog.packs.set(value.packs);catalog.paymentProvider.set(value.paymentProvider)});
    alerts={showSuccess:jasmine.createSpy()};await TestBed.configureTestingModule({ imports: [CreditTopupComponent], providers: [
      { provide: CreditsApiService, useValue: credits }, { provide: AccountStateService, useValue: state },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },{provide:AlertService,useValue:alerts},{provide:PricingCatalogStateService,useValue:catalog},{provide:PayPalSdkLoaderService,useValue:sdk}
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
    await component.purchase(pack); const attempt = component.attemptId;
    await component.purchase(pack);
    expect(credits.createPayPalOrder.calls.allArgs()).toEqual([['CREDITS_10', attempt], ['CREDITS_10', attempt]]);
  });
  it('clears a selected pack when realtime catalog refresh removes it',async()=>{await component.open();component.attemptPackCode='CREDITS_10';component.attemptId='attempt';catalog.packs.set([pack50]);fixture.detectChanges();expect(component.attemptPackCode).toBeNull();expect(component.attemptId).toBeNull();expect(component.message).toContain('no longer available')});
  it('renders eligible PayPal and Card funding buttons with no raw card state',async()=>{await component.open();await component.selectPack(pack);fixture.detectChanges();expect(component.paypalButtonEligible).toBeTrue();expect(component.cardButtonEligible).toBeTrue();expect(buttonOptions.map(value=>value.fundingSource)).toEqual(['paypal','card']);expect(fixture.nativeElement.querySelector('#paypal-card-number')).toBeNull();expect(component).not.toEqual(jasmine.objectContaining({cardNumber:jasmine.anything(),cvv:jasmine.anything(),expiry:jasmine.anything()}));});
  it('hides only ineligible Card funding and preserves PayPal',async()=>{sdk.loadButtons.and.resolveTo({FUNDING:{PAYPAL:'paypal',CARD:'card'},Buttons:(options:any)=>({isEligible:()=>options.fundingSource==='paypal',render:jasmine.createSpy().and.resolveTo(),close:jasmine.createSpy()})});await component.open();await component.selectPack(pack);fixture.detectChanges();expect(component.paypalButtonEligible).toBeTrue();expect(component.cardButtonEligible).toBeFalse();expect(fixture.nativeElement.querySelector('#paypal-topup-button')).toBeTruthy();expect(fixture.nativeElement.querySelector('#paypal-topup-card-button')).toBeNull();});
  it('funding callbacks create and capture the same durable attempt once',async()=>{await component.open();await component.selectPack(pack);const orderId=await buttonOptions[1].createOrder();expect(orderId).toBe('ORDER');const attempt=component.attemptId;await Promise.all([buttonOptions[1].onApprove(),buttonOptions[1].onApprove()]);expect(credits.createPayPalOrder).toHaveBeenCalledOnceWith('CREDITS_10',attempt);expect(credits.capturePayPalOrder).toHaveBeenCalledTimes(1);expect(state.refreshCredits).toHaveBeenCalledTimes(1);});
  it('cancellation clears attempt state for fresh checkout',async()=>{await component.open();await component.selectPack(pack);const attempt=component.attemptId;await (component as any).cancelFundingPurchase();expect(component.attemptId).toBeNull();expect(component.attemptPackCode).toBeNull();expect(component.checkoutCode).toBeNull();});
  it('switching packs destroys old buttons and creates new ones',async()=>{await component.open();await component.selectPack(pack);const firstOptions=buttonOptions.length;expect(firstOptions).toBeGreaterThan(0);await component.selectPack(pack50);fixture.detectChanges();await fixture.whenStable();const secondOptions=buttonOptions.length;expect(secondOptions).toBeGreaterThan(0);});

  it('renders secure redirect fallback after capability failure', async () => {
    credits.getPayPalCapabilities.and.rejectWith(new Error('network'));
    await component.open(); await component.selectPack(pack); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Continue with PayPal');
  });
  it('capture response loss reconciles the existing attempt without another order', async () => {
    credits.capturePayPalOrder.and.rejectWith(new Error('response lost'));
    credits.getPayPalPurchase.and.resolveTo({credited:true,status:'credited',credits:10});
    await component.open(); await component.selectPack(pack);
    await buttonOptions[0].createOrder(); const attempt=component.attemptId;
    await buttonOptions[0].onApprove();
    expect(credits.getPayPalPurchase).toHaveBeenCalledWith(attempt);
    expect(credits.createPayPalOrder).toHaveBeenCalledTimes(1);
    expect(state.refreshCredits).toHaveBeenCalledTimes(1);
  });

  it('restarts PayPal exactly once for INSTRUMENT_DECLINED without success UI or wallet refresh',async()=>{
    credits.capturePayPalOrder.and.rejectWith(new HttpErrorResponse({status:422,error:{success:false,code:'INSTRUMENT_DECLINED',message:'safe'}}));
    await component.open();await component.selectPack(pack);await buttonOptions[1].createOrder();
    const actions={restart:jasmine.createSpy().and.resolveTo()};
    await Promise.all([buttonOptions[1].onApprove({},actions),buttonOptions[1].onApprove({},actions)]);
    expect(actions.restart).toHaveBeenCalledTimes(1);expect(state.refreshCredits).not.toHaveBeenCalled();
    expect(alerts.showSuccess).not.toHaveBeenCalled();expect(component.message).toContain('choose another card or payment method');
    expect(component.attemptId).not.toBeNull();
  });

  it('captures successfully on the second approval after funding restart',async()=>{
    credits.capturePayPalOrder.and.returnValues(
      Promise.reject(new HttpErrorResponse({status:422,error:{code:'INSTRUMENT_DECLINED'}})),
      Promise.resolve({credited:true,status:'credited',credits:10}));
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    const actions={restart:jasmine.createSpy().and.resolveTo()};
    await buttonOptions[0].onApprove({},actions);await buttonOptions[0].onApprove({},actions);
    expect(actions.restart).toHaveBeenCalledTimes(1);expect(credits.capturePayPalOrder).toHaveBeenCalledTimes(2);
    expect(state.refreshCredits).toHaveBeenCalledTimes(1);expect(alerts.showSuccess).toHaveBeenCalledTimes(1);
  });

  it('reconciles network status zero and never restarts funding',async()=>{
    credits.capturePayPalOrder.and.rejectWith(new HttpErrorResponse({status:0,statusText:'Unknown Error'}));
    credits.getPayPalPurchase.and.resolveTo({credited:true,status:'credited',credits:10});
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    const attempt=component.attemptId;
    const actions={restart:jasmine.createSpy().and.resolveTo()};await buttonOptions[0].onApprove({},actions);
    expect(credits.getPayPalPurchase).toHaveBeenCalledWith(attempt);
    expect(actions.restart).not.toHaveBeenCalled();expect(state.refreshCredits).toHaveBeenCalledTimes(1);
  });

  it('reconciles a server 5xx into review_required without restarting funding',async()=>{
    credits.capturePayPalOrder.and.rejectWith(new HttpErrorResponse({status:502,error:{code:'PAYPAL_API_ERROR'}}));
    credits.getPayPalPurchase.and.resolveTo({credited:false,status:'review_required',credits:10});
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    const actions={restart:jasmine.createSpy().and.resolveTo()};await buttonOptions[0].onApprove({},actions);
    expect(credits.getPayPalPurchase).toHaveBeenCalled();expect(actions.restart).not.toHaveBeenCalled();
    expect(component.message).toContain('needs review');
  });

  it('does not reconcile or restart an unrelated terminal provider 422',async()=>{
    credits.capturePayPalOrder.and.rejectWith(new HttpErrorResponse({status:409,error:{code:'UNPROCESSABLE_ENTITY',message:'PayPal could not complete this payment. No credits were added.'}}));
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    const actions={restart:jasmine.createSpy().and.resolveTo()};await buttonOptions[0].onApprove({},actions);
    expect(credits.getPayPalPurchase).not.toHaveBeenCalled();expect(actions.restart).not.toHaveBeenCalled();
    expect(component.message).toContain('could not complete');expect(component.attemptId).toBeNull();
  });

  it('uses distinct terminal payment messages and never restarts',async()=>{
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    const actions={restart:jasmine.createSpy().and.resolveTo()};
    for(const [status,message] of [
      ['review_required','needs review'],['refunded','was refunded'],['cancelled','was cancelled'],['failed','could not complete']
    ] as const){
      component.attemptId='attempt';component.attemptPackCode=pack.code;
      credits.capturePayPalOrder.and.resolveTo({credited:false,status,credits:10});
      await (component as any).completeFundingPurchase(actions);expect(component.message).toContain(message);
    }
    expect(actions.restart).not.toHaveBeenCalled();expect(state.refreshCredits).not.toHaveBeenCalled();
  });

  it('shows temporary provider wording for retryable failed status',async()=>{
    credits.capturePayPalOrder.and.resolveTo({credited:false,status:'failed',credits:10,message:'PayPal is temporarily unavailable. Please try again.'});
    await (component as any).confirmPayPal('attempt');
    expect(component.message).toBe('PayPal is temporarily unavailable. Please try again.');
  });

  it('falls back to a fresh attempt if actions.restart rejects',async()=>{
    credits.capturePayPalOrder.and.rejectWith(new HttpErrorResponse({status:422,error:{code:'INSTRUMENT_DECLINED'}}));
    await component.open();await component.selectPack(pack);await buttonOptions[0].createOrder();
    await buttonOptions[0].onApprove({}, {restart:jasmine.createSpy().and.rejectWith(new Error('restart failed'))});
    expect(component.attemptId).toBeNull();expect(component.confirmationPending).toBeFalse();
    expect(component.message).toContain('begin a new checkout');
  });

  it('retains an uncertain payment when the catalog removes its pack', async () => {
    await component.open();component.attemptPackCode='CREDITS_10';component.attemptId='existing-attempt';component.confirmationPending=true;
    catalog.packs.set([pack50]);fixture.detectChanges();
    await component.purchase(pack50);
    expect(component.attemptId).toBe('existing-attempt');
    expect(credits.createPayPalOrder).not.toHaveBeenCalled();
  });
});
