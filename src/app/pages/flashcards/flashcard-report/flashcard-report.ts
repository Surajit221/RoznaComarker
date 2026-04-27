import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { FormatTimePipe } from '../../../shared/pipes/format-time.pipe';
import { InitialsPipe } from '../../../shared/pipes/initials.pipe';
import type {
  FlashcardReport as FlashcardReportModel,
  ParticipantResult,
} from '../../../models/flashcard-set.model';
import { PdfApiService } from '../../../api/pdf-api.service';
import { AlertService } from '../../../services/alert.service';
import { triggerBlobDownload } from '../../../utils/file-download.util';

type ReportTab = 'participants' | 'cards';

@Component({
  selector: 'app-flashcard-report',
  standalone: true,
  imports: [CommonModule, FormatTimePipe, InitialsPipe],
  templateUrl: './flashcard-report.html',
  styleUrl: './flashcard-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardReport implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();
  private readonly pdfApi       = inject(PdfApiService);
  private readonly alert        = inject(AlertService);

  report: FlashcardReportModel | null = null;
  isLoading  = true;
  errorMsg   = '';
  activeTab: ReportTab           = 'participants';
  searchTerm                     = '';
  filterStatus: 'all' | 'completed' = 'all';
  isPdfDownloading = false;

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  private get assignmentId(): string {
    return this.route.snapshot.queryParamMap.get('assignmentId') ?? '';
  }

  /** Participants filtered by searchTerm and filterStatus */
  get filteredParticipants(): ParticipantResult[] {
    const all = this.report?.participants ?? [];
    return all
      .filter((p) => {
        const matchSearch = !this.searchTerm ||
          p.userName.toLowerCase().includes(this.searchTerm.toLowerCase());
        const matchStatus = this.filterStatus === 'all' || p.status === this.filterStatus;
        return matchSearch && matchStatus;
      });
  }

  ngOnInit(): void {
    this.loadReport();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadReport(): void {
    this.isLoading = true;
    this.flashcardApi.getReport(this.setId, this.assignmentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.report    = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg  = err?.error?.message ?? 'Failed to load report';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  dismissError(): void { this.errorMsg = ''; }

  goBack(): void {
    this.router.navigate(['/flashcards', this.setId]);
  }

  async downloadReport(): Promise<void> {
    if (!this.report || this.isPdfDownloading) return;
    this.isPdfDownloading = true;
    this.cdr.markForCheck();
    try {
      const blob = await this.pdfApi.downloadFlashcardReportPdf(
        this.setId,
        this.assignmentId || undefined
      );
      triggerBlobDownload(blob, { filename: 'flashcard-report.pdf', mimeType: 'application/pdf' });
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message ?? err?.message ?? 'Please try again');
    } finally {
      this.isPdfDownloading = false;
      this.cdr.markForCheck();
    }
  }

  trackById(_: number, item: { userId?: string; cardId?: string }): string {
    return item.userId ?? item.cardId ?? String(_);
  }
}
