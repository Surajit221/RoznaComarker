import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { AssessmentCreditWallet } from '../../api/credits-api.service';
import type { BackendMySubscription } from '../../api/subscription-api.service';
import { buildAccountUsageViewModel } from './account-usage.model';

@Component({ selector: 'app-account-usage', standalone: true, imports: [CommonModule],
  templateUrl: './account-usage.html', styleUrl: './account-usage.css' })
export class AccountUsage {
  readonly ringRadius = 9;
  readonly ringCircumference = 2 * Math.PI * this.ringRadius;
  @Input() wallet: AssessmentCreditWallet | null = null;
  @Input() subscription: BackendMySubscription | null = null;
  @Input() creditsLoading = false;
  @Input() subscriptionLoading = false;
  @Input() creditsError = false;
  @Input() subscriptionError = false;
  @Input() planButtonLabel = 'Manage Plan';
  get usage() { return buildAccountUsageViewModel(this.wallet, this.subscription); }
  get ringUsagePercent(): number | null { return this.usage.storageUsagePercent; }
  get ringDashOffset(): number { return this.ringUsagePercent === null ? this.ringCircumference : this.ringCircumference - (this.ringUsagePercent / 100) * this.ringCircumference; }
  get ringIsDanger(): boolean { return this.ringUsagePercent !== null && this.ringUsagePercent >= 90; }
  get storageLabel(): string {
    if (this.subscriptionLoading) return 'Loading storage';
    if (this.subscriptionError || this.usage.storageUsedMB === null || this.usage.storageLimitMB === null) return 'Storage unavailable';
    return `${this.mb(this.usage.storageUsedMB)} / ${this.mb(this.usage.storageLimitMB)}`;
  }
  get ariaLabel(): string { return this.ringUsagePercent === null ? this.storageLabel : `${this.storageLabel}, ${this.ringUsagePercent} percent used`; }
  private mb(value: number): string { return value > 0 && value < 1
    ? `${Math.max(1, Math.round(value * 1024))} KB` : `${Number(value.toFixed(2))} MB`; }
}
