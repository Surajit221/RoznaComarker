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
import { Subject, firstValueFrom, takeUntil, interval } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AssignmentApiService, type BackendFlashcardAssignmentSubmission } from '../../../api/assignment-api.service';
import { FormatTimePipe } from '../../../shared/pipes/format-time.pipe';
import { InitialsPipe } from '../../../shared/pipes/initials.pipe';
import type {
  FlashcardReport as FlashcardReportModel,
  ParticipantResult,
  FlashCard,
  CardResult,
} from '../../../models/flashcard-set.model';
import { PdfApiService } from '../../../api/pdf-api.service';
import { AlertService } from '../../../services/alert.service';
import { triggerBlobDownload } from '../../../utils/file-download.util';
import { FlashcardPdfRenderService } from '../../../components/flashcard-pdf-template/flashcard-pdf-render.service';
import { ComprehensiveReport, type ReportEntry } from '../../../components/comprehensive-report/comprehensive-report';
import { NotificationRealtimeService } from '../../../services/notification-realtime.service';

type ReportTab = 'participants' | 'cards' | 'analytics';
type AssignmentProgress = Awaited<ReturnType<AssignmentApiService['getAssignmentProgress']>>;
type ParticipantRow = Omit<ParticipantResult, 'score' | 'timeTaken' | 'submittedAt'> & {
  score: number | null;
  timeTaken: number | null;
  submittedAt: Date | string | null;
  completedCards?: number;
  totalCards?: number;
};

