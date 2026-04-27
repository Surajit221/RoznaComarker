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
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetSubmission,
} from '../../../api/worksheet-api.service';
import { FormatTimePipe } from '../../../shared/pipes/format-time.pipe';
import { PdfApiService } from '../../../api/pdf-api.service';
import { AlertService } from '../../../services/alert.service';
import { triggerBlobDownload } from '../../../utils/file-download.util';

@Component({
  selector: 'app-worksheet-report',
  standalone: true,
  imports: [CommonModule, FormatTimePipe],
  templateUrl: './worksheet-report.html',
  styleUrl: './worksheet-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetReport implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly api    = inject(WorksheetApiService);
  private readonly cdr    = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly pdfApi   = inject(PdfApiService);
  private readonly alert    = inject(AlertService);

  worksheet: Worksheet | null = null;
  submissions: WorksheetSubmission[] = [];
  isLoading  = true;
  errorMsg   = '';
  searchTerm = '';

  isPdfReportDownloading = false;
  downloadingSubmissionId: string | null = null;

  private get worksheetId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get totalSubmissions(): number { return this.submissions.length; }

  get averageScore(): number {
    if (!this.submissions.length) return 0;
    const sum = this.submissions.reduce((acc, s) => acc + (s.percentage ?? 0), 0);
    return sum / this.submissions.length;
  }

  get averageTime(): number {
    if (!this.submissions.length) return 0;
    const sum = this.submissions.reduce((acc, s) => acc + (s.timeTaken ?? 0), 0);
    return sum / this.submissions.length;
  }

  get filteredSubmissions(): WorksheetSubmission[] {
    if (!this.searchTerm) return this.submissions;
    const q = this.searchTerm.toLowerCase();
    return this.submissions.filter((s) => {
      const name = this.getStudentName(s).toLowerCase();
      return name.includes(q);
    });
  }

  ngOnInit(): void { this.loadReport(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadReport(): void {
    this.isLoading = true;
    this.api.getSubmissions(this.worksheetId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.worksheet   = res.data.worksheet as unknown as Worksheet;
        this.submissions = res.data.submissions ?? [];
        this.isLoading   = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
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

  goBack(): void { this.router.navigate(['/worksheets']); }
  dismissError(): void { this.errorMsg = ''; }

  async downloadReportPdf(): Promise<void> {
    const id = this.worksheetId;
    if (!id || this.isPdfReportDownloading) return;
    this.isPdfReportDownloading = true;
    this.cdr.markForCheck();
    try {
      const blob = await this.pdfApi.downloadWorksheetReportPdf(id);
      const title = this.worksheet?.title ?? 'worksheet';
      triggerBlobDownload(blob, { filename: `${title}-report.pdf`, mimeType: 'application/pdf' });
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message ?? err?.message ?? 'Please try again');
    } finally {
      this.isPdfReportDownloading = false;
      this.cdr.markForCheck();
    }
  }

  async downloadStudentPdf(sub: WorksheetSubmission): Promise<void> {
    const submissionId = sub._id;
    if (!submissionId || this.downloadingSubmissionId === submissionId) return;
    this.downloadingSubmissionId = submissionId;
    this.cdr.markForCheck();
    try {
      const blob = await this.pdfApi.downloadWorksheetSubmissionPdf(submissionId);
      const name = this.getStudentName(sub).replace(/\s+/g, '-').toLowerCase();
      triggerBlobDownload(blob, { filename: `worksheet-${name}.pdf`, mimeType: 'application/pdf' });
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message ?? err?.message ?? 'Please try again');
    } finally {
      this.downloadingSubmissionId = null;
      this.cdr.markForCheck();
    }
  }

  getStudentName(sub: WorksheetSubmission): string {
    const s: any = sub.studentId;
    return s?.displayName ?? s?.email ?? 'Student';
  }

  getStudentInitials(sub: WorksheetSubmission): string {
    return this.getStudentName(sub).split(' ').slice(0, 2).map((p: string) => p[0]?.toUpperCase() ?? '').join('');
  }

  trackById(_: number, item: { _id?: string }): string { return item._id ?? String(_); }
}
