/**
 * StudentWorksheetResults
 * Route: /student/worksheet-results
 *
 * Reads the graded WorksheetSubmission from router state (passed by the class
 * detail page) and renders:
 *   1. Score summary card
 *   2. "Download My Worksheet PDF" button
 *   3. Full worksheet UI (WorksheetViewerComponent) in reviewMode with student
 *      answers highlighted vs. correct answers
 *   4. Back to My Classes button
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetSubmission,
} from '../../../api/worksheet-api.service';
import { WorksheetViewerComponent } from '../../../components/worksheet-viewer/worksheet-viewer';
import { WorksheetPdfRenderService } from '../../../components/worksheet-pdf-template/worksheet-pdf-render.service';
import { AlertService } from '../../../services/alert.service';
import { AuthService } from '../../../auth/auth.service';

interface ResultState {
  submission: WorksheetSubmission;
  worksheetTitle: string;
  classId: string;
  assignmentId: string;
}

@Component({
  selector: 'app-student-worksheet-results',
  standalone: true,
  imports: [CommonModule, WorksheetViewerComponent],
  templateUrl: './student-worksheet-results.html',
  styleUrl: './student-worksheet-results.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentWorksheetResultsPage implements OnInit {
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly api         = inject(WorksheetApiService);
  private readonly cdr         = inject(ChangeDetectorRef);
  private readonly pdfRenderer = inject(WorksheetPdfRenderService);
  private readonly alert       = inject(AlertService);
  private readonly auth        = inject(AuthService);

  @ViewChild('reviewViewer', { read: ElementRef }) reviewViewerEl!: ElementRef;

  submission: WorksheetSubmission | null = null;
  worksheetTitle = '';
  classId        = '';
  assignmentId   = '';
  hasState       = false;

  worksheet: Worksheet | null = null;
  isWorksheetLoading = false;
  isPdfDownloading   = false;
  resolvedStudentName = '';

  // Section-wise analytics
  sectionAnalytics: any[] = [];
  showSectionDetails = false;

  get percentage(): number {
    return this.submission?.percentage ?? 0;
  }

  get scoreLabel(): string {
    const p = this.percentage;
    if (p >= 90) return '🌟 Excellent!';
    if (p >= 70) return '👍 Good job!';
    if (p >= 50) return '📖 Keep practising';
    return '💪 You can do it!';
  }

  get formattedTime(): string {
    const t = this.submission?.timeTaken ?? 0;
    const m = Math.floor(t / 60);
    const s = t % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }

  get formattedDate(): string {
    const iso = this.submission?.submittedAt;
    if (!iso) {
      return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return '';
    }
  }

  /** Convert submission.answers to the format expected by WorksheetViewerComponent */
  get normalizedAnswers(): Array<{ questionId: string; sectionId: string; studentAnswer: string; isCorrect?: boolean }> | null {
    if (!this.submission?.answers) return null;
    const answers = this.submission.answers;
    if (Array.isArray(answers)) {
      return answers as Array<{ questionId: string; sectionId: string; studentAnswer: string; isCorrect?: boolean }>;
    }
    // If it's a Record, convert it to array format or return null
    return null;
  }

  get studentName(): string {
    if (this.resolvedStudentName) return this.resolvedStudentName;
    const s: any = this.submission?.studentId;
    if (s && typeof s === 'object') {
      return s.displayName ?? s.email ?? '';
    }
    return '';
  }

  ngOnInit(): void {
    const nav   = this.router.getCurrentNavigation();
    const state = (
      nav?.extras?.state ?? (typeof history !== 'undefined' ? history.state : {})
    ) as Partial<ResultState>;

    if (state?.submission) {
      // Normal navigation: state was passed by the class detail page
      this.submission     = state.submission;
      this.worksheetTitle = state.worksheetTitle ?? '';
      this.classId        = state.classId        ?? '';
      this.assignmentId   = state.assignmentId   ?? '';
      this.hasState       = true;
      this.resolveStudentNameAndWorksheet();
    } else {
      // Hard-refresh / direct URL: fall back to query params and re-fetch from API
      const qp = this.route.snapshot.queryParamMap;
      const worksheetId  = qp.get('worksheetId')  ?? '';
      const assignmentId = qp.get('assignmentId') ?? '';
      const classId      = qp.get('classId')       ?? '';

      if (!worksheetId || !assignmentId) {
        this.router.navigate(['/student/my-classes']);
        return;
      }

      this.classId      = classId;
      this.assignmentId = assignmentId;
      this.isWorksheetLoading = true;
      this.cdr.markForCheck();

      // Fetch submission and worksheet in parallel
      Promise.all([
        this.api.getMySubmissionByAssignment(worksheetId, assignmentId),
        this.api.getById(worksheetId).toPromise().catch(() => null),
      ]).then(([sub, wsRes]: [any, any]) => {
        if (!sub) {
          // No submission found — send student back to play the worksheet
          this.router.navigate(['/student/worksheet', worksheetId], {
            queryParams: { assignmentId, classId: classId || undefined },
          });
          return;
        }
        this.submission     = sub;
        this.worksheetTitle = sub.worksheet?.title ?? '';
        this.worksheet      = wsRes?.data ?? wsRes ?? null;
        this.hasState       = true;
        this.isWorksheetLoading = false;
        this.calculateSectionAnalytics();
        this.cdr.markForCheck();
        this.auth.getMeProfile().then(me => {
          this.resolvedStudentName = me?.displayName || me?.email || '';
          this.cdr.markForCheck();
        }).catch(() => {});
      }).catch(() => {
        this.isWorksheetLoading = false;
        this.router.navigate(['/student/my-classes']);
      });
    }
  }

  private resolveStudentNameAndWorksheet(): void {
    this.auth.getMeProfile().then(me => {
      this.resolvedStudentName = me?.displayName || me?.email || '';
      this.cdr.markForCheck();
    }).catch(() => {});

    if (this.submission?.worksheetId) {
      this.isWorksheetLoading = true;
      this.api.getById(this.submission.worksheetId).subscribe({
        next: (res: any) => {
          this.worksheet = res?.data ?? res ?? null;
          this.calculateSectionAnalytics();
          this.isWorksheetLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isWorksheetLoading = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  private calculateSectionAnalytics(): void {
    if (!this.worksheet || !this.submission) return;

    const answers = this.submission.answers as any[] || [];
    const sectionMap: Record<string, { title: string; type: string }> = {};

    // Build section map from worksheet activities
    if (this.worksheet.activity1) {
      sectionMap['activity1'] = { title: this.worksheet.activity1.title, type: 'Ordering' };
    }
    if (this.worksheet.activity2) {
      sectionMap['activity2'] = { title: this.worksheet.activity2.title, type: 'Classification' };
    }
    if (this.worksheet.activity3) {
      sectionMap['activity3'] = { title: this.worksheet.activity3.title, type: 'Multiple Choice' };
    }
    if (this.worksheet.activity4) {
      sectionMap['activity4'] = { title: this.worksheet.activity4.title, type: 'Fill in Blanks' };
    }

    // Handle activities array format
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

    // Group answers by section
    const sectionStats: Record<string, { total: number; correct: number; skipped: number }> = {};
    answers.forEach((answer: any) => {
      const sectionId = answer.sectionId;
      if (!sectionStats[sectionId]) {
        sectionStats[sectionId] = { total: 0, correct: 0, skipped: 0 };
      }
      sectionStats[sectionId].total++;
      if (answer.isCorrect) sectionStats[sectionId].correct++;
      if (!answer.studentAnswer || answer.studentAnswer.trim() === '') sectionStats[sectionId].skipped++;
    });

    // Build analytics array
    this.sectionAnalytics = Object.entries(sectionStats).map(([sectionId, stats]) => {
      const metadata = sectionMap[sectionId] || { title: sectionId, type: 'Activity' };
      const score = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const completion = stats.total > 0 ? Math.round(((stats.total - stats.skipped) / stats.total) * 100) : 0;

      return {
        id: sectionId,
        title: metadata.title,
        type: metadata.type,
        score,
        completion,
        totalQuestions: stats.total,
        correct: stats.correct,
        incorrect: stats.total - stats.correct,
        skipped: stats.skipped
      };
    });
  }

  async downloadMyPdf(): Promise<void> {
    if (this.isPdfDownloading) return;
    if (!this.worksheet || !this.submission) {
      this.alert.showWarning('Worksheet not ready', 'Please wait a moment for the worksheet to finish loading.');
      return;
    }
    if (!this.reviewViewerEl?.nativeElement) {
      this.alert.showWarning('Viewer not ready', 'Please wait for the worksheet to finish rendering.');
      return;
    }
    this.isPdfDownloading = true;
    this.cdr.markForCheck();

    try {
      const studentName = this.studentName || 'Student';
      const safeName    = studentName.replace(/\s+/g, '-').toLowerCase();
      const safeTitle   = (this.worksheet.title ?? 'worksheet').replace(/\s+/g, '-').toLowerCase();
      const safeDate    = this.formattedDate.replace(/\//g, '-');

      await this.pdfRenderer.renderFromElement(
        this.reviewViewerEl.nativeElement,
        `${safeName}_${safeTitle}_${safeDate}.pdf`,
      );
    } catch (err: any) {
      this.alert.showError(
        'Failed to generate PDF',
        err?.error?.message ?? err?.message ?? 'Please try again',
      );
    } finally {
      this.isPdfDownloading = false;
      this.cdr.markForCheck();
    }
  }

  goBack(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }
}
