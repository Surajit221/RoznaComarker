import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BackendPlan } from '../../api/plans-api.service';
import { SubscriptionApiService, BillingQuote } from '../../api/subscription-api.service';
import { billingFailure } from '../../api/billing-admin-api.service';
import {
  billingIntervalUnit,
  formatPlanPeriod,
  formatPlanPrice,
} from '../../utils/billing-price.util';
import { CreditsApiService } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import {
  PayPalSdkLoaderService,
  type PayPalButtonInstance,
  type PayPalOnApproveActions,
  type PayPalSdkConfig,
} from '../../services/paypal-sdk-loader.service';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class CheckoutComponent implements OnInit, OnDestroy {
  plan: BackendPlan | null = null;
  loading = true;
  errorMessage = '';
  billingConflict = false;
  quote: BillingQuote | null = null;
  promoCode = '';
  promoError = '';
  quoting = false;
  orderStarted = false;
  private embeddedCheckout: any;
  private initializing = false;
  private destroyed = false;
  private initializationSequence = 0;
  planCode = 'starter_monthly';
  billingPeriod: 'monthly' | 'annual' = 'monthly';
  paymentProvider: 'stripe' | 'paypal' = 'paypal';
  paypalSubmitting = false;
  paypalButtonEligible = false;
  cardButtonEligible = false;
  paypalCheckoutAttemptId: string | null = null;
  private paypalButtons: PayPalButtonInstance[] = [];
  private paypalSdkConfig?: PayPalSdkConfig;
  private paypalOrderCreatePromise: Promise<string> | null = null;
  private paypalCapturePromise: Promise<void> | null = null;
  constructor(
    private subscriptions: SubscriptionApiService,
    private router: Router,
    private route: ActivatedRoute,
    private credits: CreditsApiService,
    private accountState: AccountStateService,
    private paypalSdk: PayPalSdkLoaderService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.planCode = String(
      this.route.snapshot.paramMap.get('planCode') || 'starter_monthly',
    ).toLowerCase();
    this.billingPeriod =
      this.route.snapshot.queryParamMap.get('billing') === 'annual' ? 'annual' : 'monthly';
    await this.initializeCheckout();
    if (this.canShowPayment) await this.mountPayPalButtons();
  }

  get canShowPayment(): boolean {
    const amount = this.quote?.finalAmount;
    return !this.loading && !this.billingConflict && !this.errorMessage && !!this.quote &&
      typeof amount === 'string' && Number.isFinite(Number(amount)) && Number(amount) > 0;
  }

  hasNonZeroAmount(amount: string | undefined): boolean {
    return !!amount && Number.isFinite(Number(amount)) && Number(amount) !== 0;
  }

  private async initializeCheckout(): Promise<void> {
    if (this.initializing || this.destroyed) return;
    this.initializing = true;
    const sequence = ++this.initializationSequence;
    const checkoutAttemptId = this.paypalCheckoutAttemptId || globalThis.crypto.randomUUID();
    this.cleanupPayPal();
    this.loading = true;
    this.errorMessage = '';
    this.billingConflict = false;
    this.quote = null;
    try {
      this.embeddedCheckout?.destroy?.();
      this.embeddedCheckout = undefined;
      this.plan ??= await this.subscriptions.getCheckoutPlan(this.planCode);
      if (billingIntervalUnit(this.plan) === 'year') this.billingPeriod = 'annual';
      if (this.plan.paymentProvider !== 'paypal') throw new Error('CHECKOUT_UNAVAILABLE');
      this.paymentProvider = 'paypal';
      this.paypalCheckoutAttemptId = checkoutAttemptId;
      if (!this.orderStarted) this.quote = await this.subscriptions.getBillingQuote(this.planCode, this.billingPeriod, this.promoCode.trim() || undefined);
    } catch (err: any) {
      const code = err?.error?.code;
      if (code === 'ALREADY_SUBSCRIBED') {
        this.errorMessage = 'A subscription is already active. Use Manage Plan to update billing.';
      } else if (code === 'SUBSCRIPTION_REQUIRES_MANAGEMENT') {
        this.errorMessage =
          'Your PayPal subscription needs attention. Use Manage Plan to review billing.';
      } else if (['LEGACY_SUBSCRIPTION_ACTIVE', 'PRORATION_REVIEW_REQUIRED', 'SCHEDULED_PLAN_REVIEW_REQUIRED',
        'LEGACY_ENTITLEMENT_REVIEW_REQUIRED', 'MINIMUM_PAYMENT', 'BILLING_CHECKOUT_PENDING'].includes(code)) {
        this.billingConflict = code === 'SCHEDULED_PLAN_REVIEW_REQUIRED';
        this.errorMessage = this.billingConflict
          ? 'You already have paid plan coverage scheduled after your current plan. This upgrade cannot be calculated safely without changing that prepaid coverage.'
          : err.error.message || 'This plan change requires billing review.';
      } else {
        this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
      }
    } finally {
      if (sequence === this.initializationSequence) this.loading = false;
      this.initializing = false;
    }
  }
  private async mountPayPalButtons(): Promise<void> {
    if (!this.plan || !this.paypalCheckoutAttemptId || !this.canShowPayment) return;
    try {
      const capability = await this.credits.getPayPalCapabilities();
      if (!capability.paypalCheckout || !capability.clientId)
        throw new Error('PAYPAL_SDK_LOAD_FAILED');
      this.paypalSdkConfig = {
        clientId: capability.clientId,
        currency: this.quote?.currency || this.plan.currency || 'USD',
        mode: 'capture',
      };
      const sdk = await this.paypalSdk.loadButtons(this.paypalSdkConfig);
      if (this.destroyed) {
        this.cleanupPayPal();
        return;
      }
      const options = (fundingSource: unknown) => ({
        fundingSource,
        createOrder: async () => {
          if (this.paypalOrderCreatePromise) return this.paypalOrderCreatePromise;
          if (!this.quote || this.quoting || (!this.orderStarted && new Date(this.quote.expiresAt).getTime() <= Date.now())) {
            this.errorMessage = 'Refresh the price quote before paying.';
            throw new Error('BILLING_QUOTE_EXPIRED');
          }
          this.orderStarted = true;
          this.paypalOrderCreatePromise = (async () => {
            const created = await this.subscriptions.createPayPalPlanOrder(
              this.planCode,
              this.paypalCheckoutAttemptId!,
              this.billingPeriod,
              this.quote!.quoteId,
            );
            if (!created.orderId) throw new Error('PAYPAL_ORDER_ID_MISSING');
            return created.orderId;
          })().finally(() => {
            this.paypalOrderCreatePromise = null;
          });
          return this.paypalOrderCreatePromise;
        },
        onApprove: async (_data: unknown, actions?: PayPalOnApproveActions) => {
          if (this.paypalCapturePromise) return this.paypalCapturePromise;
          this.paypalCapturePromise = (async () => {
            this.paypalSubmitting = true;
            try {
              let result;
              try {
                result = await this.subscriptions.capturePayPalPlanOrder(
                  this.paypalCheckoutAttemptId!,
                );
              } catch (error: unknown) {
                if (this.captureErrorCode(error) === 'INSTRUMENT_DECLINED') {
                  await this.restartDeclinedFunding(actions);
                  return;
                }
                if (!this.shouldReconcileCaptureError(error)) {
                  this.errorMessage =
                    (error as any)?.error?.message ||
                    'PayPal could not complete this plan payment.';
                  return;
                }
                result = await this.subscriptions.getPayPalPlanPurchase(
                  this.paypalCheckoutAttemptId!,
                );
              }
              if (result.failureCode === 'INSTRUMENT_DECLINED') {
                await this.restartDeclinedFunding(actions);
                return;
              }
              for (
                let i = 0;
                !result.fulfilled &&
                !result.failureCode &&
                !['failed', 'cancelled', 'review_required', 'refunded'].includes(result.status) &&
                i < 4;
                i++
              ) {
                await new Promise((r) => setTimeout(r, 750));
                result = await this.subscriptions.getPayPalPlanPurchase(
                  this.paypalCheckoutAttemptId!,
                );
              }
              if (result.failureCode === 'INSTRUMENT_DECLINED') {
                await this.restartDeclinedFunding(actions);
                return;
              }
              if (!result.fulfilled) {
                if (
                  ['failed', 'cancelled', 'review_required', 'refunded'].includes(result.status)
                ) {
                  this.errorMessage =
                    result.message || 'PayPal could not complete this plan payment.';
                  return;
                }
                this.errorMessage =
                  'Payment was approved, but plan confirmation is still pending. Retry to check this payment; do not pay again.';
                return;
              }
              await this.accountState.refreshSubscription();
              await this.router.navigate(['/checkout/success'], {
                queryParams: {
                  provider: 'paypal',
                  purchase: 'prepaid',
                  attempt: this.paypalCheckoutAttemptId,
                },
              });
            } catch {
              this.errorMessage =
                'Payment was approved, but plan confirmation is still pending. Retry to check this payment; do not pay again.';
            } finally {
              this.paypalSubmitting = false;
            }
          })().finally(() => {
            this.paypalCapturePromise = null;
          });
          return this.paypalCapturePromise;
        },
        onCancel: () => {
          this.errorMessage = 'Payment approval was cancelled. Your plan has not changed.';
        },
        onError: () => {
          this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
        },
      });
      const paypal = sdk.Buttons(options(sdk.FUNDING.PAYPAL));
      const card = sdk.Buttons(options(sdk.FUNDING.CARD));
      this.paypalButtons = [paypal, card];
      this.paypalButtonEligible = paypal.isEligible();
      this.cardButtonEligible = card.isEligible();
      if (typeof ngDevMode !== 'undefined' && ngDevMode)
        console.info('[PayPal Plan Order]', { cardFundingEligible: this.cardButtonEligible });
      this.cdr.detectChanges();
      await Promise.resolve();
      await Promise.all([
        ...(this.paypalButtonEligible ? [paypal.render('#paypal-subscription-button')] : []),
        ...(this.cardButtonEligible ? [card.render('#paypal-subscription-card-button')] : []),
      ]);
      if (!this.paypalButtonEligible && !this.cardButtonEligible)
        this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
    } catch {
      this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
      this.cdr.detectChanges();
    }
  }
  private captureErrorCode(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) return null;
    const code = error.error?.code;
    return typeof code === 'string' ? code : null;
  }
  private shouldReconcileCaptureError(error: unknown): boolean {
    return !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
  }
  private async restartDeclinedFunding(actions?: PayPalOnApproveActions): Promise<void> {
    this.errorMessage = '';
    if (!actions) {
      this.errorMessage =
        "PayPal couldn't use this payment method. Please choose another card or payment method.";
      return;
    }
    try {
      await actions.restart();
    } catch {
      this.errorMessage =
        "PayPal couldn't restart checkout. Please begin a new checkout and choose another card or payment method.";
    }
  }
  private cleanupPayPal(): void {
    for (const button of this.paypalButtons) button.close?.();
    this.paypalButtons = [];
    this.paypalButtonEligible = false;
    this.cardButtonEligible = false;
    if (this.paypalSdkConfig) this.paypalSdk.release(this.paypalSdkConfig);
    this.paypalSdkConfig = undefined;
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.initializationSequence += 1;
    this.embeddedCheckout?.destroy?.();
    this.embeddedCheckout = undefined;
    this.cleanupPayPal();
  }
  features(): string[] {
    const f = this.plan?.features;
    if (!f) return [];
    const items: string[] = [];
    if (typeof f.maxClasses === 'number') items.push(`Up to ${f.maxClasses} Classes`);
    if (typeof f.maxStudents === 'number') items.push(`Up to ${f.maxStudents} Students`);
    if (typeof f.essayAnalysesPerMonth === 'number')
      items.push(`${f.essayAnalysesPerMonth} Assessment Credits/month`);
    if (f.aiFlashcards) items.push('AI Flashcards');
    if (f.aiWorksheets) items.push('AI Worksheets');
    if (f.adaptiveLearning) items.push('Adaptive Learning');
    if (typeof f.storageMB === 'number') {
      items.push(
        f.storageMB >= 1024 && f.storageMB % 1024 === 0
          ? `${f.storageMB / 1024} GB Storage`
          : `${f.storageMB} MB Storage`,
      );
    }
    if (f.priorityAIProcessing) items.push('Priority AI Processing');
    if (f.analyticsAccess) items.push('Analytics Access');
    if (f.dedicatedSupport) items.push('Dedicated Support');
    return items;
  }
  get summaryPrice(): string {
    return this.plan ? formatPlanPrice(this.plan, this.billingPeriod) : '—';
  }
  get summaryPeriod(): string {
    return this.plan ? formatPlanPeriod(this.plan, this.billingPeriod) : '';
  }
  get billingDescription(): string {
    return `Valid for ${this.billingPeriod === 'annual' ? '1 year' : '1 month'}. Renew manually before expiration.`;
  }
  async retry(): Promise<void> {
    await this.initializeCheckout();
    if (this.canShowPayment) await this.mountPayPalButtons();
  }
  async applyPromo(remove = false): Promise<void> {
    if (this.quoting || this.orderStarted || this.paypalSubmitting || this.billingConflict || !this.quote) return;
    const requestedCode = remove ? '' : this.promoCode.trim();
    if (!remove && !requestedCode) return;
    const previousQuote = this.quote;
    this.quoting = true; this.promoError = ''; this.quote = null;
    this.cleanupPayPal();
    try {
      this.quote = await this.subscriptions.getBillingQuote(this.planCode, this.billingPeriod, requestedCode || undefined);
      this.promoCode = requestedCode;
      this.paypalCheckoutAttemptId = crypto.randomUUID();
      this.errorMessage = '';
    } catch (error) {
      const failure = billingFailure(error);
      if (failure.code === 'SCHEDULED_PLAN_REVIEW_REQUIRED') {
        this.billingConflict = true;
        this.errorMessage = 'You already have paid plan coverage scheduled after your current plan. This upgrade cannot be calculated safely without changing that prepaid coverage.';
      } else {
        this.quote = previousQuote;
        this.promoError = failure.message || 'Unable to apply this promo code.';
      }
    }
    finally { this.quoting = false; this.cdr.detectChanges(); }
    if (this.quote && !this.destroyed) await this.mountPayPalButtons();
  }
  async restartOrder(): Promise<void> {
    if (this.paypalSubmitting || this.paypalOrderCreatePromise || this.quoting) return;
    this.quoting = true;
    try {
      await this.subscriptions.cancelPayPalPlanOrder(this.paypalCheckoutAttemptId!);
      this.orderStarted = false; this.paypalCheckoutAttemptId = null; this.quote = null;
    } catch (error) { this.errorMessage = billingFailure(error).message || 'Payment must be reconciled before starting another checkout.'; return; }
    finally { this.quoting = false; }
    await this.retry();
  }
}
