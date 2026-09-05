import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { DraftComparison, SubmissionApiService } from '../../api/submission-api.service';

@Component({
  selector: 'app-draft-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draft-comparison.html',
  styleUrl: './draft-comparison.css'
})
export class DraftComparisonComponent implements OnChanges {
  @Input() submissionId: string | null = null;
  @Input() refreshKey: string | number | null = null;
  private readonly submissionApi = inject(SubmissionApiService);
  comparison: DraftComparison | null = null;
  loading = false;
  error = '';
  activeText: 'previous' | 'current' = 'current';
  private requestVersion = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] || changes['refreshKey']) void this.load();
  }

  async load(): Promise<void> {
    const submissionId = this.submissionId;
    const version = ++this.requestVersion;
    this.comparison = null;
    this.error = '';
    if (!submissionId) { this.loading = false; return; }
    this.loading = true;
    try {
      const result = await this.submissionApi.getDraftComparison(submissionId);
      if (version === this.requestVersion) this.comparison = result;
    } catch {
      if (version === this.requestVersion) this.error = 'Draft comparison could not be loaded. Please try again.';
    } finally {
      if (version === this.requestVersion) this.loading = false;
    }
  }

  delta(value: number | null | undefined): string {
    if (value == null) return 'Not comparable';
    return `${value > 0 ? '+' : ''}${value}`;
  }
}
