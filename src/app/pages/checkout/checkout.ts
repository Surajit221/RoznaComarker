import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BackendPlan } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { loadStripeClient } from './stripe-loader';
import { billingIntervalUnit, formatPlanPeriod, formatPlanPrice } from '../../utils/billing-price.util';
import { CreditsApiService } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { PayPalSdkLoaderService, type PayPalButtonInstance, type PayPalSdkConfig } from '../../services/paypal-sdk-loader.service';

@Component({ selector: 'app-checkout', standalone: true, imports: [CommonModule, RouterModule], templateUrl: './checkout.html', styleUrl: './checkout.css' })
export class CheckoutComponent implements OnInit, OnDestroy {
  plan: BackendPlan | null = null;
  loading = true;
  errorMessage = '';
  private embeddedCheckout: any;
  private initializing = false;
  private destroyed = false;
  private initializationSequence = 0;
  planCode = 'starter_monthly';
  billingPeriod: 'monthly' | 'annual' = 'monthly';
  paymentProvider: 'stripe' | 'paypal' = 'stripe';
  paypalSubmitting = false;
  paypalButtonEligible=false;cardButtonEligible=false;
  paypalCheckoutAttemptId: string | null = null;
  private paypalButtons:PayPalButtonInstance[]=[];private paypalSdkConfig?:PayPalSdkConfig;
  private paypalSubscriptionCreatePromise: Promise<string> | null = null;
  constructor(private subscriptions: SubscriptionApiService, private router: Router, private route: ActivatedRoute,
    private credits:CreditsApiService,private accountState:AccountStateService,private paypalSdk:PayPalSdkLoaderService,private cdr:ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    this.planCode = String(this.route.snapshot.paramMap.get('planCode') || 'starter_monthly').toLowerCase();
    this.billingPeriod = this.route.snapshot.queryParamMap.get('billing') === 'annual' ? 'annual' : 'monthly';
    await this.initializeCheckout();
    if(this.paymentProvider==='paypal'&&!this.errorMessage)await this.mountPayPalButtons();
  }

