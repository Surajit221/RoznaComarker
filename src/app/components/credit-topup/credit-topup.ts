import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CreditsApiService, type CreditPack, type CreditPaymentProvider } from '../../api/credits-api.service';
import { AccountStateService } from '../../services/account-state.service';
import { trustedPayPalApprovalUrl, trustedStripeCheckoutUrl } from '../../utils/trusted-navigation.util';
import { AlertService } from '../../services/alert.service';
import { CreditTopupUiService } from '../../services/credit-topup-ui.service';

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
  private readonly alerts=inject(AlertService);private readonly ui=inject(CreditTopupUiService);private readonly destroyRef=inject(DestroyRef);private returnFocus:HTMLElement|null=null;

  constructor(private credits: CreditsApiService, private accountState: AccountStateService, private route: ActivatedRoute) {this.ui.openRequests$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(()=>void this.open())}

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
    if (this.packs.length) { this.focus(); return; }
    this.loading = true;
    try { const options = await this.credits.getPacks(); this.packs = options.packs; this.paymentProvider = options.paymentProvider; this.focus(); }
    catch { this.message = "We couldn't load credit packs. Please try again."; }
    finally { this.loading = false; }
  }

  close(): void { if (!this.checkoutCode) { this.openState=false;this.attemptId=null;this.attemptPackCode=null;document.body.style.overflow='';const target=this.returnFocus;this.returnFocus=null;setTimeout(()=>target?.focus()); } }

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
  ngOnDestroy():void{document.body.style.overflow=''}
}
