import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, Renderer2, ViewChild } from '@angular/core';
import type { AssessmentCreditWallet } from '../../api/credits-api.service';
import type { BackendMySubscription } from '../../api/subscription-api.service';
import { buildAccountUsageViewModel, formatStorage, formatUsageDate } from './account-usage.model';

@Component({
  selector: 'app-account-usage',
  standalone: true,
  imports: [CommonModule, A11yModule],
  templateUrl: './account-usage.html',
  styleUrl: './account-usage.css'
})
export class AccountUsage implements OnDestroy {
  readonly ringRadius = 9;
  readonly ringCircumference = 2 * Math.PI * this.ringRadius;
  @Input() wallet: AssessmentCreditWallet | null = null;
  @Input() subscription: BackendMySubscription | null = null;
  @Input() creditsLoading = false;
  @Input() subscriptionLoading = false;
  @Input() creditsError = false;
  @Input() subscriptionError = false;
  @Input() planButtonLabel = 'Manage Plan';
  @Output() addCredits = new EventEmitter<void>();
  @Output() upgradePlan = new EventEmitter<void>();
  @Output() dismissWarning = new EventEmitter<void>();
  @Output() retryUsage = new EventEmitter<void>();
  @ViewChild('usageButton') usageButton?: ElementRef<HTMLButtonElement>;

  isOpen = false;
  private previousBodyOverflow = '';

  constructor(private renderer: Renderer2) {}

  get usage() { return buildAccountUsageViewModel(this.wallet, this.subscription); }
  get isLoading(): boolean { return this.creditsLoading || this.subscriptionLoading; }
  get hasError(): boolean { return this.creditsError || this.subscriptionError; }
  get showWarning(): boolean {
    return !!this.wallet && !this.wallet.warningAcknowledged && this.usage.warningLevel !== 'neutral';
  }
  get ringUsagePercent(): number | null {
    const percent = this.usage.monthlyUsagePercent;
    return typeof percent === 'number' && Number.isFinite(percent)
      ? Math.min(100, Math.max(0, percent)) : null;
  }
  get ringDashOffset(): number {
    const percent = this.ringUsagePercent;
    return percent === null ? this.ringCircumference
      : this.ringCircumference - (percent / 100) * this.ringCircumference;
  }
  get ringIsDanger(): boolean { return this.ringUsagePercent !== null && this.ringUsagePercent >= 90; }
  get usageButtonAriaLabel(): string {
    const percent = this.ringUsagePercent;
    return percent === null ? 'Usage and plan'
      : `Usage and plan, ${percent} percent of monthly assessment credits used`;
  }
  get otherAllowances(): Array<{ label: string; value: string }> {
    const plan = this.subscription?.plan;
    const usage = this.subscription?.usage;
    if (!plan) return [];
    const rows: Array<{ label: string; value: string }> = [];
    const addTracked = (label: string, used: number | undefined, limit: number | null | undefined) => {
      if (typeof limit === 'number') rows.push({ label, value: `${Math.max(0, Number(used) || 0)} of ${limit}` });
      else if (limit === null) rows.push({ label, value: 'Unlimited' });
    };
    addTracked('Classes', usage?.classes, plan.features?.maxClasses ?? plan.limits?.classes);
    addTracked('Students', usage?.students, plan.features?.maxStudents ?? plan.limits?.students);
    addTracked('Assignments', usage?.assignments, plan.limits?.assignments);
    if (plan.features?.aiWorksheets) rows.push({ label: 'AI worksheets',
      value: typeof plan.features.aiWorksheetsLimit === 'number' ? `${plan.features.aiWorksheetsLimit} included` : 'Included' });
    if (plan.features?.aiFlashcards) rows.push({ label: 'AI flashcards',
      value: typeof plan.features.aiFlashcardsLimit === 'number' ? `${plan.features.aiFlashcardsLimit} included` : 'Included' });
    if (plan.features?.adaptiveLearning) rows.push({ label: 'Adaptive Practice',
      value: typeof plan.features.adaptiveLearningLimit === 'number' ? `${plan.features.adaptiveLearningLimit} included` : 'Included' });
    return rows;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.previousBodyOverflow = document.body.style.overflow;
    this.renderer.setStyle(document.body, 'overflow', 'hidden');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.renderer.setStyle(document.body, 'overflow', this.previousBodyOverflow);
    queueMicrotask(() => this.usageButton?.nativeElement.focus());
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  requestAddCredits(): void { this.close(); this.addCredits.emit(); }
  requestPlan(): void { this.close(); this.upgradePlan.emit(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }

  ngOnDestroy(): void {
    if (this.isOpen) this.renderer.setStyle(document.body, 'overflow', this.previousBodyOverflow);
  }

  formatStorage = formatStorage;
  formatDate = formatUsageDate;
}
