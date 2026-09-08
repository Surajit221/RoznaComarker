import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BackendPlan } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { CreditsApiService } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { PayPalSdkLoaderService, PayPalButtonInstance, PayPalButtonsSdk } from '../../services/paypal-sdk-loader.service';
import { trustedPayPalApprovalUrl } from '../../utils/trusted-navigation.util';
import { formatPlanPeriod, formatPlanPrice } from '../../utils/billing-price.util';

interface ChangePlanData {
  currentPlan: BackendPlan;
  targetPlan: BackendPlan;
  targetPrice: string;
  billingPeriod: 'monthly' | 'annual';
  paymentProvider: 'paypal' | 'stripe';
}

interface ChangePlanContext {
  changeAttemptId: string;
  providerSubscriptionId: string;
  targetPayPalPlanId: string;
  targetPlanCode: string;
  currency: string;
  targetPlanName: string;
  targetPlanPrice: number;
  targetBillingInterval: string;
}

@Component({
  selector: 'app-change-plan-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './change-plan-checkout.html',
  styleUrl: './change-plan-checkout.css'
})
export class ChangePlanCheckoutComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;
  submitting = false;
  data: ChangePlanData | null = null;
  targetPlanCode: string | null = null;
  changeAttemptId: string | null = null;
  context: ChangePlanContext | null = null;
  paypalSdk: PayPalButtonsSdk | null = null;
  paypalButton: PayPalButtonInstance | null = null;
  cardButton: PayPalButtonInstance | null = null;
  useFallbackFlow = false;
  paypalButtonEligible = false;
  cardButtonEligible = false;
  cardRuntimeFailed = false;
  cardErrorMessage: string | null = null;
  private paypalButtonsRendered = false;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subscriptionApi = inject(SubscriptionApiService);
  private creditsApi = inject(CreditsApiService);
  private accountState = inject(AccountStateService);
  private paypalSdkLoader = inject(PayPalSdkLoaderService);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    this.targetPlanCode = this.route.snapshot.queryParamMap.get('target');
    this.changeAttemptId = this.route.snapshot.queryParamMap.get('attempt');

    if (!this.targetPlanCode || !this.changeAttemptId) {
      this.error = 'Invalid plan change request. Please try again from Account & Plan.';
      this.loading = false;
      return;
    }

    await this.loadPlanData();
    await this.loadChangePlanContext();
    await this.renderPayPalButtons();
  }

  private async loadPlanData(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const subscription = await this.accountState.refreshSubscriptionIfStale();
      if (!subscription) {
        this.error = 'Unable to determine your current plan. Please try again.';
        return;
      }
      const currentPlan = subscription.plan;

      if (!currentPlan) {
        this.error = 'Unable to determine your current plan. Please try again.';
        return;
      }

      if (!this.targetPlanCode) {
        this.error = 'Invalid target plan. Please try again.';
        return;
      }

      const targetPlan = await this.subscriptionApi.getCheckoutPlan(this.targetPlanCode);
      const billingPeriod = targetPlan.billingInterval === 'year' ? 'annual' : 'monthly';

      this.data = {
        currentPlan,
        targetPlan,
        targetPrice: formatPlanPrice(targetPlan, billingPeriod),
        billingPeriod,
        paymentProvider: targetPlan.paymentProvider || 'paypal'
      };
    } catch (err: any) {
      this.error = err?.error?.message || 'Unable to load plan information. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  private async loadChangePlanContext(): Promise<void> {
    if (!this.targetPlanCode || !this.changeAttemptId) return;
    try {
      const response = await this.subscriptionApi.getChangePlanContext(this.targetPlanCode, this.changeAttemptId);
      this.context = response;
      // Use canonical changeAttemptId from backend response
      if (response.changeAttemptId) {
        this.changeAttemptId = response.changeAttemptId;
      }
    } catch (err: any) {
      this.error = err?.error?.message || 'Unable to load plan change context.';
    }
  }

  private async renderPayPalButtons(): Promise<void> {
    if (!this.context || this.error) return;

    if (this.paypalButtonsRendered) return;

    try {
      const capability = await this.creditsApi.getPayPalCapabilities();

      if (!capability.paypalCheckout || !capability.clientId) {
        throw new Error('PAYPAL_CHECKOUT_UNAVAILABLE');
      }

      this.paypalSdk = await this.paypalSdkLoader.loadButtons({
        clientId: capability.clientId,
        currency: this.context.currency,
        mode: 'subscription'
      });

      if (!this.paypalSdk) {
        this.error = 'Unable to load PayPal SDK.';
        return;
      }

      const paypalButtonConfig = {
        fundingSource: this.paypalSdk.FUNDING.PAYPAL,
        createSubscription: (data: any, actions: any) => {
          try {
            return actions.subscription.revise(
              this.context!.providerSubscriptionId,
              { plan_id: this.context!.targetPayPalPlanId }
            );
          } catch (err) {
            console.error('PayPal SDK revise failed, falling back to backend flow', err);
            this.fallbackToBackendFlow();
            throw err;
          }
        },
        onApprove: async (data: any) => {
          await this.onPayPalApprove();
        },
        onCancel: async (data: any) => {
          await this.onPayPalCancel();
        },
        onError: (err: any) => {
          console.error('PayPal button error, falling back to backend flow', err);
          this.fallbackToBackendFlow();
        }
      };

      const cardButtonConfig = {
        fundingSource: this.paypalSdk.FUNDING.CARD,
        createSubscription: (data: any, actions: any) => {
          try {
            return actions.subscription.revise(
              this.context!.providerSubscriptionId,
              { plan_id: this.context!.targetPayPalPlanId }
            );
          } catch (err) {
            this.handleCardRuntimeError(err);
            throw err;
          }
        },
        onApprove: async (data: any) => {
          await this.onPayPalApprove();
        },
        onCancel: async (data: any) => {
          await this.onPayPalCancel();
        },
        onError: (err: any) => {
          this.handleCardRuntimeError(err);
        }
      };

      const paypalBtn = this.paypalSdk.Buttons(paypalButtonConfig);
      const cardBtn = this.paypalSdk.Buttons(cardButtonConfig);

      this.paypalButtonEligible = paypalBtn.isEligible();
      this.cardButtonEligible = cardBtn.isEligible();

      if (this.paypalButtonEligible) {
        this.paypalButton = paypalBtn;
      }

      if (this.cardButtonEligible) {
        this.cardButton = cardBtn;
      }

      /*
       * Force Angular to render/update the host elements before PayPal mounts.
       */
      this.cdr.detectChanges();

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      if (this.paypalButtonEligible) {
        const paypalHost = document.getElementById(
          'paypal-button-container'
        );

        if (!paypalHost) {
          throw new Error('PAYPAL_BUTTON_HOST_MISSING');
        }

        await paypalBtn.render('#paypal-button-container');
      }

      if (this.cardButtonEligible) {
        const cardHost = document.getElementById(
          'card-button-container'
        );

        if (!cardHost) {
          throw new Error('PAYPAL_CARD_HOST_MISSING');
        }

        await cardBtn.render('#card-button-container');
      }

      this.paypalButtonsRendered = true;
    } catch (err: any) {
      console.error(
        'Failed to initialize PayPal plan-change checkout',
        err
      );

      this.error =
        'Unable to load PayPal payment options. Please try again.';
    }
  }

  private fallbackToBackendFlow(): void {
    this.error = null;
    this.paypalButton?.close?.();
    this.cardButton?.close?.();
    this.paypalButton = null;
    this.cardButton = null;
    this.paypalButtonsRendered = false;
    this.useFallbackFlow = true;
  }

  private handleCardRuntimeError(err: any): void {
    // Log sanitized error diagnostics in development
    if (typeof window !== 'undefined' && (window as any).__DEV__) {
      const safeCode = err?.code || 'UNKNOWN';
      const safeMessage = err?.message || 'No message provided';
      console.warn('[PayPal Plan Change Card]', {
        stage: 'revise',
        code: safeCode,
        message: safeMessage
      });
    }

    // Hide only the Card button, preserve PayPal button
    this.cardButton?.close?.();
    this.cardButton = null;
    this.cardRuntimeFailed = true;
    this.cardErrorMessage = 'Debit or credit card payment is not available for this subscription change. Please continue with PayPal.';

    // Do NOT call fallbackToBackendFlow for Card errors
    // Do NOT destroy PayPal SDK
    // Do NOT cancel the plan-change attempt
  }

  private async onPayPalApprove(): Promise<void> {
    this.submitting = true;
    this.error = null;
    try {
      await this.subscriptionApi.reconcilePlanChange(this.changeAttemptId!);
      this.router.navigate(['/billing/paypal/manage'], {
        queryParams: { result: 'success', attempt: this.changeAttemptId || undefined }
      });
    } catch (err: any) {
      this.error = err?.error?.message || 'Unable to complete plan change. Please try again.';
    } finally {
      this.submitting = false;
    }
  }

  private async onPayPalCancel(): Promise<void> {
    try {
      await this.subscriptionApi.markPayPalPlanChangeCancelled(this.changeAttemptId!);
      await this.accountState.refreshSubscription();
      this.router.navigate(['/billing/paypal/manage']);
    } catch (err: any) {
      this.error = 'Plan change was cancelled. Please refresh to see your current plan.';
    }
  }

  async startWithPayPal(): Promise<void> {
    if (this.submitting || !this.targetPlanCode || !this.changeAttemptId) return;
    this.submitting = true;
    this.error = null;
    try {
      const result = await this.subscriptionApi.changePayPalPlan(this.targetPlanCode, this.changeAttemptId);
      if (result.requiresApproval) {
        const url = trustedPayPalApprovalUrl(result.approvalUrl);
        if (!url) throw new Error('Untrusted PayPal approval URL');
        if (typeof window !== 'undefined' && window.location && window.location.assign) {
          window.location.assign(url);
        }
        return;
      }
      this.router.navigate(['/billing/paypal/manage'], {
        queryParams: { result: 'success', attempt: this.changeAttemptId || undefined }
      });
    } catch (err: any) {
      this.error = err?.error?.message || 'Unable to start plan change. Please try again.';
    } finally {
      this.submitting = false;
    }
  }

  async startWithCard(): Promise<void> {
    await this.startWithPayPal();
  }

  cancel(): void {
    this.router.navigate(['/billing/paypal/manage']);
  }

  ngOnDestroy(): void {
    this.paypalButton?.close?.();
    this.cardButton?.close?.();

    this.paypalButton = null;
    this.cardButton = null;
    this.paypalButtonsRendered = false;
  }

  get currentBillingPeriod(): 'monthly' | 'annual' {
    if (!this.data) return 'monthly';

    return this.data.currentPlan.billingInterval === 'year'
      ? 'annual'
      : 'monthly';
  }

  get currentPlanPrice(): string {
    if (!this.data) return '—';

    return formatPlanPrice(
      this.data.currentPlan,
      this.currentBillingPeriod
    );
  }

  get currentPlanPeriod(): string {
    if (!this.data) return '';

    return formatPlanPeriod(
      this.data.currentPlan,
      this.currentBillingPeriod
    );
  }

  get targetPlanPeriod(): string {
    if (!this.data) return '';
    return formatPlanPeriod(this.data.targetPlan, this.data.billingPeriod);
  }
}
