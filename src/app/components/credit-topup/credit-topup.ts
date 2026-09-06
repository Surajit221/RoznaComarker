import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CreditsApiService, type CreditPack, type CreditPaymentProvider } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { trustedPayPalApprovalUrl, trustedStripeCheckoutUrl } from '../../utils/trusted-navigation.util';
import { AlertService } from '../../services/alert.service';
import { CreditTopupUiService } from '../../services/credit-topup-ui.service';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { PayPalSdkLoaderService, type PayPalButtonInstance, type PayPalSdkConfig } from '../../services/paypal-sdk-loader.service';

@Component({ selector: 'app-credit-topup', standalone: true, imports: [CommonModule],
  templateUrl: './credit-topup.html', styleUrl: './credit-topup.css' })
export class CreditTopupComponent {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  packs: CreditPack[] = [];
  openState = false;
  loading = false;
  checkoutCode: string | null = null;
  message: string | null = null;
  paymentProvider: CreditPaymentProvider = 'stripe';
  attemptId: string | null = null;
  attemptPackCode: string | null = null;
  selectedPack: CreditPack | null = null;
  paypalButtonEligible=false;cardButtonEligible=false;fundingLoading=false;
  private paypalButton?:PayPalButtonInstance;private cardButton?:PayPalButtonInstance;private sdkConfig?:PayPalSdkConfig;
  private paypalClientId='';private capturePromise?:Promise<void>;
  private readonly alerts=inject(AlertService);private readonly ui=inject(CreditTopupUiService);private readonly destroyRef=inject(DestroyRef);private returnFocus:HTMLElement|null=null;

