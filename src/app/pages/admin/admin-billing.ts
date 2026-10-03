import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { BillingAdminApiService, AdminBillingPlan, PromoRecord, PromoFormInput, AdminBillingTarget, AdminAssignmentQuote, billingFailure } from '../../api/billing-admin-api.service';

@Component({ selector: 'app-admin-billing', standalone: true, imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './admin-billing.html', styleUrls: ['./admin-ui.css', './admin-billing.css'] })
export class AdminBilling implements OnInit, OnDestroy {
  private api = inject(BillingAdminApiService);
  @ViewChild('assignmentDialog') private assignmentDialog?: ElementRef<HTMLElement>;
  confirmation: AdminAssignmentQuote | null = null;
  assigning = false;
  private confirmationTrigger: HTMLElement | null = null;
  plans: AdminBillingPlan[] = []; promos: PromoRecord[] = []; page = 1; email = ''; target: AdminBillingTarget | null = null;
  planSlug = 'essential'; billingPeriod = 'monthly'; reason = ''; busy = false; message = '';
  promoDateFrom = ''; promoDateUntil = ''; dateError = '';
  private originalDateFrom = ''; private originalDateUntil = '';
  editingId?: string;
  promo = this.emptyPromo();
  private assignment?: { identity: string; quote: AdminAssignmentQuote; operationId: string };
  get planTiers(): { tier: string; name: string }[] {
    return [...new Set(this.plans.map(plan => plan.tier))].map(tier => {
      const plans = this.plans.filter(plan => plan.tier === tier);
      return { tier, name: (plans.find(plan => plan.periods.includes('monthly')) || plans[0]).name };
    });
  }
  get availablePeriods(): ('monthly' | 'annual')[] {
    return [...new Set(this.plans.filter(plan => plan.tier === this.planSlug).flatMap(plan => plan.periods))];
  }
  get promoPlans(): AdminBillingPlan[] { return this.plans.filter(plan => plan.promoEligible); }
  private labelCatalog?: AdminBillingPlan[];
  private planLabels = new Map<string, AdminBillingPlan>();
  promoCatalogLabel(plan: AdminBillingPlan): string {
    return plan.periods.length === 1 && plan.periods[0] === 'annual' && !/\b(annual|yearly)\b/i.test(plan.name)
      ? `${plan.name} Annual` : plan.name;
  }
  promoPlanLabel(row: PromoRecord): string {
    const restriction = row.billingPeriods.length === 1 ? (row.billingPeriods[0] === 'annual' ? 'Annual' : 'Monthly') : '';
    if (!row.plans.length) return `All paid plans${restriction ? ` (${restriction})` : ''}`;
    if (this.labelCatalog !== this.plans) {
      this.labelCatalog = this.plans;
      this.planLabels = new Map(this.plans.map(plan => [plan.slug, plan]));
    }
    return row.plans.map(slug => {
      const plan = this.planLabels.get(slug);
      const label = plan ? this.promoCatalogLabel(plan) : slug.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      return `${label}${restriction && (!plan || plan.periods.length !== 1 || !row.billingPeriods.includes(plan.periods[0])) ? ` (${restriction})` : ''}`;
    }).join(', ');
  }
  selectTier(): void { if (!this.availablePeriods.includes(this.billingPeriod as 'monthly' | 'annual')) this.billingPeriod = this.availablePeriods[0] || 'monthly'; }
  private selectedPlanSlug(): string | null {
    if (this.planSlug === 'free') return this.plans.some(plan => plan.slug === 'free') ? 'free' : null;
    return this.plans.find(plan => plan.tier === this.planSlug && plan.periods.includes(this.billingPeriod as 'monthly' | 'annual'))?.slug || null;
  }
  assignmentPlanName(slug: string): string {
    const plan = this.plans.find(item => item.slug === slug);
    if (plan) return plan.name.replace(/\s+(Monthly|Annual|Yearly)$/i, '');
    return slug.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  assignmentTerm(period: string): string { return period === 'annual' ? 'Annual' : 'Monthly'; }
  @HostListener('document:keydown.escape') onConfirmationEscape(): void {
    if (this.confirmation && !this.assigning) this.cancelConfirmation();
  }
  ngOnDestroy(): void { if (this.confirmation) document.body.style.overflow = ''; }
  cancelConfirmation(): void {
    if (this.assigning) return;
    this.confirmation = null;
    this.assignment = undefined;
    document.body.style.overflow = '';
    const trigger = this.confirmationTrigger;
    this.confirmationTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }
  private toLocalDateTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  private toIso(value: string): string | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && this.toLocalDateTime(date.toISOString()) === value ? date.toISOString() : null;
  }
  emptyPromo(): PromoFormInput { return { code: '', active: true, discountType: 'PERCENT', discountValue: '20', currency: 'USD',
    validFrom: '', validUntil: '', plans: [] as string[], totalLimit: null as number | null, perUserLimit: null as number | null }; }
  async ngOnInit() { try { [this.plans] = await Promise.all([this.api.plans(), this.loadPromos()]); } catch (e) { this.message = billingFailure(e).message || 'Unable to load billing tools.'; } }
  async loadPromos() { this.promos = (await this.api.promos(this.page)).items; }
  async changePage(delta: number) { this.page = Math.max(1, this.page + delta); try { await this.loadPromos(); } catch { this.message = 'Unable to load promo codes.'; } }
  editPromo(row: PromoRecord) {
    this.editingId = row._id;
    this.promo = { code: row.code, active: row.active, discountType: row.discountType, discountValue: row.discountValue,
      currency: row.currency, validFrom: row.validFrom, validUntil: row.validUntil,
      plans: [...row.plans], totalLimit: row.totalLimit, perUserLimit: row.perUserLimit };
    this.promoDateFrom = this.toLocalDateTime(row.validFrom);
    this.promoDateUntil = this.toLocalDateTime(row.validUntil);
    this.originalDateFrom = this.promoDateFrom; this.originalDateUntil = this.promoDateUntil;
    this.dateError = '';
  }
  newPromo() { this.editingId = undefined; this.promo = this.emptyPromo(); this.promoDateFrom = ''; this.promoDateUntil = ''; this.originalDateFrom = ''; this.originalDateUntil = ''; this.dateError = ''; }
  async savePromo() {
    if (this.busy) return;
    this.dateError = '';
    const validFrom = this.editingId && this.promoDateFrom && this.promoDateFrom === this.originalDateFrom
      ? this.promo.validFrom : this.toIso(this.promoDateFrom);
    const validUntil = this.editingId && this.promoDateUntil && this.promoDateUntil === this.originalDateUntil
      ? this.promo.validUntil : this.toIso(this.promoDateUntil);
    if ((this.promoDateFrom && !validFrom) || (this.promoDateUntil && !validUntil)) this.dateError = 'Choose a valid date and time.';
    else if (validFrom && validUntil && validUntil <= validFrom) this.dateError = 'End date must be after the start date.';
    if (this.dateError) return;
    this.busy = true; this.message = '';
    try { await this.api.savePromo({ ...this.promo, validFrom, validUntil }, this.editingId);
      await this.loadPromos(); this.newPromo(); this.message = 'Promo saved. Existing orders retain their original discount.'; }
    catch (e) { this.message = billingFailure(e).message || 'Unable to save promo.'; }
    finally { this.busy = false; }
  }
  async search() {
    if (this.busy) return; this.busy = true; this.target = null; this.assignment = undefined; this.message = '';
    try { this.target = await this.api.lookup(this.email.trim()); }
    catch (e) { this.message = billingFailure(e).message || 'User lookup failed.'; }
    finally { this.busy = false; }
  }
  async assign() {
    if (this.busy || this.confirmation || !this.target || this.target.blocked) return;
    const selectedSlug = this.selectedPlanSlug() || (this.plans.length ? null : this.planSlug);
    if (!selectedSlug) { this.message = 'Select an available plan and term.'; return; }
    this.busy = true; this.message = '';
    this.confirmationTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const input = { email: this.target.email, planSlug: selectedSlug, billingPeriod: this.planSlug === 'free' ? 'monthly' : this.billingPeriod, reason: this.reason };
      const identity = JSON.stringify(input);
      if (this.assignment?.identity !== identity) this.assignment = { identity, quote: await this.api.preview(input), operationId: crypto.randomUUID() };
      this.confirmation = this.assignment.quote;
      document.body.style.overflow = 'hidden';
      setTimeout(() => this.assignmentDialog?.nativeElement.focus());
    } catch (e) {
      const failure = billingFailure(e);
      if (['ADMIN_PREVIEW_EXPIRED', 'ADMIN_PREVIEW_CHANGED'].includes(failure.code || '')) this.assignment = undefined;
      this.message = failure.message || 'The update could not be confirmed. Retry the same action to check its result.';
    } finally { this.busy = false; }
  }
  async confirmAssignment(): Promise<void> {
    if (this.assigning || !this.confirmation || !this.assignment) return;
    this.assigning = true;
    this.message = '';
    const { quote, operationId } = this.assignment;
    try {
      await this.api.assign(quote.quoteId, operationId);
      this.confirmation = null;
      document.body.style.overflow = '';
      this.assignment = undefined;
      const trigger = this.confirmationTrigger;
      this.confirmationTrigger = null;
      queueMicrotask(() => trigger?.focus());
      this.target = await this.api.lookup(quote.email);
      this.message = 'Plan assigned and allowance reconciled. No payment was created.';
    } catch (e) {
      const failure = billingFailure(e);
      if (['ADMIN_PREVIEW_EXPIRED', 'ADMIN_PREVIEW_CHANGED'].includes(failure.code || '')) {
        this.assignment = undefined;
        this.confirmation = null;
        document.body.style.overflow = '';
        const trigger = this.confirmationTrigger;
        this.confirmationTrigger = null;
        queueMicrotask(() => trigger?.focus());
      }
      this.message = failure.message || 'The update could not be confirmed. Retry the same action to check its result.';
    } finally { this.assigning = false; }
  }
}
