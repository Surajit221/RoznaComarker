import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, computed, HostListener } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BackendPlan } from '../../api/plans-api.service';
import { SubscriptionApiService } from '../../api/subscription-api.service';
import { trustedPayPalApprovalUrl } from '../../utils/trusted-navigation.util';
import { AccountStateService } from '../../services/account-state.service';
import { environment } from '../../../environments/environment';
import { ViewportScroller } from '@angular/common';
import { clampedUsagePercent, preciseStoragePercent } from '../../components/account-usage/account-usage.model';
import { CreditTopupUiService } from '../../services/credit-topup-ui.service';
import { CreditTopupComponent } from '../../components/credit-topup/credit-topup';
import { BillingSelection, formatPlanPeriod, formatPlanPrice } from '../../utils/billing-price.util';
import { PricingCatalogStateService } from '../../services/pricing-catalog-state.service';
import { BillingPeriod, groupPricingPlans, primaryPricingFeatures, pricingSavingsPercent, PricingTier, selectedPricingPlan } from '../../utils/pricing-catalog-view.util';

@Component({
  selector: 'app-paypal-manage', standalone: true,
  imports: [CommonModule, RouterModule, A11yModule, CreditTopupComponent],
  templateUrl: './paypal-manage.html', styleUrl: './paypal-manage.css'
})
export class PayPalManageComponent {
  readonly subscription = computed(() => this.accountState.subscription());
  readonly wallet = computed(() => this.accountState.wallet());
  readonly plans = computed(() => this.catalog.plans());
  billingPeriod: BillingPeriod = 'monthly';
  loading = true;
  catalogLoading = true;
  catalogError: string | null = null;
  submitting: 'cancel' | 'change' | null = null;
  dialog: 'cancel' | 'change' | null = null;
  target: BackendPlan | null = null;
  changeAttemptId: string | null = null;
  message: string | null = null;
  error: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private reconcileAttempt = 0;
  private readonly RECONCILE_DELAYS = [0, 1000, 2000, 3000, 5000];

  copied = false;
  constructor(private subscriptionApi: SubscriptionApiService,
    private route: ActivatedRoute, private router: Router, private accountState: AccountStateService,
    private viewport: ViewportScroller,private creditTopupUi:CreditTopupUiService,private catalog:PricingCatalogStateService) {}

  async ngOnInit(): Promise<void> {
    const result = this.route.snapshot.data['paypalChangeResult'];
    if (result === 'cancel') {
      this.message = 'Plan change cancelled. Your existing subscription remains unchanged.';
      const attempt = this.route.snapshot.queryParamMap.get('attempt');
      if (attempt) { try { await this.subscriptionApi.markPayPalPlanChangeCancelled(attempt); await this.accountState.refreshSubscription(); } catch { /* plan remains unchanged */ } }
    }
    if (result === 'success') this.message = 'Payment approval received. Confirming your new plan…';
    await this.load();
    const pendingReferral = sessionStorage.getItem('pending_referral_code');
    if (pendingReferral) {
      try { await this.subscriptionApi.claimReferral(pendingReferral); sessionStorage.removeItem('pending_referral_code'); await this.accountState.refreshSubscription(); }
      catch { /* a malformed or unavailable referral never blocks account access */ }
    }
    if (result === 'success' || this.subscription()?.billing?.pendingPlanChange || this.subscription()?.billing?.pendingCancellation) this.schedulePoll();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
  }

