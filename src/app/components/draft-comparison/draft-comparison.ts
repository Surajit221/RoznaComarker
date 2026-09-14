import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { DraftComparison, SubmissionApiService } from '../../api/submission-api.service';

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
  private requestVersion = 0;
  private retryGeneration = 0;
  private retryAttempt = 0;
  private retryStartedAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly retryDelays = [1200, 2000, 3000, 5000];
  private readonly retryWindowMs = 30000;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] || changes['refreshKey']) void this.load();
  }

  async load(): Promise<void> {
    this.cancelRetryCycle();
    const generation = ++this.retryGeneration;
    this.retryStartedAt = Date.now();
    this.retryAttempt = 0;
    await this.fetchComparison(generation, false);
  }

  ngOnDestroy(): void {
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
      const result = await this.submissionApi.getDraftComparison(submissionId, cacheToken);
      if (!this.isCurrent(generation, version, submissionId)) return;
      this.comparison = result;
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

  delta(value: number | null | undefined): string {
    if (value == null) return 'Not comparable';
    return `${value > 0 ? '+' : ''}${value}`;
  }
}
