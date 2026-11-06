import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { DraftChoice, DraftComparison, DraftIssueItem, SubmissionApiService } from '../../api/submission-api.service';
import { DiffResult, diffTexts } from '../../utils/text-diff.util';
import { DraftInsights, categoryName, describeDelta, draftInsights } from './draft-insights.logic';

/** v2 per-error tabs, in reading order. */
export type IssueStatus = 'fixed' | 'remaining' | 'new' | 'unclear';
export const ISSUE_TABS: { key: IssueStatus; label: string; icon: string }[] = [
  { key: 'fixed', label: 'Fixed', icon: '✓' }, { key: 'remaining', label: 'Still to fix', icon: '●' },
  { key: 'new', label: 'New', icon: '+' }, { key: 'unclear', label: 'Unclear', icon: '?' },
];
const CATEGORY_LABELS: Record<string, string> = { CONTENT: 'Content', ORGANIZATION: 'Organization', GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', MECHANICS: 'Mechanics', PRESENTATION: 'Presentation' };

@Component({
  selector: 'app-draft-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draft-comparison.html',
  styleUrl: './draft-comparison.css'
})
export class DraftComparisonComponent implements OnChanges, OnDestroy {
  @Input() submissionId: string | null = null;
  @Input() refreshKey: string | number | null = null;
  private readonly submissionApi = inject(SubmissionApiService);
  comparison: DraftComparison | null = null;
  loading = false;
  error = '';
  activeText: 'previous' | 'current' = 'current';
  readonly ISSUE_TABS = ISSUE_TABS;
  /** v2: the per-error tab shown (chosen when a comparison arrives: the first non-empty one). */
  issueTab: IssueStatus = 'fixed';
  /** v2 "Show changes": the text diff, computed locally on demand and kept until the comparison changes. */
  showChanges = false;
  diff: DiffResult | null = null;
  private diffTimer: ReturnType<typeof setTimeout> | null = null;
  /** v2 insights, computed once per comparison. */
  insights: DraftInsights | null = null;
  readonly categoryName = categoryName;
  readonly describeDelta = describeDelta;
  private requestVersion = 0;
  private retryGeneration = 0;
  private retryAttempt = 0;
  private retryStartedAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly retryDelays = [1200, 2000, 3000, 5000];
  private readonly retryWindowMs = 30000;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId']) { this.againstDraft = null; this.draftChoices = []; }
    if (changes['submissionId'] || changes['refreshKey']) void this.load();
  }

  /** v2 "Compare with": null = the default (latest vs previous). The list is kept while a chosen comparison loads. */
  againstDraft: number | null = null;
  draftChoices: DraftChoice[] = [];
  chooseDraft(value: string): void {
    const number = Number(value);
    const next = Number.isInteger(number) && number !== this.draftChoices[0]?.draftNumber ? number : null;
    if (next === this.againstDraft) return;
    this.againstDraft = next;
    void this.load();
  }
  selectedDraft(): number | null { return this.againstDraft ?? this.draftChoices[0]?.draftNumber ?? null; }

  async load(): Promise<void> {
    this.cancelRetryCycle();
    const generation = ++this.retryGeneration;
    this.retryStartedAt = Date.now();
    this.retryAttempt = 0;
    await this.fetchComparison(generation, false);
  }

  ngOnDestroy(): void {
    this.resetDiff();
    this.cancelRetryCycle();
    ++this.retryGeneration;
    ++this.requestVersion;
  }

  private async fetchComparison(generation: number, retry: boolean): Promise<void> {
    const submissionId = this.submissionId;
    const version = ++this.requestVersion;
    if (!retry) this.comparison = null;
    this.error = '';
    if (!submissionId) { this.loading = false; return; }
    if (!retry) this.loading = true;
    try {
      const cacheToken = retry ? `${this.refreshKey ?? ''}:comparison-retry-${this.retryAttempt}` : this.refreshKey;
      const result = this.againstDraft
        ? await this.submissionApi.getDraftComparison(submissionId, cacheToken, this.againstDraft)
        : await this.submissionApi.getDraftComparison(submissionId, cacheToken);
      if (!this.isCurrent(generation, version, submissionId)) return;
      if (result !== this.comparison) this.resetDiff();
      this.comparison = result;
      this.insights = draftInsights(result);
      if (result.comparisonVersion === 2 && Array.isArray(result.earlierDrafts)) this.draftChoices = result.earlierDrafts;
      if (this.isV2()) this.issueTab = ISSUE_TABS.find(tab => (result.issueDetails?.[tab.key]?.total ?? 0) > 0)?.key ?? 'fixed';
      if (!result.available && result.code === 'CURRENT_UNASSESSED') this.scheduleRetry(generation);
    } catch {
      if (this.isCurrent(generation, version, submissionId)) {
        this.cancelRetryTimer();
        this.error = 'Draft comparison could not be loaded. Please try again.';
      }
    } finally {
      if (this.isCurrent(generation, version, submissionId)) this.loading = false;
    }
  }

  private scheduleRetry(generation: number): void {
    this.cancelRetryTimer();
    const delay = this.retryDelays[Math.min(this.retryAttempt, this.retryDelays.length - 1)];
    if (Date.now() - this.retryStartedAt + delay > this.retryWindowMs) return;
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation === this.retryGeneration) void this.fetchComparison(generation, true);
    }, delay);
  }

  private isCurrent(generation: number, version: number, submissionId: string): boolean {
    return generation === this.retryGeneration && version === this.requestVersion && submissionId === this.submissionId;
  }

  private cancelRetryCycle(): void {
    this.cancelRetryTimer();
    ++this.requestVersion;
  }

  private cancelRetryTimer(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  comparisonMessage(): string {
    return this.comparison?.code === 'CURRENT_UNASSESSED'
      ? 'Finalizing draft comparison…'
      : this.comparison?.message || '';
  }

  /** Shows or hides the changes. The diff runs after this click has been painted (a macrotask), so the page never freezes on it. */
  toggleChanges(): void {
    this.showChanges = !this.showChanges;
    if (!this.showChanges || this.diff || this.diffTimer !== null) return;
    const comparison = this.comparison;
    this.diffTimer = setTimeout(() => {
      this.diffTimer = null;
      if (comparison !== this.comparison) return;
      this.diff = diffTexts(comparison?.previousText ?? '', comparison?.currentText ?? '');
    }, 0);
  }
  private resetDiff(): void {
    if (this.diffTimer !== null) clearTimeout(this.diffTimer);
    this.diffTimer = null; this.diff = null; this.showChanges = false;
  }

  /** v2 payload (the backend flag is on). Without it the template renders exactly the v1 view. */
  isV2(): boolean { return this.comparison?.comparisonVersion === 2; }
  rubricLimited(): boolean { return this.isV2() && this.comparison?.overall?.status === 'RUBRIC_CHANGED'; }
  /** v2: the drafts look like different texts: a neutral notice, the scores, and no claim of any kind. */
  textsUnrelated(): boolean { return this.isV2() && this.comparison?.textsUnrelated === true; }
  /** v2 with the per-error counts shown: five summary cards (their own responsive grid, so none is left alone on a row). */
  fiveCards(): boolean { return this.isV2() && this.comparison?.issuesAvailable !== false; }
  issueCount(status: IssueStatus): number { return this.comparison?.issueDetails?.[status]?.total ?? 0; }
  issueItems(status: IssueStatus): DraftIssueItem[] { return this.comparison?.issueDetails?.[status]?.items ?? []; }
  issueOmitted(status: IssueStatus): number { return this.comparison?.issueDetails?.[status]?.omitted ?? 0; }
  categoryLabel(category: string): string { return CATEGORY_LABELS[category] ?? (category ? category.charAt(0) + category.slice(1).toLowerCase() : 'Writing'); }
  /** Arrow keys move between the per-error tabs (WAI-ARIA tabs pattern). */
  onIssueTabKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : ISSUE_TABS.length - 1)) % ISSUE_TABS.length;
    this.issueTab = ISSUE_TABS[next].key;
    const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  delta(value: number | null | undefined): string {
    if (value == null) return 'Not comparable';
    return `${value > 0 ? '+' : ''}${value}`;
  }
}
