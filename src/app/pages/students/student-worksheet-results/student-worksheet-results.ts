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
import { Router } from '@angular/router';
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

    if (!state?.submission) {
      this.router.navigate(['/student/my-classes']);
      return;
    }

    this.submission     = state.submission;
    this.worksheetTitle = state.worksheetTitle  ?? '';
    this.classId        = state.classId         ?? '';
    this.assignmentId   = state.assignmentId    ?? '';
    this.hasState       = true;

    this.auth.getMeProfile().then(me => {
      this.resolvedStudentName = me?.displayName || me?.email || '';
      this.cdr.markForCheck();
    }).catch(() => { /* ignore — studentName getter has fallbacks */ });

    if (this.submission.worksheetId) {
      this.isWorksheetLoading = true;
      this.api.getById(this.submission.worksheetId).subscribe({
        next: (res: any) => {
          this.worksheet = res?.data ?? res ?? null;
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
