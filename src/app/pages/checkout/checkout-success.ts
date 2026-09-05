import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AccountStateService } from '../../services/account-state.service';

@Component({ selector: 'app-checkout-success', standalone: true, imports: [RouterModule], templateUrl: './checkout-success.html', styleUrl: './checkout-status.css' })
export class CheckoutSuccessComponent implements OnInit, OnDestroy {
  static readonly maxPollAttempts = 25;
  static readonly pollIntervalMs = 1000;
  active = false; finishedWaiting = false; private stopped = false;
  readonly isPayPalReturn: boolean;
  constructor(private accountState: AccountStateService, router: Router) {
    this.isPayPalReturn = router.url.startsWith('/billing/paypal/');
  }
  async ngOnInit(): Promise<void> {
    for (let attempt = 0; attempt < CheckoutSuccessComponent.maxPollAttempts && !this.stopped; attempt++) {
      try {
        const current = await this.accountState.refreshSubscription();
        const status = String(current?.billing?.status || '').toUpperCase();
        if (current?.plan?.slug !== 'free' && ['ACTIVE', 'TRIALING'].includes(status)) {
          await this.accountState.refreshCredits();
          if (this.stopped) return;
          this.active = true;
          return;
        }
      } catch { /* bounded polling continues */ }
      await new Promise((resolve) => setTimeout(resolve, CheckoutSuccessComponent.pollIntervalMs));
    }
    this.finishedWaiting = true;
  }
  ngOnDestroy(): void { this.stopped = true; }
}
