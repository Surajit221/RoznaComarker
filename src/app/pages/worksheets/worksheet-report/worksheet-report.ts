import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { triggerBlobDownload } from '../../../utils/file-download.util';
import { WorksheetPdfRenderService } from '../../../components/worksheet-pdf-template/worksheet-pdf-render.service';
import { ComprehensiveReport, type ReportEntry } from '../../../components/comprehensive-report/comprehensive-report';
import { QrCodeComponent } from 'ng-qrcode';
import { WorksheetAssignModal } from '../../../components/teacher/worksheet-assign-modal/worksheet-assign-modal';
import { WorksheetReportPdfService, type WorksheetReportData } from '../../../services/worksheet-report-pdf.service';
import { ReportPdfTemplateComponent } from './report-pdf-template/report-pdf-template.component';

@Component({
  selector: 'app-worksheet-report',
  standalone: true,
  imports: [CommonModule, FormsModule, FormatTimePipe, ComprehensiveReport, QrCodeComponent, ErrorModal, SuccessModal, WorksheetAssignModal, ReportPdfTemplateComponent],
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
  private readonly pdfApi      = inject(PdfApiService);
  private readonly pdfRenderer = inject(WorksheetPdfRenderService);
  private readonly pdfReportService = inject(WorksheetReportPdfService);

  worksheet: Worksheet | null = null;
  submissions: WorksheetSubmission[] = [];
  isLoading  = true;
  errorMsg   = '';
  searchTerm = '';

  // Comprehensive report data
  overview: any = null;
  analytics: any = null;
  pagination: any = null;

  // New analytics data
  scoreBands: any = null;
  teacherInsights: string[] = [];
  showQuestionInsights = false;
  showScoreBands = false;

  // Filters
  classFilter: string = '';
  statusFilter: string = '';
  dateFromFilter: string = '';
  dateToFilter: string = '';

  // Pagination
  currentPage = 1;
  pageSize = 20;

  isPdfReportDownloading = false;
  downloadingSubmissionId: string | null = null;
  showComprehensive = false;
  errorModal  = { open: false, title: '', message: '' };
  successModal = { open: false, title: '', message: '' };

  /** Share modal state */
  showShareModal  = false;
  shareUrl: string | null = null;
  shareLoading    = false;
  shareCopied     = false;

  /** Worksheet assign modal state */
  showAssignModal = false;

  /** PDF report data for html2canvas */
  reportData: WorksheetReportData | null = null;

  get worksheetId(): string {
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

  get reportEntries(): ReportEntry[] {
    return this.submissions.map((s) => ({
      name:      this.getStudentName(s),
      score:     s.percentage ?? 0,
      timeTaken: s.timeTaken ?? 0,
      submittedAt: s.submittedAt,
    }));
  }

  // Enhanced section analytics - now uses backend sectionStats
  get sectionAnalytics(): any[] {
    if (!this.worksheet || !this.analytics?.sectionStats) return [];

    const sections: any[] = [];
    const backendSectionStats = this.analytics.sectionStats;

    // Map backend section IDs to worksheet activities
    const sectionMap: Record<string, { title: string; type: string }> = {};

    // Activity 1: Ordering
    if (this.worksheet.activity1) {
      sectionMap['activity1'] = {
        title: this.worksheet.activity1.title,
        type: 'Ordering'
      };
    }

    // Activity 2: Classification
    if (this.worksheet.activity2) {
      sectionMap['activity2'] = {
        title: this.worksheet.activity2.title,
        type: 'Classification'
      };
    }

    // Activity 3: Multiple Choice
    if (this.worksheet.activity3) {
      sectionMap['activity3'] = {
        title: this.worksheet.activity3.title,
        type: 'Multiple Choice'
      };
    }

    // Activity 4: Fill in Blanks
    if (this.worksheet.activity4) {
      sectionMap['activity4'] = {
        title: this.worksheet.activity4.title,
        type: 'Fill in Blanks'
      };
    }

    // Activities 5-8 (new types)
    for (let i = 5; i <= 8; i++) {
      const activityKey = `activity${i}` as keyof Worksheet;
      if (this.worksheet[activityKey]) {
        const activity = this.worksheet[activityKey] as any;
        const typeNames: Record<string, string> = {
          activity5: 'Match Pairs',
          activity6: 'True/False',
          activity7: 'Image Label',
          activity8: 'Enhanced Sequencing'
        };
        sectionMap[activityKey] = {
          title: activity.title,
          type: typeNames[activityKey] || 'Activity'
        };
      }
    }

    // Map dynamic activities array if present
    if (this.worksheet.activities && Array.isArray(this.worksheet.activities)) {
      this.worksheet.activities.forEach((activity: any, index: number) => {
        const sectionId = `activity_${index}`;
        const typeNames: Record<string, string> = {
          ordering: 'Ordering',
          classification: 'Classification',
          multipleChoice: 'Multiple Choice',
          fillBlanks: 'Fill in Blanks',
          matching: 'Matching',
          dragDrop: 'Drag & Drop',
          shortAnswer: 'Short Answer',
          trueFalse: 'True/False'
        };
        sectionMap[sectionId] = {
          title: activity.title || `Section ${index + 1}`,
          type: typeNames[activity.type] || activity.type || 'Activity'
        };
      });
    }

    // Merge backend stats with worksheet metadata
    backendSectionStats.forEach((backendStat: any) => {
      const metadata = sectionMap[backendStat.sectionId] || {
        title: backendStat.sectionId,
        type: 'Activity'
      };

      // Use the authoritative aggregate counts from the backend (computed over ALL submissions).
      // Never re-compute from this.submissions which is only the current page.
      sections.push({
        id: backendStat.sectionId,
        title: metadata.title,
        type: metadata.type,
        averageScore: backendStat.correctRate || 0,
        completionRate: backendStat.completionRate || 0,
        averageTimeSpent: 0,
        totalQuestions: backendStat.totalQuestions || 0,
        correctAnswers: backendStat.correctCount ?? 0,
        incorrectAnswers: backendStat.incorrectCount ?? 0,
        skippedQuestions: backendStat.skippedCount ?? 0,
        mostMissedQuestions: backendStat.mostMissedQuestions || [],
        avgAttempts: backendStat.avgAttempts || 1,
      });
    });

    return sections;
  }

  // Student performance analytics
  get weakSections(): any[] {
    const sectionPerf = this.sectionAnalytics.map(section => ({
      ...section,
      performanceScore: section.averageScore
    }));

    return sectionPerf
      .filter(section => section.averageScore < 70)
      .sort((a, b) => a.averageScore - b.averageScore)
      .slice(0, 3);
  }

  get performanceTrends(): any {
    if (this.submissions.length < 2) return null;

    const sortedSubmissions = this.submissions
      .filter(s => s.submittedAt)
      .sort((a, b) => new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime());

    const recent = sortedSubmissions.slice(-5);
    const earlier = sortedSubmissions.slice(0, -5);

    const recentAvg = recent.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / recent.length;
    const earlierAvg = earlier.length > 0 ? 
      earlier.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / earlier.length : recentAvg;

    return {
      trend: recentAvg > earlierAvg ? 'improving' : recentAvg < earlierAvg ? 'declining' : 'stable',
      recentAverage: Math.round(recentAvg),
      earlierAverage: Math.round(earlierAvg),
      change: Math.round(recentAvg - earlierAvg)
    };
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
    const params: any = {
      page: this.currentPage,
      limit: this.pageSize,
    };
    if (this.classFilter) params.classId = this.classFilter;
    if (this.statusFilter) params.status = this.statusFilter;
    if (this.dateFromFilter) params.dateFrom = this.dateFromFilter;
    if (this.dateToFilter) params.dateTo = this.dateToFilter;

    this.api.getWorksheetReport(this.worksheetId, params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const data = res.data;
        this.worksheet   = data.worksheet as unknown as Worksheet;
        this.submissions = data.submissions ?? [];
        this.overview     = data.overview;
        this.analytics    = data.analytics;
        this.pagination   = data.pagination;
        this.scoreBands   = data.analytics?.scoreBands || null;
        this.teacherInsights = this.mapTeacherInsights(data.analytics?.teacherInsights || []);
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

  applyFilters(): void {
    this.currentPage = 1;
    this.loadReport();
  }

  clearFilters(): void {
    this.classFilter = '';
    this.statusFilter = '';
    this.dateFromFilter = '';
    this.dateToFilter = '';
    this.currentPage = 1;
    this.loadReport();
  }

  goToPage(page: number): void {
    if (page < 1 || page > (this.pagination?.pages || 1)) return;
    this.currentPage = page;
    this.loadReport();
  }

  goToNextPage(): void {
    if (this.currentPage < (this.pagination?.pages || 1)) {
      this.currentPage++;
      this.loadReport();
    }
  }

  goToPrevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadReport();
    }
  }

  goBack(): void { this.router.navigate(['/worksheets']); }
  dismissError(): void { this.errorMsg = ''; }

  async downloadReportPdf(): Promise<void> {
    const id = this.worksheetId;
    if (!id || this.isPdfReportDownloading) return;
    this.isPdfReportDownloading = true;
    this.cdr.markForCheck();
    try {
      // Build report data and set it for the template
      this.reportData = this.buildWorksheetReportData();
      this.cdr.markForCheck();

      // Wait for Angular to render the template
      await new Promise(resolve => setTimeout(resolve, 100));

      const element = document.getElementById('report-pdf-container');
      if (!element) {
        throw new Error('PDF container not found');
      }

      // Make visible for html2canvas capture while keeping off-screen
      element.style.visibility = 'visible';

      // Wait for fonts and layout to settle
      try {
        if ((document as any).fonts?.ready) {
          await (document as any).fonts.ready;
        }
      } catch {
        /* font API unavailable – ignore */
      }
      await new Promise(resolve => setTimeout(resolve, 300));

      // Dynamic import html2canvas and jsPDF (same pattern as pdf-export.util.ts)
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const html2canvas = html2canvasModule.default;
      const { jsPDF } = jsPDFModule;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc: Document) => {
          const all = clonedDoc.querySelectorAll<HTMLElement>('*');
          all.forEach((el) => {
            const s = el.style as any;
            s.webkitPrintColorAdjust = 'exact';
            s.printColorAdjust = 'exact';
            s.colorAdjust = 'exact';
          });
        },
      });

      // Hide again after capture
      element.style.visibility = 'hidden';

      // Create PDF using jsPDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: 'a4',
        hotfixes: ['px_scaling']
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      const imgData = canvas.toDataURL('image/png');

      let position = 0;
      let remaining = imgHeight;
      let pageIndex = 0;

      while (remaining > 0) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
        position += pdfHeight;
        remaining -= pdfHeight;
        pageIndex++;
      }

      // Download via Blob for cross-platform support (iOS/Android/desktop)
      const blob = pdf.output('blob');
      triggerBlobDownload(blob, {
        filename: 'worksheet-report.pdf',
        mimeType: 'application/pdf',
      });

    } catch (err: any) {
      this.errorModal = { open: true, title: 'PDF Failed', message: err?.error?.message ?? err?.message ?? 'Please try again.' };
      this.cdr.markForCheck();
    } finally {
      this.isPdfReportDownloading = false;
      this.cdr.markForCheck();
    }
  }

  // Safe percentage utility - clamps value between 0-100
  private safePercent(value: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(value || 0)));
    return clamped;
  }

  private buildWorksheetReportData(): WorksheetReportData {
    if (!this.worksheet || !this.analytics) {
      throw new Error('Worksheet or analytics data not loaded');
    }

    const stats = this.analytics.overview || this.overview || {};
    const scoreBands = this.analytics.scoreBands || this.scoreBands || {};
    const sectionStats = this.analytics.sectionStats || [];

    // Transform section stats to SectionPerformance format
    const sections: any[] = sectionStats.map((stat: any) => ({
      id: stat.sectionId,
      title: this.getSectionTitle(stat.sectionId),
      type: this.getSectionType(stat.sectionId),
      score: this.safePercent(stat.correctRate || 0),
      completion: this.safePercent(stat.completionRate || 0),
      avgTime: stat.avgTimeSpent || 0,
      questionCount: stat.totalQuestions || 0,
      correct: stat.correctCount || 0,
      incorrect: stat.incorrectCount || 0,
      skipped: stat.skippedCount || 0,
      mostMissed: (stat.mostMissedQuestions || []).map((q: any) => q.name || q.id).slice(0, 3),
    }));

    // Transform submissions to StudentResult format
    const students: any[] = this.submissions.map((sub: any) => {
      const answers = sub.answers || [];
      const sectionScores = this.calculateSectionScores(answers, sectionStats);
      
      return {
        name: this.getStudentName(sub),
        score: Math.round(sub.percentage || 0),
        time: sub.timeTaken || 0,
        date: sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
        status: sub.isLate ? 'Late' : 'On Time',
        dragDropScore: sectionScores['activity1'] || 0,
        classificationScore: sectionScores['activity2'] || 0,
        multipleChoiceScore: sectionScores['activity3'] || 0,
        fillBlanksScore: sectionScores['activity4'] || 0,
        matchingScore: sectionScores['activity5'] || 0,
      };
    });

    // Build hardest and easiest questions
    const hardestQuestions: any[] = this.buildQuestionInsights(sectionStats, 'hardest');
    const easiestQuestions: any[] = this.buildQuestionInsights(sectionStats, 'easiest');

    // Build weak sections
    const weakSections: any[] = sections
      .filter((s: any) => s.score < 70)
      .map((s: any) => ({ name: s.title, score: s.score }))
      .sort((a: any, b: any) => a.score - b.score)
      .slice(0, 3);

    return {
      worksheetTitle: this.worksheet.title || 'Untitled Worksheet',
      subject: this.worksheet.subject || 'N/A',
      cefrLevel: this.worksheet.cefrLevel || 'N/A',
      gradeLevel: this.worksheet.gradeLevel || 'N/A',
      difficulty: this.worksheet.difficulty || 'N/A',
      theme: (this.worksheet.theme as unknown as string) || 'Default',
      activities: sections.length,
      stats: {
        totalAssigned: stats.totalAssigned || 0,
        submitted: stats.submitted || this.submissions.length,
        pending: stats.pending || 0,
        late: stats.late || 0,
        completionRate: this.safePercent(stats.completionRate || 0),
        avgScore: this.safePercent(stats.avgScore || this.averageScore),
        medianScore: this.safePercent(stats.medianScore || 0),
        passRate: this.safePercent(stats.passRate || 0),
        avgTime: stats.avgTime || this.averageTime,
      },
      scoreDistribution: {
        '90-100': scoreBands['90-100'] || 0,
        '80-89': scoreBands['80-89'] || 0,
        '70-79': scoreBands['70-79'] || 0,
        'below70': scoreBands['below70'] || 0,
      },
      teacherInsights: this.teacherInsights || [],
      sections,
      students,
      hardestQuestions,
      easiestQuestions,
      weakSections,
    };
  }

  private getSectionTitle(sectionId: string): string {
    const activityMap: Record<string, string> = {
      activity1: this.worksheet?.activity1?.title || 'Drag & Drop',
      activity2: this.worksheet?.activity2?.title || 'Classification',
      activity3: this.worksheet?.activity3?.title || 'Multiple Choice',
      activity4: this.worksheet?.activity4?.title || 'Fill in Blanks',
      activity5: this.worksheet?.activity5?.title || 'Matching Pairs',
      activity6: this.worksheet?.activity6?.title || 'True/False',
      activity7: this.worksheet?.activity7?.title || 'Image Label',
      activity8: this.worksheet?.activity8?.title || 'Enhanced Sequencing',
    };
    return activityMap[sectionId] || sectionId;
  }

  private getActivityLabel(sectionId: string): string {
    const labelMap: Record<string, string> = {
      activity1: 'Drag & Drop',
      activity2: 'Classification',
      activity3: 'Multiple Choice',
      activity4: 'Fill in Blanks',
      activity5: 'Matching Pairs',
      activity6: 'True/False',
      activity7: 'Image Label',
      activity8: 'Enhanced Sequencing',
    };
    return labelMap[sectionId] || sectionId;
  }

  private getSectionType(sectionId: string): string {
    const typeMap: Record<string, string> = {
      activity1: 'Ordering',
      activity2: 'Classification',
      activity3: 'Multiple Choice',
      activity4: 'Fill in Blanks',
      activity5: 'Matching',
      activity6: 'True/False',
    };
    return typeMap[sectionId] || 'Activity';
  }

  private calculateSectionScores(answers: any[], sectionStats: any[]): Record<string, number> {
    const scores: Record<string, number> = {};

    sectionStats.forEach((stat: any) => {
      const sectionAnswers = answers.filter((a: any) => a.sectionId === stat.sectionId);
      if (sectionAnswers.length > 0) {
        const correct = sectionAnswers.filter((a: any) => a.isCorrect).length;
        const score = this.safePercent((correct / sectionAnswers.length) * 100);
        scores[stat.sectionId] = score;
      } else {
        scores[stat.sectionId] = 0;
      }
    });

    return scores;
  }

  private buildQuestionInsights(sectionStats: any[], type: 'hardest' | 'easiest'): any[] {
    const allQuestions: any[] = [];

    sectionStats.forEach((stat: any) => {
      if (stat.mostMissedQuestions && Array.isArray(stat.mostMissedQuestions)) {
        stat.mostMissedQuestions.forEach((q: any, idx: number) => {
          // Use question name/id with fallback to "Question [N]"
          const qName = q.name || q.id || `Question ${idx + 1}`;
          allQuestions.push({
            name: qName,
            correctPct: this.safePercent(q.correctRate || 0),
          });
        });
      }
    });

    if (type === 'hardest') {
      return allQuestions.sort((a, b) => a.correctPct - b.correctPct).slice(0, 5);
    } else {
      return allQuestions.sort((a, b) => b.correctPct - a.correctPct).slice(0, 5);
    }
  }

  async downloadStudentPdf(sub: WorksheetSubmission): Promise<void> {
    const submissionId = sub._id;
    if (!submissionId || this.downloadingSubmissionId === submissionId) return;
    if (!this.worksheet) {
      this.errorModal = { open: true, title: 'Not Ready', message: 'Please wait for the worksheet to finish loading.' };
      this.cdr.markForCheck();
      return;
    }
    this.downloadingSubmissionId = submissionId;
    this.cdr.markForCheck();
    try {
      const studentName = this.getStudentName(sub);
      const safeName = studentName.replace(/\s+/g, '-').toLowerCase();
      const safeTitle = (this.worksheet.title ?? 'worksheet').replace(/\s+/g, '-').toLowerCase();
      const dateStr = sub.submittedAt
        ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : '';

      await this.pdfRenderer.renderViewerOffscreen(
        {
          worksheet: this.worksheet,
          worksheetId: sub.worksheetId,
          studentName,
          date: dateStr,
          submittedAnswers: (sub.answers as any[]) ?? [],
          totalPointsEarned: sub.totalPointsEarned,
          totalPointsPossible: sub.totalPointsPossible,
          percentage: sub.percentage,
          timeTaken: sub.timeTaken,
        },
        `${safeName}_${safeTitle}.pdf`,
      );
    } catch (err: any) {
      this.errorModal = { open: true, title: 'PDF Failed', message: err?.error?.message ?? err?.message ?? 'Please try again.' };
      this.cdr.markForCheck();
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

  private mapTeacherInsights(insights: string[]): string[] {
    return insights.map(insight => {
      // Replace activity keys with readable names
      for (const [key, label] of Object.entries({
        activity1: 'Drag & Drop',
        activity2: 'Classification',
        activity3: 'Multiple Choice',
        activity4: 'Fill in Blanks',
        activity5: 'Matching Pairs',
        activity6: 'True/False',
        activity7: 'Image Label',
        activity8: 'Enhanced Sequencing',
      })) {
        // Match patterns like "activity1", "activity1 (", "with activity1", etc.
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        insight = insight.replace(regex, label);
      }
      return insight;
    });
  }

  /** Open share modal, generating a token if not already set */
  openShareModal(): void {
    this.showShareModal = true;
    this.shareLoading   = true;
    this.cdr.markForCheck();
    this.api.shareSet(this.worksheetId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.shareUrl     = res.shareUrl;
        this.shareLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.shareLoading = false;
        this.showShareModal = false;
        this.errorModal = { open: true, title: 'Share Failed', message: 'Could not generate share link. Please try again.' };
        this.cdr.markForCheck();
      },
    });
  }

  /** Copy share URL to clipboard */
  copyUrl(): void {
    if (!this.shareUrl) return;
    navigator.clipboard.writeText(this.shareUrl).then(() => {
      this.shareCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.shareCopied = false; this.cdr.markForCheck(); }, 2000);
    });
  }

  /** Revoke the share link and close modal */
  revokeShare(): void {
    this.shareLoading = true;
    this.cdr.markForCheck();
    this.api.revokeShare(this.worksheetId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.shareUrl     = null;
        this.shareLoading = false;
        this.showShareModal = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.shareLoading = false;
        this.errorModal = { open: true, title: 'Revoke Failed', message: 'Could not revoke share link. Please try again.' };
        this.cdr.markForCheck();
      },
    });
  }

  /** Close share modal */
  closeShareModal(): void {
    this.showShareModal = false;
    this.shareUrl = null;
    this.shareCopied = false;
    this.cdr.markForCheck();
  }

  /** Open worksheet assign modal */
  openAssignModal(): void {
    if (!this.worksheet) return;
    this.showAssignModal = true;
    this.cdr.markForCheck();
  }

  /** Close worksheet assign modal */
  closeAssignModal(): void {
    this.showAssignModal = false;
    this.cdr.markForCheck();
  }

  /** Handle worksheet assignment success */
  onWorksheetAssigned(event: { classId: string }): void {
    this.showAssignModal = false;
    this.successModal = { open: true, title: 'Assigned!', message: 'Worksheet has been assigned to the class.' };
    this.cdr.markForCheck();
    // Redirect to class details page
    this.router.navigate(['/teachers/my-classes', event.classId]);
  }

  trackById(_: number, item: { _id?: string }): string { return item._id ?? String(_); }
}
