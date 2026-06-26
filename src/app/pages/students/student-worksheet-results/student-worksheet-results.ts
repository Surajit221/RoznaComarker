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
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetSubmission,
} from '../../../api/worksheet-api.service';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { WorksheetViewerComponent } from '../../../components/worksheet-viewer/worksheet-viewer';
import { WorksheetPdfRenderService } from '../../../components/worksheet-pdf-template/worksheet-pdf-render.service';
import { AlertService } from '../../../services/alert.service';
import { AuthService } from '../../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { OverlayPdfService } from '../../../services/overlay-pdf.service';

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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly api = inject(WorksheetApiService);
  private readonly assignmentApi = inject(AssignmentApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly pdfRenderer = inject(WorksheetPdfRenderService);
  private readonly alert = inject(AlertService);
  private readonly auth = inject(AuthService);
  private readonly overlayPdfService = inject(OverlayPdfService);

  submission: WorksheetSubmission | null = null;
  worksheetTitle = '';
  classId = '';
  assignmentId = '';
  hasState = false;

  worksheet: Worksheet | null = null;
  isWorksheetLoading = false;
  isPdfDownloading = false;
  resolvedStudentName = '';
  assignmentDeadline: Date | null = null;
  className = '';
  assignmentTitle = '';

  // Section-wise analytics
  sectionAnalytics: any[] = [];
  showSectionDetails = false;

  // Display score (computed for overlay worksheets)
  displayScore = 0;
  displayTotal = 0;
  displayPercentage = 0;

  get percentage(): number {
    // For overlay worksheets, use computed display score
    if (this.worksheet?.activity9) {
      return this.displayPercentage;
    }
    return this.submission?.score ?? 0;
  }

  get scoreLabel(): string {
    const p = this.percentage;
    const isPassed = this.submission?.isPassed ?? false;
    if (isPassed) return '🎉 Great job!';
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
      return new Date().toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });
    }
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  /** Convert submission.answers to the format expected by WorksheetViewerComponent */
  get normalizedAnswers(): Array<{
    questionId: string;
    sectionId: string;
    studentAnswer: string;
    isCorrect?: boolean;
  }> | null {
    if (!this.submission?.answers) return null;
    const answers = this.submission.answers;
    if (Array.isArray(answers)) {
      return answers as Array<{
        questionId: string;
        sectionId: string;
        studentAnswer: string;
        isCorrect?: boolean;
      }>;
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
    const nav = this.router.getCurrentNavigation();
    const state = (nav?.extras?.state ??
      (typeof history !== 'undefined' ? history.state : {})) as Partial<ResultState>;

    if (state?.submission) {
      // Normal navigation: state was passed by the class detail page
      this.submission = state.submission;
      this.worksheetTitle = state.worksheetTitle ?? '';
      this.classId = state.classId ?? '';
      this.assignmentId = state.assignmentId ?? '';
      this.hasState = true;
      this.resolveStudentNameAndWorksheet();
    } else {
      // Hard-refresh / direct URL: fall back to query params and re-fetch from API
      const qp = this.route.snapshot.queryParamMap;
      const worksheetId = qp.get('worksheetId') ?? '';
      const assignmentId = qp.get('assignmentId') ?? '';
      const classId = qp.get('classId') ?? '';

      if (!worksheetId || !assignmentId) {
        this.router.navigate(['/student/my-classes']);
        return;
      }

      this.classId = classId;
      this.assignmentId = assignmentId;
      this.isWorksheetLoading = true;
      this.cdr.markForCheck();

      // Fetch submission, worksheet, and assignment deadline in parallel
      Promise.all([
        this.api.getMySubmissionByAssignment(worksheetId, assignmentId),
        this.api
          .getById(worksheetId)
          .toPromise()
          .catch(() => null),
        this.assignmentApi.getAssignmentById(assignmentId).catch(() => null),
      ])
        .then(([sub, wsRes, assignmentRes]: [any, any, any]) => {
          if (!sub) {
            // No submission found — send student back to play the worksheet
            this.router.navigate(['/student/worksheet', worksheetId], {
              queryParams: { assignmentId, classId: classId || undefined },
            });
            return;
          }
          this.submission = sub;
          this.worksheetTitle = sub.worksheet?.title ?? '';
          this.worksheet = wsRes?.data ?? wsRes ?? null;
          this.assignmentDeadline = assignmentRes?.deadline
            ? new Date(assignmentRes.deadline)
            : null;
          this.className = (assignmentRes as any)?.className || '';
          this.assignmentTitle = assignmentRes?.title ?? '';
          this.hasState = true;
          this.isWorksheetLoading = false;

          // For overlay worksheets, compute score from activity9 data
          if (this.worksheet?.activity9 && this.submission) {
            const results = this.submission.activity9Results || {};
            const fields = this.worksheet.activity9.fields || [];
            let correctCount = 0;
            for (const field of fields) {
              if (results[field.id] === true) correctCount++;
            }
            this.displayScore = correctCount;
            this.displayTotal = fields.length;
            this.displayPercentage = fields.length > 0
              ? Math.round((correctCount / fields.length) * 100)
              : 0;

            // If submission has no activity9 results, try fetching from draft
            if (Object.keys(results).length === 0 && assignmentId) {
              this.http.get<any>(
                `${environment.apiUrl}/api/worksheets/${sub.worksheetId}/draft?assignmentId=${assignmentId}`
              ).subscribe({
                next: (draft: any) => {
                  if (draft?.activity9Results) {
                    const draftResults = draft.activity9Results || {};
                    let draftCorrectCount = 0;
                    for (const field of fields) {
                      if (draftResults[field.id] === true) draftCorrectCount++;
                    }
                    this.displayScore = draftCorrectCount;
                    this.displayTotal = fields.length;
                    this.displayPercentage = fields.length > 0
                      ? Math.round((draftCorrectCount / fields.length) * 100)
                      : 0;
                    this.cdr.markForCheck();
                  }
                },
                error: () => {
                  // Ignore draft fetch errors
                }
              });
            }
          }

          this.calculateSectionAnalytics();
          this.cdr.markForCheck();
          this.auth
            .getMeProfile()
            .then((me) => {
              this.resolvedStudentName = me?.displayName || me?.email || '';
              this.cdr.markForCheck();
            })
            .catch(() => {});
        })
        .catch(() => {
          this.isWorksheetLoading = false;
          this.router.navigate(['/student/my-classes']);
        });
    }
  }

  private resolveStudentNameAndWorksheet(): void {
    this.auth
      .getMeProfile()
      .then((me) => {
        this.resolvedStudentName = me?.displayName || me?.email || '';
        this.cdr.markForCheck();
      })
      .catch(() => {});

    if (this.submission?.worksheetId) {
      this.isWorksheetLoading = true;

      // Fetch worksheet and assignment deadline in parallel
      const worksheetFetch = this.api.getById(this.submission.worksheetId).toPromise();
      const assignmentFetch = this.assignmentId
        ? this.assignmentApi.getAssignmentById(this.assignmentId).catch(() => null)
        : Promise.resolve(null);

      Promise.all([worksheetFetch, assignmentFetch])
        .then(([wsRes, assignmentRes]: [any, any]) => {
          this.worksheet = wsRes?.data ?? wsRes ?? null;
          this.assignmentDeadline = assignmentRes?.deadline
            ? new Date(assignmentRes.deadline)
            : null;
          this.className = (assignmentRes as any)?.className || '';
          this.assignmentTitle = assignmentRes?.title ?? '';

          // For overlay worksheets, compute score from activity9 data
          if (this.worksheet?.activity9 && this.submission) {
            const results = this.submission.activity9Results || {};
            const fields = this.worksheet.activity9.fields || [];
            let correctCount = 0;
            for (const field of fields) {
              if (results[field.id] === true) correctCount++;
            }
            this.displayScore = correctCount;
            this.displayTotal = fields.length;
            this.displayPercentage = fields.length > 0
              ? Math.round((correctCount / fields.length) * 100)
              : 0;

            // If submission has no activity9 results, try fetching from draft
            if (Object.keys(results).length === 0 && this.assignmentId) {
              this.http.get<any>(
                `${environment.apiUrl}/api/worksheets/${this.submission.worksheetId}/draft?assignmentId=${this.assignmentId}`
              ).subscribe({
                next: (draft: any) => {
                  if (draft?.activity9Results) {
                    const draftResults = draft.activity9Results || {};
                    let draftCorrectCount = 0;
                    for (const field of fields) {
                      if (draftResults[field.id] === true) draftCorrectCount++;
                    }
                    this.displayScore = draftCorrectCount;
                    this.displayTotal = fields.length;
                    this.displayPercentage = fields.length > 0
                      ? Math.round((draftCorrectCount / fields.length) * 100)
                      : 0;
                    this.cdr.markForCheck();
                  }
                },
                error: () => {
                  // Ignore draft fetch errors
                }
              });
            }
          }

          this.calculateSectionAnalytics();
          this.isWorksheetLoading = false;
          this.cdr.markForCheck();
        })
        .catch(() => {
          // If worksheet fetch fails, try worksheet alone
          this.api.getById(this.submission!.worksheetId).subscribe({
            next: (res: any) => {
              this.worksheet = res?.data ?? res ?? null;

              // For overlay worksheets, compute score from activity9 data
              if (this.worksheet?.activity9 && this.submission) {
                const results = this.submission.activity9Results || {};
                const fields = this.worksheet.activity9.fields || [];
                let correctCount = 0;
                for (const field of fields) {
                  if (results[field.id] === true) correctCount++;
                }
                this.displayScore = correctCount;
                this.displayTotal = fields.length;
                this.displayPercentage = fields.length > 0
                  ? Math.round((correctCount / fields.length) * 100)
                  : 0;

                // If submission has no activity9 results, try fetching from draft
                if (Object.keys(results).length === 0 && this.assignmentId) {
                  this.http.get<any>(
                    `${environment.apiUrl}/api/worksheets/${this.submission.worksheetId}/draft?assignmentId=${this.assignmentId}`
                  ).subscribe({
                    next: (draft) => {
                      if (draft?.activity9Results) {
                        const draftResults = draft.activity9Results || {};
                        let draftCorrectCount = 0;
                        for (const field of fields) {
                          if (draftResults[field.id] === true) draftCorrectCount++;
                        }
                        this.displayScore = draftCorrectCount;
                        this.displayTotal = fields.length;
                        this.displayPercentage = fields.length > 0
                          ? Math.round((draftCorrectCount / fields.length) * 100)
                          : 0;
                        this.cdr.markForCheck();
                      }
                    },
                    error: () => {
                      // Ignore draft fetch errors
                    }
                  });
                }
              }

              this.calculateSectionAnalytics();
              this.isWorksheetLoading = false;
              this.cdr.markForCheck();
            },
            error: () => {
              this.isWorksheetLoading = false;
              this.cdr.markForCheck();
            },
          });
        });
    }
  }

  private calculateSectionAnalytics(): void {
    if (!this.worksheet || !this.submission) return;

    // Use backend sections[] array if available (new submissions)
    if (
      this.submission.sections &&
      Array.isArray(this.submission.sections) &&
      this.submission.sections.length > 0
    ) {
      this.sectionAnalytics = this.submission.sections.map((section) => ({
        id: section.sectionId,
        title: section.sectionName,
        type: section.activityType,
        score: section.score,
        completion:
          section.totalPoints > 0
            ? Math.round(((section.totalPoints - section.skippedCount) / section.totalPoints) * 100)
            : 0,
        totalQuestions: section.totalPoints,
        correct: section.correctCount,
        incorrect: section.incorrectCount,
        skipped: section.skippedCount,
      }));
      return;
    }

    // Fallback: recalculate from answers[] for old submissions without sections[]
    const answers = (this.submission.answers as any[]) || [];
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
          trueFalse: 'True/False',
        };
        sectionMap[sectionId] = {
          title: activity.title || `Section ${index + 1}`,
          type: typeNames[activity.type] || activity.type || 'Activity',
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
      if (!answer.studentAnswer || answer.studentAnswer.trim() === '')
        sectionStats[sectionId].skipped++;
    });

    // Build analytics array
    this.sectionAnalytics = Object.entries(sectionStats).map(([sectionId, stats]) => {
      const metadata = sectionMap[sectionId] || { title: sectionId, type: 'Activity' };
      const score = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const completion =
        stats.total > 0 ? Math.round(((stats.total - stats.skipped) / stats.total) * 100) : 0;

      return {
        id: sectionId,
        title: metadata.title,
        type: metadata.type,
        score,
        completion,
        totalQuestions: stats.total,
        correct: stats.correct,
        incorrect: stats.total - stats.correct,
        skipped: stats.skipped,
      };
    });
  }

  async downloadMyPdf(): Promise<void> {
    if (this.isPdfDownloading) return;
    if (!this.worksheet || !this.submission) {
      this.alert.showWarning(
        'Worksheet not ready',
        'Please wait a moment for the worksheet to finish loading.',
      );
      return;
    }
    this.isPdfDownloading = true;
    this.cdr.markForCheck();

    try {
      const studentName = this.studentName || 'Student';
      const safeName = studentName.replace(/\s+/g, '-').toLowerCase();
      const safeTitle = (this.worksheet.title ?? 'worksheet').replace(/\s+/g, '-').toLowerCase();
      const dateStr = this.formattedDate;

      await this.pdfRenderer.renderViewerOffscreen(
        {
          worksheet: this.worksheet,
          worksheetId: this.submission.worksheetId,
          studentName,
          date: dateStr,
          submittedAnswers: (this.submission.answers as any[]) ?? [],
          totalPointsEarned: this.submission.earnedPoints ?? this.submission.totalPointsEarned ?? 0,
          totalPointsPossible:
            this.submission.totalPoints ?? this.submission.totalPointsPossible ?? 0,
          percentage: this.submission.score ?? this.submission.percentage ?? 0,
          timeTaken: this.submission.timeTaken,
        },
        `${safeName}_${safeTitle}.pdf`,
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

  async downloadPdf(): Promise<void> {
    // For activity9 overlay worksheets, use download-overlay endpoint
    if (this.worksheet?.activity9) {
      await this.downloadOverlayPdf();
    } else {
      // For regular worksheets, use the standard PDF renderer
      await this.downloadMyPdf();
    }
  }

  async downloadOverlayPdf(): Promise<void> {
    if (!this.worksheet?.activity9 || !this.submission) {
      this.alert.showWarning(
        'Overlay worksheet not available',
        'This worksheet does not have an overlay activity.',
      );
      return;
    }

    try {
      const worksheetId = this.submission.worksheetId;
      const assignmentId = this.assignmentId;

      // Get answers from submission (service will also try draft if empty)
      const answers = this.submission.activity9Answers || {};
      const results = this.submission.activity9Results || {};
      const score = this.displayScore;
      const total = this.displayTotal;

      console.log('[STUDENT PDF FRONTEND] === ANSWERS OBJECT INSPECTION ===');
      console.log('[STUDENT PDF FRONTEND] typeof answers:', typeof answers);
      console.log('[STUDENT PDF FRONTEND] answers instanceof Map:', answers instanceof Map);
      console.log('[STUDENT PDF FRONTEND] Object.keys(answers):', Object.keys(answers));
      console.log('[STUDENT PDF FRONTEND] answers count:', Object.keys(answers).length);
      console.log('[STUDENT PDF FRONTEND] full answers object:', JSON.stringify(answers, null, 2));
      console.log('[STUDENT PDF FRONTEND] score:', score, '/', total);

      // Log field-level answer lookup
      const fields = this.worksheet.activity9?.fields || [];
      console.log('[STUDENT PDF FRONTEND] === FIELD-LEVEL ANSWER LOOKUP ===');
      console.log('[STUDENT PDF FRONTEND] total fields:', fields.length);
      fields.forEach(field => {
        console.log('[STUDENT PDF FRONTEND] field lookup:', {
          fieldId: field.id,
          answer: answers?.[field.id],
          hasAnswer: field.id in answers,
          answerType: typeof answers?.[field.id]
        });
      });

      await this.overlayPdfService.downloadOverlayPdf({
        worksheetId,
        assignmentId,
        answers,
        results,
        score,
        total,
        studentName: this.studentName || 'Student',
        subject: (this.worksheet as any)?.meta?.subject || (this.worksheet as any)?.subject || '',
        grade: (this.worksheet as any)?.meta?.gradeLevel || (this.worksheet as any)?.gradeLevel || '',
        className: this.className || '',
        assignmentTitle: this.assignmentTitle || '',
        dueDate: this.assignmentDeadline ? this.assignmentDeadline.toLocaleDateString() : '',
      });
    } catch (error) {
      console.error('[DOWNLOAD OVERLAY PDF] Error:', error);
      this.alert.showError(
        'Failed to generate PDF',
        'Please try again later.',
      );
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
