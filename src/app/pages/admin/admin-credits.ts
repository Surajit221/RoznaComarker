import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CreditsApiService, type AdminCreditWalletResponse, type CreditTeacher } from '../../api/credits-api.service';
import { AlertService } from '../../services/alert.service';

@Component({ selector: 'app-admin-credits', standalone: true, imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-credits.html', styleUrl: './admin-credits.css' })
export class AdminCredits {
  private readonly api = inject(CreditsApiService); private readonly alerts = inject(AlertService);
  query = ''; teachers: CreditTeacher[] = []; selected: AdminCreditWalletResponse | null = null;
  amount: number | null = null; reason = ''; loading = false;
  async search(): Promise<void> { this.loading = true; try { this.teachers = await this.api.searchTeachers(this.query); }
    catch (e: any) { this.alerts.showError('Search failed', e?.error?.message || 'Please try again.'); } finally { this.loading = false; } }
  async select(teacher: CreditTeacher, page = 1): Promise<void> { this.loading = true; try { this.selected = await this.api.getAdminWallet(teacher._id, page); }
    catch (e: any) { this.alerts.showError('Unable to load credits', e?.error?.message || 'Please try again.'); } finally { this.loading = false; } }
  async adjust(sign: 1 | -1): Promise<void> {
    if (!this.selected || !Number.isInteger(Number(this.amount)) || Number(this.amount) <= 0 || !this.reason.trim()) {
      this.alerts.showWarning('Adjustment incomplete', 'Enter a positive whole number and a reason.'); return;
    }
    const delta = sign * Number(this.amount);
    if (delta < 0 && !await this.alerts.showConfirm('Remove Assessment Credits?',
      `Remove ${Math.abs(delta)} credits from ${this.selected.teacher.displayName || this.selected.teacher.email}?`, 'Remove Credits', 'Cancel')) return;
    try {
      const result = await this.api.adjust(this.selected.teacher._id, delta, this.reason.trim());
      this.selected = { ...this.selected, wallet: result.wallet }; this.amount = null; this.reason = '';
      await this.select(this.selected.teacher, 1);
      this.alerts.showSuccess('Credits updated', `${result.wallet.availableCredits} credits are now available.`);
    } catch (e: any) { this.alerts.showError('Adjustment failed', e?.error?.message || 'Please try again.'); }
  }
}