@Component({
  selector: 'app-flashcard-report',
  standalone: true,
  imports: [CommonModule, FormatTimePipe, InitialsPipe, ComprehensiveReport],
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
  private readonly pdfApi         = inject(PdfApiService);
  private readonly alert          = inject(AlertService);
  private readonly assignmentApi  = inject(AssignmentApiService);
  private readonly fcPdfRenderer  = inject(FlashcardPdfRenderService);
  private readonly realtime       = inject(NotificationRealtimeService);

  report: FlashcardReportModel | null = null;
  isLoading  = true;
  errorMsg   = '';
  activeTab: ReportTab           = 'participants';
  searchTerm                     = '';
  filterStatus: 'all' | 'completed' | 'in_progress' | 'not_started' = 'all';
  isPdfDownloading = false;
  isRefreshing = false;
  /** userId currently being downloaded (for per-row spinner). */
  participantDownloadingId: string | null = null;

  /** Polling for real-time updates */
  private readonly POLL_INTERVAL_MS = 30000; // 30 seconds
  lastUpdatedAt: Date | null = null;
  isPolling = false;

  /** Assignment progress data (for real-time tracking) */
  assignmentProgress: AssignmentProgress | null = null;
  useAssignmentProgress = false;

  /** Cached cards for the set (lazy on first per-student PDF). */
  private cachedCards: FlashCard[] | null = null;
  /** Cached set title (lazy). */
  private cachedSetTitle: string = '';
  /** Cached raw submissions for the assignment (lazy). */
  private cachedSubmissions: BackendFlashcardAssignmentSubmission[] | null = null;

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get assignmentId(): string {
    return this.route.snapshot.queryParamMap.get('assignmentId') ?? '';
  }

  get reportEntries(): ReportEntry[] {
    return this.participantRows.filter((participant) => participant.score !== null).map((p) => ({
      name:        p.userName,
      score:       p.score ?? 0,
      timeTaken:   p.timeTaken ?? 0,
      submittedAt: p.submittedAt ?? undefined,
    }));
  }

  get participantRows(): ParticipantRow[] {
    if (this.useAssignmentProgress && this.assignmentProgress) {
      return this.assignmentProgress.students.map((student) => ({
        userId: student.studentId,
        userName: student.studentName,
        score: student.score,
        timeTaken: student.timeTaken,
        submittedAt: student.completedAt ?? student.lastActivityAt,
        status: student.status,
        completedCards: student.completedCards,
        totalCards: student.totalCards,
      }));
    }
    return this.report?.participants ?? [];
  }

  /** Participants filtered by searchTerm and filterStatus */
  get filteredParticipants(): ParticipantRow[] {
    const all = this.participantRows;
    return all
      .filter((p) => {
        const matchSearch = !this.searchTerm ||
          p.userName.toLowerCase().includes(this.searchTerm.toLowerCase());
        let matchStatus = this.filterStatus === 'all';
        if (this.filterStatus === 'completed') {
          matchStatus = p.status === 'completed';
        } else if (this.filterStatus === 'in_progress') {
          matchStatus = p.status === 'in_progress';
        } else if (this.filterStatus === 'not_started') {
          matchStatus = p.status === 'not_started';
        }
        return matchSearch && matchStatus;
      });
  }

  get completedCount(): number {
    return this.participantRows.filter((participant) => participant.status === 'completed').length;
  }

  get attentionParticipantCount(): number {
    return this.participantRows.filter((participant) => participant.score !== null && participant.score < 60).length;
  }

  get attentionCardCount(): number {
    return (this.report?.cards ?? []).filter((card) => card.correctPercentage < 60).length;
  }

  get hasParticipantFilters(): boolean {
    return Boolean(this.searchTerm) || this.filterStatus !== 'all';
  }

  ngOnInit(): void {
    this.loadReport();
    this.realtime.connect();
    this.realtime.notifications$.pipe(takeUntil(this.destroy$)).subscribe((notification) => {
      if (notification?.type !== 'assignment_submitted') return;
      const data = notification.data || {};
      if (String(data['resourceType'] || '') !== 'flashcard') return;
      if (!this.assignmentId || String(data['assignmentId'] || '') !== this.assignmentId) return;
      this.cachedSubmissions = null;
      this.refreshData();
    });
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Start polling for real-time updates every 30 seconds */
  private startPolling(): void {
    if (!this.assignmentId) return; // Only poll when viewing assignment report

    this.isPolling = true;
    interval(this.POLL_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshData();
      });
  }

  /** Refresh data without showing full loading state */
  private refreshData(): void {
    this.isRefreshing = true;
    this.cdr.markForCheck();
    if (!this.assignmentId) {
      // Use standard report endpoint if no assignmentId
      this.flashcardApi.getReport(this.setId, this.assignmentId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (data) => {
            this.report = data;
            this.lastUpdatedAt = new Date();
            this.isRefreshing = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('Polling error:', err);
            this.isRefreshing = false;
            this.cdr.markForCheck();
          }
        });
    } else {
      // Refresh both class progress and submission-derived score/card analytics.
      Promise.all([
        firstValueFrom(
          this.flashcardApi
            .getReport(this.setId, this.assignmentId)
            .pipe(takeUntil(this.destroy$)),
        ),
        this.assignmentApi.getAssignmentProgress(this.assignmentId),
      ])
        .then(([reportData, progressData]) => {
          this.report = reportData;
          this.assignmentProgress = progressData;
          this.useAssignmentProgress = true;
          this.lastUpdatedAt = new Date();
          this.isRefreshing = false;
          this.cdr.markForCheck();
        })
        .catch((err) => {
          console.error('Polling error:', err);
          this.isRefreshing = false;
          this.cdr.markForCheck();
        });
    }
  }

  /** Manual refresh button handler */
  manualRefresh(): void {
    this.refreshData();
  }

  private loadReport(): void {
    this.isLoading = true;
    this.flashcardApi.getReport(this.setId, this.assignmentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.report    = data;
        this.isLoading = false;
        this.lastUpdatedAt = new Date();
        this.cdr.markForCheck();

        // Also load assignment progress if available
        if (this.assignmentId) {
          this.loadAssignmentProgress();
        }
      },
      error: (err) => {
        this.errorMsg  = err?.error?.message ?? 'Failed to load report';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Load assignment progress for real-time status */
  private async loadAssignmentProgress(): Promise<void> {
    if (!this.assignmentId) return;
    try {
      this.assignmentProgress = await this.assignmentApi.getAssignmentProgress(this.assignmentId);
      this.useAssignmentProgress = true;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to load assignment progress:', err);
    }
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.cdr.markForCheck();
  }

  setTab(tab: ReportTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  setStatusFilter(status: 'all' | 'completed' | 'in_progress' | 'not_started'): void {
    this.filterStatus = status;
    this.cdr.markForCheck();
  }

  clearParticipantFilters(): void {
    this.searchTerm = '';
    this.filterStatus = 'all';
    this.cdr.markForCheck();
  }

  getStatusLabel(status: ParticipantResult['status']): string {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'not_started') return 'Not Started';
    return 'Completed';
  }

  getCardPerformanceLabel(percentage: number): string {
    if (percentage < 60) return 'Needs review';
    if (percentage < 80) return 'Developing';
    return 'Strong';
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

  /**
   * Teacher per-student client-side PDF.
   * Lazy-loads cards + per-student cardResults on first invocation.
   */
  async downloadParticipantPdf(p: ParticipantRow): Promise<void> {
    if (this.participantDownloadingId === p.userId) return;
    if (!this.assignmentId) {
      this.alert.showWarning(
        'PDF unavailable',
        'Per-student PDFs require an assignment. Open this report from a class assignment to enable downloads.',
      );
      return;
    }

    this.participantDownloadingId = p.userId;
    this.cdr.markForCheck();
    try {
      // Lazy-load flashcard set cards + title (cached for subsequent rows).
      if (!this.cachedCards) {
        const set = await firstValueFrom(this.flashcardApi.getSetById(this.setId));
        this.cachedCards    = (set?.cards ?? []) as FlashCard[];
        this.cachedSetTitle = set?.title ?? '';
      }

      // Always request the persisted assignment submissions so a recently
      // completed participant cannot produce a stale or mismatched PDF.
      this.cachedSubmissions =
        await this.assignmentApi.getFlashcardAssignmentSubmissions(this.assignmentId);

      const sub = (this.cachedSubmissions ?? []).find((s: any) => {
        const uid = typeof s.userId === 'string' ? s.userId : s.userId?._id;
        return String(uid ?? '') === String(p.userId);
      });
      if (!sub) {
        this.alert.showError('PDF unavailable', 'Submission not found for this participant.');
        return;
      }

      const subAny = sub as any;
      const cardResults: CardResult[] = Array.isArray(subAny.cardResults)
        ? subAny.cardResults.map((r: any) => ({
            cardId:        String(r.cardId ?? ''),
            known:         !!r.known,
            studentAnswer: r.studentAnswer ?? undefined,
            isCorrect:     r.isCorrect ?? undefined,
          }))
        : [];

      // Fallback: derive known/learning from results[] if cardResults absent.
      const derivedResults: CardResult[] = cardResults.length
        ? cardResults
        : (Array.isArray(subAny.results) ? subAny.results : []).map((r: any) => ({
            cardId: String(r.cardId ?? ''),
            known:  r.status === 'know',
          }));

      const isAssessedQa = (subAny.template ?? 'term-def') === 'qa';
      const correctCount = derivedResults.filter((r) => isAssessedQa ? r.isCorrect === true : r.known).length;
      const assessedTotal = isAssessedQa
        ? derivedResults.filter((r) => typeof r.isCorrect === 'boolean').length
        : derivedResults.length;
      const authoritativeDisplayScore = assessedTotal > 0 ? Math.round((correctCount / assessedTotal) * 100) : 0;
      const total        = subAny.totalCards ?? this.cachedCards.length ?? derivedResults.length;
      const dateStr = subAny.submittedAt
        ? new Date(subAny.submittedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : '';
      const safeFilenamePart = (value: string, fallback: string) =>
        value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || fallback;
      const safeName  = safeFilenamePart(p.userName || '', 'student');
      const safeTitle = safeFilenamePart(this.cachedSetTitle || '', 'flashcards');

      await this.fcPdfRenderer.render(
        {
          setTitle:         this.cachedSetTitle || 'Flashcard Set',
          studentName:      p.userName || 'Student',
          date:             dateStr,
          score:            isAssessedQa ? authoritativeDisplayScore : (subAny.score ?? p.score ?? 0),
          total,
          timeTaken:        subAny.timeTaken ?? p.timeTaken ?? 0,
          template:         subAny.template ?? 'term-def',
          correctCount,
          needsReviewCount: isAssessedQa ? assessedTotal - correctCount : total - correctCount,
          cards:            this.cachedCards,
          cardResults:      derivedResults,
        },
        `${safeName}-${safeTitle}-report.pdf`,
      );
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message ?? err?.message ?? 'Please try again');
    } finally {
      this.participantDownloadingId = null;
      this.cdr.markForCheck();
    }
  }
}
