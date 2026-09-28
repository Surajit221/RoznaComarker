import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AccountStateService } from '../../services/account-state.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';

@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './checkout-success.html',
  styleUrl: './checkout-status.css',
})
export class CheckoutSuccessComponent implements OnInit, OnDestroy {
  private static readonly prepaidMaxAttempts = 5;
  private static readonly legacyMaxAttempts = 12;
  private static readonly pollIntervalMs = 1000;

  active = false;
  finishedWaiting = false;

  private stopped = false;

  readonly isPayPalReturn: boolean;
  readonly isPrepaidPurchase: boolean;

  private readonly purchaseAttemptId: string | null;

  constructor(
    private accountState: AccountStateService,
    private subscriptions: SubscriptionApiService,
    private route: ActivatedRoute,
    router: Router,
  ) {
    this.isPayPalReturn = router.url.startsWith('/billing/paypal/');

    this.isPrepaidPurchase = this.route.snapshot.queryParamMap.get('purchase') === 'prepaid';

    this.purchaseAttemptId = this.route.snapshot.queryParamMap.get('attempt');
  }

  async ngOnInit(): Promise<void> {
    /*
     * New prepaid PayPal Orders flow.
     *
     * Do NOT wait for billing.status=ACTIVE because prepaid plans
     * do not have a recurring PayPal subscription.
     */
    if (this.isPrepaidPurchase) {
      await this.confirmPrepaidPurchase();
      return;
    }

    /*
     * Legacy recurring PayPal/old subscription flow.
     *
     * Preserve the old behaviour for existing recurring users.
     */
    await this.confirmLegacySubscription();
  }

  private async confirmPrepaidPurchase(): Promise<void> {
    if (!this.purchaseAttemptId) {
      /*
       * Defensive fallback for an old URL/bookmark.
       * We do not blindly claim payment success.
       */
      await this.confirmFromCurrentEntitlement();
      return;
    }

    for (
      let attempt = 0;
      attempt < CheckoutSuccessComponent.prepaidMaxAttempts && !this.stopped;
      attempt++
    ) {
      try {
        const purchase = await this.subscriptions.getPayPalPlanPurchase(this.purchaseAttemptId);

        if (purchase.fulfilled) {
          /*
           * PaymentPurchaseAttempt is already fulfilled and the
           * PlanEntitlement has been created.
           *
           * Refresh account state once so dashboard/limits/credits
           * immediately reflect the new entitlement.
           */
          await Promise.all([
            this.accountState.refreshSubscription(),
            this.accountState.refreshCredits(),
          ]);

          if (this.stopped) return;

          this.active = true;
          this.finishedWaiting = true;

          return;
        }

        /*
         * These are terminal states.
         * Do not poll forever.
         */
        if (['failed', 'cancelled', 'review_required', 'refunded'].includes(purchase.status)) {
          this.finishedWaiting = true;
          return;
        }
      } catch {
        /*
         * A temporary request failure may recover.
         * Keep polling, but only for a bounded number of attempts.
         */
      }

      if (attempt < CheckoutSuccessComponent.prepaidMaxAttempts - 1) {
        await this.delay(CheckoutSuccessComponent.pollIntervalMs);
      }
    }

    if (!this.stopped) {
      this.finishedWaiting = true;
    }
  }

  private async confirmFromCurrentEntitlement(): Promise<void> {
    try {
      const current = await this.accountState.refreshSubscription();

      const entitlement = current?.entitlement;

      const now = Date.now();

      const startsAt = entitlement?.startsAt ? Date.parse(entitlement.startsAt) : NaN;

      const endsAt = entitlement?.endsAt ? Date.parse(entitlement.endsAt) : null;

      const activeEntitlement =
        current?.plan?.slug !== 'free' &&
        !!entitlement &&
        Number.isFinite(startsAt) &&
        startsAt <= now &&
        (endsAt === null || (Number.isFinite(endsAt) && endsAt > now));

      if (activeEntitlement) {
        await this.accountState.refreshCredits();

        if (this.stopped) return;

        this.active = true;
      }
    } catch {
      // Fall through to safe waiting state.
    }

    if (!this.stopped) {
      this.finishedWaiting = true;
    }
  }

  private async confirmLegacySubscription(): Promise<void> {
    for (
      let attempt = 0;
      attempt < CheckoutSuccessComponent.legacyMaxAttempts && !this.stopped;
      attempt++
    ) {
      try {
        const current = await this.accountState.refreshSubscription();

        const status = String(current?.billing?.status || '').toUpperCase();

        if (current?.plan?.slug !== 'free' && ['ACTIVE', 'TRIALING'].includes(status)) {
          await this.accountState.refreshCredits();

          if (this.stopped) return;

          this.active = true;
          this.finishedWaiting = true;

          return;
        }
      } catch {
        // Bounded polling continues.
      }

      if (attempt < CheckoutSuccessComponent.legacyMaxAttempts - 1) {
        await this.delay(CheckoutSuccessComponent.pollIntervalMs);
      }
    }

    if (!this.stopped) {
      this.finishedWaiting = true;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  ngOnDestroy(): void {
    this.stopped = true;
  }
}
