import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
@Component({ selector: 'app-checkout-cancel', standalone: true, imports: [RouterModule], templateUrl: './checkout-cancel.html', styleUrl: './checkout-status.css' })
export class CheckoutCancelComponent {
  readonly isPayPalReturn: boolean;
  constructor(router: Router) {
    this.isPayPalReturn = router.url.startsWith('/billing/paypal/');
  }
}