  constructor(private credits: CreditsApiService, private accountState: AccountStateService, private route: ActivatedRoute,
    private catalog:PricingCatalogStateService, private paypalSdk:PayPalSdkLoaderService, private cdr:ChangeDetectorRef) {this.ui.openRequests$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(()=>void this.open());effect(()=>{const next=this.catalog.packs();this.packs=next;this.paymentProvider=this.catalog.paymentProvider();if(this.selectedPack&&!next.some(pack=>pack.code===this.selectedPack?.code))this.selectedPack=null;if(this.attemptPackCode&&!next.some(pack=>pack.code===this.attemptPackCode)){this.attemptId=null;this.attemptPackCode=null;this.checkoutCode=null;this.destroyFundingButtons();this.message='The selected credit pack is no longer available.'}})}

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const state = query.get('topup'); const attempt = query.get('attempt');
    if (state === 'paypal-confirming' && attempt) void this.confirmPayPal(attempt);
    else if (state === 'paypal-cancelled' && attempt) void this.cancelPayPal(attempt);
    else if (state === 'confirming') void this.confirmStripe();
    else if (state === 'cancelled') { this.openState = true; this.message = 'Payment was cancelled. No credits were added.'; }
  }

  async open(): Promise<void> {
    if (this.loading) return;
    this.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;document.body.style.overflow='hidden';
    this.openState = true; this.message = null;
    this.loading = true;
    try { await this.catalog.refresh(); await this.loadCapabilities(); this.focus(); }
    catch { this.message = "We couldn't load credit packs. Please try again."; }
    finally { this.loading = false; }
  }

  close(): void { if (!this.checkoutCode) { this.destroyFundingButtons();this.openState=false;this.attemptId=null;this.attemptPackCode=null;this.selectedPack=null;document.body.style.overflow='';const target=this.returnFocus;this.returnFocus=null;setTimeout(()=>target?.focus()); } }

  async selectPack(pack:CreditPack):Promise<void>{if(this.checkoutCode)return;this.destroyFundingButtons();this.selectedPack=pack;this.message=null;this.cdr.detectChanges();await this.mountFundingButtons();}

  async purchase(pack: CreditPack): Promise<void> {
    if (this.checkoutCode) return;
    this.checkoutCode = pack.code; this.message = null;
    try {
      if (this.paymentProvider === 'paypal') {
        if (!this.attemptId || this.attemptPackCode !== pack.code) { this.attemptId = crypto.randomUUID(); this.attemptPackCode = pack.code; }
        const order = await this.credits.createPayPalOrder(pack.code, this.attemptId);
        const url = trustedPayPalApprovalUrl(order.approvalUrl);
        if (!url) throw new Error('Untrusted PayPal approval URL');
        this.navigateExternal(url); return;
      }
      const checkout = await this.credits.createTopupCheckout(pack.code);
      const url = trustedStripeCheckoutUrl(checkout.url);
      if (!url) throw new Error('Untrusted Stripe checkout URL');
      this.navigateExternal(url);
    } catch (error: any) {
      this.message = error?.error?.message === "This credit pack isn't available for your current plan." ? error.error.message : "We couldn't start the payment. Please try again.";
      this.checkoutCode = null;
    }
  }

  private async loadCapabilities():Promise<void>{
    if(this.paymentProvider!=='paypal')return;
    try{const capability=await this.credits.getPayPalCapabilities();if(capability.paypalCheckout)this.paypalClientId=capability.clientId;
    }catch{/* PayPal redirect checkout remains available */}
  }
  private ensureAttempt(pack:CreditPack):string{if(!this.attemptId||this.attemptPackCode!==pack.code){this.attemptId=crypto.randomUUID();this.attemptPackCode=pack.code;}return this.attemptId;}
  private async mountFundingButtons():Promise<void>{const pack=this.selectedPack;if(!pack||!this.paypalClientId||this.paymentProvider!=='paypal')return;
    this.fundingLoading=true;this.sdkConfig={clientId:this.paypalClientId,currency:pack.currency,mode:'capture'};
    try{const sdk=await this.paypalSdk.loadButtons(this.sdkConfig);const options=(fundingSource:unknown)=>({fundingSource,
      createOrder:async()=>{const order=await this.credits.createPayPalOrder(pack.code,this.ensureAttempt(pack));if(!order.orderId)throw new Error('ORDER_CREATE_FAILED');return order.orderId;},
      onApprove:()=>this.completeFundingPurchase(),onCancel:()=>this.cancelFundingPurchase(),onError:()=>{this.checkoutCode=null;this.message='Secure checkout could not be completed. Please try again.';}});
      this.paypalButton=sdk.Buttons(options(sdk.FUNDING.PAYPAL));this.cardButton=sdk.Buttons(options(sdk.FUNDING.CARD));
      this.paypalButtonEligible=this.paypalButton.isEligible();this.cardButtonEligible=this.cardButton.isEligible();this.cdr.detectChanges();await Promise.resolve();
      await Promise.all([...(this.paypalButtonEligible?[this.paypalButton.render('#paypal-topup-button')]:[]),...(this.cardButtonEligible?[this.cardButton.render('#paypal-topup-card-button')]:[])]);
      if(!this.paypalButtonEligible&&!this.cardButtonEligible)this.message='PayPal checkout is temporarily unavailable.';
    }catch{this.message='PayPal checkout is temporarily unavailable.';}finally{this.fundingLoading=false;this.cdr.detectChanges();}}
  private completeFundingPurchase():Promise<void>{if(this.capturePromise)return this.capturePromise;const attempt=this.attemptId;if(!attempt)return Promise.reject(new Error('ORDER_CAPTURE_FAILED'));
    this.checkoutCode=this.selectedPack?.code||'paypal';this.capturePromise=(async()=>{const result=await this.credits.capturePayPalOrder(attempt);if(!result.credited)throw new Error(result.message||'ORDER_CAPTURE_FAILED');await this.refreshWallet();this.message=`Credits added. ${this.accountState.wallet()?.availableCredits} Assessment Credits are now available.`;this.alerts.showSuccess('Credits added',`${result.credits} purchased Assessment Credits were added to your account.`);})().catch(()=>{this.message='We could not confirm the payment yet. Please try again.';}).finally(()=>{this.checkoutCode=null;this.capturePromise=undefined;});return this.capturePromise;}
  private async cancelFundingPurchase():Promise<void>{if(this.attemptId)try{await this.credits.cancelPayPalPurchase(this.attemptId);}catch{}this.attemptId=null;this.attemptPackCode=null;this.checkoutCode=null;this.message='Payment was cancelled. No credits were added.';}
  private destroyFundingButtons():void{this.paypalButton?.close?.();this.cardButton?.close?.();this.paypalButton=undefined;this.cardButton=undefined;this.paypalButtonEligible=false;this.cardButtonEligible=false;if(this.sdkConfig)this.paypalSdk.release(this.sdkConfig);this.sdkConfig=undefined;}

  private async refreshWallet(): Promise<void> { await this.accountState.refreshCredits(); }
  private async confirmStripe(): Promise<void> {
    this.openState = true; this.message = 'Payment received. Credits are being added.';
    const before = this.accountState.wallet()?.availableCredits;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
      await this.refreshWallet();
      if (typeof before !== 'number' || Number(this.accountState.wallet()?.availableCredits) > before) {
        this.message = `Credits added. ${this.accountState.wallet()?.availableCredits} Assessment Credits are now available.`; return;
      }
    }
  }
  private async confirmPayPal(attemptId: string): Promise<void> {
    this.openState = true; this.checkoutCode = 'paypal-confirming'; this.message = 'Payment approved. Confirming your credit purchase...';
    try {
      let purchase = await this.credits.capturePayPalOrder(attemptId);
      for (let poll = 0; !purchase.credited && poll < 5; poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        purchase = await this.credits.getPayPalPurchase(attemptId);
        if (['failed', 'cancelled', 'review_required'].includes(purchase.status)) break;
      }
      if (purchase.credited) { await this.refreshWallet(); this.message = `Credits added. ${this.accountState.wallet()?.availableCredits} Assessment Credits are now available.`;this.alerts.showSuccess('Credits added',`${purchase.credits} purchased Assessment Credits were added to your account.`); }
      else if (purchase.status === 'review_required') this.message = 'Your payment needs review. No additional action is required right now.';
      else this.message = purchase.message || 'Payment confirmation is taking longer than expected. Please retry from Add Credits.';
    } catch (error: any) { this.message = error?.error?.message || 'We could not confirm the payment yet. Please retry from Add Credits.'; }
    finally { this.checkoutCode = null; }
  }
  private async cancelPayPal(attemptId: string): Promise<void> {
    this.openState = true; this.message = 'Payment was cancelled. No credits were added.';
    try { await this.credits.cancelPayPalPurchase(attemptId); } catch { /* provider-side cancellation remains safe */ }
  }
  private focus(): void { setTimeout(() => { const first = this.dialog?.nativeElement.querySelector<HTMLElement>('button:not([disabled])'); (first || this.dialog?.nativeElement)?.focus(); }); }
  protected navigateExternal(url: string): void { window.location.assign(url); }
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialog) return;
    const items = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    if (!items.length) return; const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  @HostListener('document:keydown.escape') onEscape(): void { if (this.openState) this.close(); }
  ngOnDestroy():void{this.destroyFundingButtons();document.body.style.overflow=''}
}
