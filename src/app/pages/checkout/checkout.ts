import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BackendPlan } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { loadStripeClient } from './stripe-loader';

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
  constructor(private subscriptions: SubscriptionApiService, private router: Router, private route: ActivatedRoute) {}

  async ngOnInit(): Promise<void> {
    this.planCode = String(this.route.snapshot.paramMap.get('planCode') || 'starter_monthly').toLowerCase();
    this.billingPeriod = this.route.snapshot.queryParamMap.get('billing') === 'annual' ? 'annual' : 'monthly';
    await this.initializeCheckout();
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
      } else {
        this.errorMessage = 'Secure checkout is temporarily unavailable. Please try again.';
      }
    } finally {
      if (sequence === this.initializationSequence) this.loading = false;
      this.initializing = false;
    }
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.initializationSequence += 1;
    this.embeddedCheckout?.destroy?.();
    this.embeddedCheckout = undefined;
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
  async retry(): Promise<void> { await this.initializeCheckout(); }
}
