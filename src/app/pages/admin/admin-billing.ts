import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BillingAdminApiService, AdminBillingPlan, PromoRecord, PromoInput, AdminBillingTarget, AdminAssignmentQuote, billingFailure } from '../../api/billing-admin-api.service';
import { AlertService } from '../../services/alert.service';

@Component({ selector: 'app-admin-billing', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './admin-billing.html', styleUrls: ['./admin-ui.css', './admin-billing.css'] })
export class AdminBilling implements OnInit {
  private api = inject(BillingAdminApiService);
  private alerts = inject(AlertService);
  plans: AdminBillingPlan[] = []; promos: PromoRecord[] = []; page = 1; email = ''; target: AdminBillingTarget | null = null;
  planSlug = 'essential'; billingPeriod = 'monthly'; reason = ''; busy = false; message = '';
  editingId?: string;
  promo = this.emptyPromo();
  private assignment?: { identity: string; quote: AdminAssignmentQuote; operationId: string };
  emptyPromo(): PromoInput { return { code: '', active: true, discountType: 'PERCENT', discountValue: '20', currency: 'USD',
    validFrom: '', validUntil: '', plans: [] as string[], billingPeriods: [] as string[], totalLimit: null as number | null, perUserLimit: null as number | null }; }
  async ngOnInit() { try { [this.plans] = await Promise.all([this.api.plans(), this.loadPromos()]); } catch (e) { this.message = billingFailure(e).message || 'Unable to load billing tools.'; } }
  async loadPromos() { this.promos = (await this.api.promos(this.page)).items; }
  async changePage(delta: number) { this.page = Math.max(1, this.page + delta); try { await this.loadPromos(); } catch { this.message = 'Unable to load promo codes.'; } }
  editPromo(row: PromoRecord) {
    this.editingId = row._id;
    this.promo = { code: row.code, active: row.active, discountType: row.discountType, discountValue: row.discountValue,
      currency: row.currency, validFrom: row.validFrom, validUntil: row.validUntil,
      plans: row.plans, billingPeriods: row.billingPeriods, totalLimit: row.totalLimit, perUserLimit: row.perUserLimit };
    this.promo.plans = [...row.plans]; this.promo.billingPeriods = [...row.billingPeriods];
  }
  newPromo() { this.editingId = undefined; this.promo = this.emptyPromo(); }
  async savePromo() {
    if (this.busy) return; this.busy = true; this.message = '';
    try { await this.api.savePromo({ ...this.promo, validFrom: this.promo.validFrom || null, validUntil: this.promo.validUntil || null }, this.editingId);
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
    if (this.busy || !this.target || this.target.blocked) return;
    this.busy = true; this.message = '';
    try {
      const input = { email: this.target.email, planSlug: this.planSlug, billingPeriod: this.billingPeriod, reason: this.reason };
      const identity = JSON.stringify(input);
      if (this.assignment?.identity !== identity) this.assignment = { identity, quote: await this.api.preview(input), operationId: crypto.randomUUID() };
      const { quote, operationId } = this.assignment;
      const confirmed = await this.alerts.showConfirm('Confirm manual plan assignment',
        `User: ${quote.email}\nCurrent: ${quote.currentPlan}\nCurrent expiry: ${quote.currentExpiry || 'None'}\n`
        + `Scheduled plans: ${quote.scheduled.map(p => `${p.planSlug} (${p.startsAt} to ${p.endsAt})`).join(', ') || 'None'}\n`
        + `New: ${quote.planSlug} ${quote.billingPeriod}\nEffective: ${quote.startsAt}\nExpires: ${quote.endsAt || 'No expiry (Free)'}\n`
        + `Reason: ${quote.reason}\n`
        + 'Conflicting active and scheduled entitlements will be superseded. This changes access without a payment. Historical records and purchased/bonus credits are preserved.',
        'Assign plan', 'Cancel');
      if (!confirmed) { this.assignment = undefined; return; }
      await this.api.assign(quote.quoteId, operationId);
      this.assignment = undefined; this.target = await this.api.lookup(this.target.email);
      this.message = 'Plan assigned and allowance reconciled. No payment was created.';
    } catch (e) {
      const failure = billingFailure(e);
      if (['ADMIN_PREVIEW_EXPIRED', 'ADMIN_PREVIEW_CHANGED'].includes(failure.code || '')) this.assignment = undefined;
      this.message = failure.message || 'The update could not be confirmed. Retry the same action to check its result.';
    } finally { this.busy = false; }
  }
}