  private async initializeCheckout(): Promise<void> {
    if (this.initializing || this.destroyed) return;
    this.initializing = true;
    const sequence = ++this.initializationSequence;
    const checkoutAttemptId = globalThis.crypto.randomUUID();
    this.loading = true;
    this.errorMessage = '';
    try {
      this.embeddedCheckout?.destroy?.();
      this.embeddedCheckout = undefined;
      this.plan ??= await this.subscriptions.getCheckoutPlan(this.planCode);
      if (billingIntervalUnit(this.plan) === 'year') this.billingPeriod = 'annual';
      this.paymentProvider = this.plan.paymentProvider || 'stripe';
      if (this.paymentProvider === 'paypal') {
        this.paypalCheckoutAttemptId = checkoutAttemptId;
        return;
      }
      const stripe = await loadStripeClient();
      const embeddedCheckout = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () => (await this.subscriptions.createCheckoutSession(this.planCode, checkoutAttemptId, this.billingPeriod)).clientSecret,
        onComplete: () => this.router.navigate(['/checkout/success'])
      });
      if (this.destroyed || sequence !== this.initializationSequence) {
        embeddedCheckout.destroy?.();
        return;
      }
      this.embeddedCheckout = embeddedCheckout;
      embeddedCheckout.mount('#embedded-checkout');
    } catch (err: any) {
      const code = err?.error?.code;
      if (code === 'ALREADY_SUBSCRIBED') {
        this.errorMessage = 'A subscription is already active. Use Manage Plan to update billing.';
      } else if (code === 'SUBSCRIPTION_REQUIRES_MANAGEMENT') {
        this.errorMessage = 'Your PayPal subscription needs attention. Use Manage Plan to review billing.';
      } else {
        this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
      }
    } finally {
      if (sequence === this.initializationSequence) this.loading = false;
      this.initializing = false;
    }
  }
  private async mountPayPalButtons():Promise<void>{if(!this.plan||!this.paypalCheckoutAttemptId)return;
    try{const capability=await this.credits.getPayPalCapabilities();if(!capability.paypalCheckout||!capability.clientId)throw new Error('PAYPAL_SDK_LOAD_FAILED');
      this.paypalSdkConfig={clientId:capability.clientId,currency:this.plan.currency||'USD',mode:'subscription'};
      const sdk=await this.paypalSdk.loadButtons(this.paypalSdkConfig);const options=(fundingSource:unknown)=>({fundingSource,
        createSubscription:async()=>{if(this.paypalSubscriptionCreatePromise)return this.paypalSubscriptionCreatePromise;this.paypalSubscriptionCreatePromise=(async()=>{const created=await this.subscriptions.createPayPalSubscription(this.planCode,this.paypalCheckoutAttemptId!);const subscriptionId=String(created?.subscriptionId||'').trim();const canonicalAttemptId=String(created?.checkoutAttemptId||'').trim();if(!subscriptionId)throw new Error('PAYPAL_SUBSCRIPTION_ID_MISSING');if(!canonicalAttemptId||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canonicalAttemptId))throw new Error('PAYPAL_CHECKOUT_ATTEMPT_ID_INVALID');this.paypalCheckoutAttemptId=canonicalAttemptId;return subscriptionId;})().finally(()=>{this.paypalSubscriptionCreatePromise=null;});return this.paypalSubscriptionCreatePromise;},
        onApprove:async()=>{this.paypalSubmitting=true;try{const delays=[0,750,1500,1500,2000];let active=false;for(let i=0;i<delays.length;i++){if(i>0)await new Promise(r=>setTimeout(r,delays[i]));const result=await this.subscriptions.reconcilePayPalSubscription(this.paypalCheckoutAttemptId!);if(result.active){active=true;break;}}await this.accountState.refreshSubscription();if(active)await this.router.navigate(['/checkout/success'],{queryParams:{provider:'paypal'}});else this.errorMessage='PayPal approved the checkout and is still confirming your subscription. Your plan will update automatically once confirmation completes.';}catch{this.errorMessage='We could not confirm your subscription. Please retry from Manage Plan.';}finally{this.paypalSubmitting=false;}},
        onCancel:()=>{this.errorMessage='Subscription approval was cancelled. Your plan has not changed.';},
        onError:()=>{this.errorMessage='Secure checkout is temporarily unavailable. Please try again.';}});
      const paypal=sdk.Buttons(options(sdk.FUNDING.PAYPAL));const card=sdk.Buttons(options(sdk.FUNDING.CARD));this.paypalButtons=[paypal,card];
      this.paypalButtonEligible=paypal.isEligible();this.cardButtonEligible=card.isEligible();
      if(typeof ngDevMode!=='undefined'&&ngDevMode)console.info('[PayPal Subscription]',{cardFundingEligible:this.cardButtonEligible});
      this.cdr.detectChanges();await Promise.resolve();
      await Promise.all([...(this.paypalButtonEligible?[paypal.render('#paypal-subscription-button')]:[]),...(this.cardButtonEligible?[card.render('#paypal-subscription-card-button')]:[])]);
      if(!this.paypalButtonEligible&&!this.cardButtonEligible)this.errorMessage='Secure checkout is temporarily unavailable. Please try again.';
    }catch{this.errorMessage='Secure checkout is temporarily unavailable. Please try again.';this.cdr.detectChanges();}}
  ngOnDestroy(): void {
    this.destroyed = true;
    this.initializationSequence += 1;
    this.embeddedCheckout?.destroy?.();
    this.embeddedCheckout = undefined;
    for(const button of this.paypalButtons)button.close?.();this.paypalButtons=[];
    if(this.paypalSdkConfig)this.paypalSdk.release(this.paypalSdkConfig);
  }
  features(): string[] {
    const f = this.plan?.features;
    if (!f) return [];
    const items: string[] = [];
    if (typeof f.maxClasses === 'number') items.push(`Up to ${f.maxClasses} Classes`);
    if (typeof f.maxStudents === 'number') items.push(`Up to ${f.maxStudents} Students`);
    if (typeof f.essayAnalysesPerMonth === 'number') items.push(`${f.essayAnalysesPerMonth} Assessment Credits/month`);
    if (f.aiFlashcards) items.push('AI Flashcards');
    if (f.aiWorksheets) items.push('AI Worksheets');
    if (f.adaptiveLearning) items.push('Adaptive Learning');
    if (typeof f.storageMB === 'number') {
      items.push(f.storageMB >= 1024 && f.storageMB % 1024 === 0
        ? `${f.storageMB / 1024} GB Storage`
        : `${f.storageMB} MB Storage`);
    }
    if (f.priorityAIProcessing) items.push('Priority AI Processing');
    if (f.analyticsAccess) items.push('Analytics Access');
    if (f.dedicatedSupport) items.push('Dedicated Support');
    return items;
  }
  get summaryPrice(): string { return this.plan ? formatPlanPrice(this.plan, this.billingPeriod) : '—'; }
  get summaryPeriod(): string { return this.plan ? formatPlanPeriod(this.plan, this.billingPeriod) : ''; }
  get billingDescription(): string { return `${this.summaryPeriod.includes('year') ? 'Yearly' : 'Monthly'} subscription`; }
  async retry(): Promise<void> { await this.initializeCheckout();if(this.paymentProvider==='paypal'&&!this.errorMessage)await this.mountPayPalButtons(); }
}