  get billing() { return this.subscription()?.billing; }
  get currentPlan() { return this.subscription()?.plan; }
  get usage() { return this.subscription()?.usage; }
  get referralLink(): string { const code = this.subscription()?.referrals?.code; return code ? `${environment.FRONTEND_URL}/register?ref=${encodeURIComponent(code)}` : ''; }
  get creditPercent(): number | null { const wallet = this.wallet(); return wallet ? clampedUsagePercent(wallet.monthlyCreditsUsed, wallet.monthlyCredits) : null; }
  get creditUsageMessage(): string | null {
    const wallet = this.wallet();
    const allowance = Number(wallet?.monthlyCredits);
    const used = Math.max(0, Number(wallet?.monthlyCreditsUsed) || 0);
    if (!wallet || !Number.isFinite(allowance) || allowance <= 0 || used * 100 < allowance * 80) return null;
    const remaining = Math.max(0, allowance - used);
    if (remaining > 0) return `You've used ${used} of ${allowance} monthly assessment credits. ${remaining} monthly credits remain.`;
    const additional = Math.max(0, Number(wallet.purchasedCredits) || 0) + Math.max(0, Number(wallet.bonusCredits) || 0);
    return additional > 0
      ? `You've used all ${allowance} monthly plan credits. Future assessments will use your additional credits.`
      : "You've used all available assessment credits for this cycle.";
  }
  get storagePercent(): number | null { return preciseStoragePercent(this.subscription()?.storage?.usedBytes,this.subscription()?.storage?.limitBytes,this.usage?.storageMB,this.currentPlan?.features?.storageMB??this.currentPlan?.limits?.storageMB); }
  get storagePercentLabel():string{return this.storagePercent===null?'':`${this.storagePercent}% used`}
  get storageUsedLabel(): string { const bytes=Number(this.subscription()?.storage?.usedBytes);const mb=Number(this.usage?.storageMB||0);if(Number.isFinite(bytes)&&bytes>0&&bytes<1024*1024)return`${Math.max(1,Math.round(bytes/1024))} KB`;return`${Number(mb.toFixed(2))} MB`; }
  getTargetPlanDisplayName(): string {
    const targetCode = this.billing?.pendingTargetPlanCode;
    if (!targetCode) return targetCode || '';
    const targetPlan = this.plans().find(p => p.slug === targetCode);
    return targetPlan?.display?.title || targetPlan?.name || targetCode;
  }
  usagePercent(used: number | undefined, limit: number | null | undefined): number | null { return clampedUsagePercent(used, limit); }
  get tiers(): PricingTier[] { return groupPricingPlans(this.plans()); }
  get hasAnnualBilling(): boolean { return this.tiers.some(tier => tier.annual); }
  get maxSavingsPercent(): number | null {
    const values = this.tiers.map(pricingSavingsPercent).filter((value): value is number => value !== null);
    return values.length ? Math.max(...values) : null;
  }
  selectedPlan(tier: PricingTier): BackendPlan { return selectedPricingPlan(tier, this.billingPeriod); }
  savingsPercentForTier(tier: PricingTier): number | null { return pricingSavingsPercent(tier); }
  featuresFor(plan: BackendPlan) { return primaryPricingFeatures(plan); }
  setBillingPeriod(period: BillingPeriod): void { this.billingPeriod = period; }
  isCurrentPlan(plan: BackendPlan): boolean { return plan.slug === this.billing?.planCode || plan.slug === this.currentPlan?.slug; }
  isPlanActionDisabled(plan: BackendPlan): boolean {
    return this.isCurrentPlan(plan) || ['custom', 'institution'].includes(plan.slug) ||
      !!this.billing?.pendingPlanChange || !!this.billing?.pendingCancellation || !!this.submitting;
  }
  formatPrice(plan: BackendPlan | null | undefined, selection?: BillingSelection): string {
    return plan ? formatPlanPrice(plan, selection) : '—';
  }
  formatPeriod(plan: BackendPlan | null | undefined, selection?: BillingSelection): string {
    return plan ? formatPlanPeriod(plan, selection) : '';
  }
  formatDate(value: string | null | undefined): string {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }
  async load(): Promise<void> {
    this.loading = true; this.catalogLoading = true; this.error = null; this.catalogError = null;
    const accountRequest = this.accountState.refreshSubscriptionIfStale()
      .then(() => this.accountState.refreshCreditsIfStale())
      .catch(() => { this.error = "We couldn't load your account. Please try again."; })
      .finally(() => { this.loading = false; });
    const catalogRequest = this.catalog.refresh()
      .catch(() => { this.catalogError = "We couldn't load available plans. Please try again."; })
      .finally(() => { this.catalogLoading = false; });
    await Promise.allSettled([accountRequest, catalogRequest]);
  }
  choosePlan(plan: BackendPlan): void {
    if (this.isPlanActionDisabled(plan)) return;
    if (this.billing?.provider !== 'paypal' || !this.billing?.canChangePlan) {
      void this.router.navigate(['/checkout', plan.slug], { queryParams: { billing: this.billingPeriod } }); return;
    }
    if (this.target?.slug !== plan.slug || !this.changeAttemptId) this.changeAttemptId = crypto.randomUUID();
    this.target = plan; this.dialog = 'change';
  }
  openCancel(): void { this.dialog = 'cancel'; }
  closeDialog(): void {
    if (!this.submitting) { this.dialog = null; this.target = null; this.changeAttemptId = null; }
  }
  async confirmCancel(): Promise<void> {
    if (this.submitting) return;
    this.submitting = 'cancel'; this.error = null;
    try {
      const result = await this.subscriptionApi.cancelPayPalSubscription();
      this.dialog = null;
      if (result.alreadyTerminal) {
        this.message = 'Your subscription is already cancelled.';
        await this.accountState.refreshSubscription();
        return;
      }
      this.message = 'Cancellation requested. Waiting for confirmation.';
      this.reconcileAttempt = 0;
      this.scheduleReconcile();
    } catch (error: any) { this.error = error?.error?.message || "We couldn't request cancellation. Please try again."; }
    finally { this.submitting = null; }
  }
  async confirmChange(): Promise<void> {
    if (!this.target || !this.changeAttemptId || this.submitting) return;
    this.dialog = null;
    this.router.navigate(['/checkout/change-plan'], {
      queryParams: { target: this.target.slug, attempt: this.changeAttemptId }
    });
  }
  private schedulePoll(): void {
    if (this.pollTimer || this.pollCount >= 20) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null; this.pollCount += 1;
      try {
        const next = await this.accountState.refreshSubscription();
        if (!next) { this.schedulePoll(); return; }
        if (!next.billing?.pendingPlanChange && !next.billing?.pendingCancellation) {
          await this.accountState.refreshCredits();
          this.message = next.billing?.status === 'CANCELLED' ? 'Your subscription is cancelled.' : 'Your plan is now confirmed.';
          return;
        }
      } catch { /* keep the last authoritative view while retrying */ }
      this.schedulePoll();
    }, 3000);
  }
  private async scheduleReconcile(): Promise<void> {
    if (this.reconcileAttempt >= this.RECONCILE_DELAYS.length) {
      this.message = 'Cancellation requested. Confirmation is still pending. You can safely leave this page.';
      await this.accountState.refreshSubscription();
      return;
    }
    const delay = this.RECONCILE_DELAYS[this.reconcileAttempt];
    this.reconcileTimer = setTimeout(async () => {
      this.reconcileTimer = null;
      this.reconcileAttempt += 1;
      try {
        const result = await this.subscriptionApi.reconcilePayPalManagement();
        if (result.cancelledOrTerminal) {
          await this.accountState.refreshSubscription();
          this.message = 'Your subscription is cancelled.';
          return;
        }
        if (!result.pendingCancellation) {
          await this.accountState.refreshSubscription();
          this.message = 'Your subscription status has been updated.';
          return;
        }
        this.scheduleReconcile();
      } catch {
        await this.accountState.refreshSubscription();
        this.scheduleReconcile();
      }
    }, delay);
  }
  scrollToPlans(): void { this.viewport.scrollToAnchor('available-plans'); }
  openCreditTopup(): void { this.creditTopupUi.open(); }
  async copyReferralLink(): Promise<void> {
    if (!this.referralLink) return;
    await navigator.clipboard.writeText(this.referralLink); this.copied = true;
    setTimeout(() => this.copied = false, 2000);
  }
  @HostListener('window:focus') async refreshOnFocus(): Promise<void> {
    await this.accountState.refreshIfStale();
  }
  @HostListener('document:keydown.escape') onEscape(): void { this.closeDialog(); }
  async cancelPendingPlanChange(): Promise<void> {
    if (this.submitting) return;
    const attemptId = this.billing?.pendingChangeAttemptId;
    if (!attemptId) {
      this.error = 'No pending plan change attempt found.';
      return;
    }
    this.submitting = 'change'; this.error = null;
    try {
      await this.subscriptionApi.markPayPalPlanChangeCancelled(attemptId);
      await this.accountState.refreshSubscription();
      this.message = 'Pending plan change cancelled. Your current subscription is unchanged.';
    } catch (error: any) {
      this.error = error?.error?.message || "We couldn't cancel the pending plan change. Please try again.";
    } finally {
      this.submitting = null;
    }
  }
  async resumePendingPlanChange(): Promise<void> {
    if (this.submitting) return;
    const approvalUrl = this.billing?.pendingChangeApprovalUrl;
    const attemptId = this.billing?.pendingChangeAttemptId;
    if (!attemptId) {
      this.error = 'No pending plan change attempt found.';
      return;
    }
    if (approvalUrl) {
      const url = trustedPayPalApprovalUrl(approvalUrl);
      if (!url) {
        this.error = 'The checkout approval link could not be verified.';
        return;
      }
      this.message = 'Redirecting to secure checkout…';
      if (typeof window !== 'undefined' && window.location && window.location.assign) {
        window.location.assign(url);
      }
      return;
    }
    const targetCode = this.billing?.pendingTargetPlanCode;
    if (!targetCode) {
      this.error = 'Target plan not found for pending change.';
      return;
    }
    this.submitting = 'change'; this.error = null;
    try {
      const result = await this.subscriptionApi.changePayPalPlan(targetCode, attemptId);
      if (result.requiresApproval) {
        const url = trustedPayPalApprovalUrl(result.approvalUrl);
        if (!url) throw new Error('Untrusted approval URL');
        this.message = 'Redirecting to secure checkout…';
        if (typeof window !== 'undefined' && window.location && window.location.assign) {
          window.location.assign(url);
        }
        return;
      }
      this.message = 'Plan change pending. Waiting for confirmation.';
      this.schedulePoll();
    } catch (error: any) {
      this.error = error?.error?.message || "We couldn't resume the plan change. Please try again.";
    } finally {
      this.submitting = null;
    }
  }
}
