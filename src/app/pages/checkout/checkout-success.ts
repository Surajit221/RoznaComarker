import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SubscriptionApiService } from '../../api/subscription-api.service';

@Component({ selector: 'app-checkout-success', standalone: true, imports: [RouterModule], templateUrl: './checkout-success.html', styleUrl: './checkout-status.css' })
export class CheckoutSuccessComponent implements OnInit, OnDestroy {
  active = false; finishedWaiting = false; private stopped = false;
  constructor(private subscriptions: SubscriptionApiService) {}
  async ngOnInit(): Promise<void> {
    for (let attempt = 0; attempt < 10 && !this.stopped; attempt++) {
      try {
        const current = await this.subscriptions.getMySubscription();
        if (current.plan?.slug === 'starter_monthly' && ['active','trialing'].includes(current.billing?.status || '')) { this.active = true; return; }
      } catch { /* bounded polling continues */ }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    this.finishedWaiting = true;
  }
  ngOnDestroy(): void { this.stopped = true; }
}
