import { Component, EventEmitter, inject, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';
import { RubricForm } from './rubric-form/rubric-form';
import { DeviceService } from '../../../../../services/device.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { CommonModule } from '@angular/common';
import { DialogViewSubmissions } from '../dialog-view-submissions/dialog-view-submissions';
import { BottomsheetDialog } from '../../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { EssayImages } from '../../../../../components/teacher/essay-images/essay-images';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { FeedbackApiService, type BackendFeedback } from '../../../../../api/feedback-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { ClassApiService } from '../../../../../api/class-api.service';

@Component({
  selector: 'app-student-submission-pages',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ModalDialog,
    RubricForm,
    AppBarBackButton,
    DialogViewSubmissions,
    BottomsheetDialog,
    EssayImages
  ],
  templateUrl: './student-submission-pages.html',
  styleUrl: './student-submission-pages.css',
})
export class StudentSubmissionPages {

  showDialog = false;
  openSheetSubmission = false;
  @Output() closed = new EventEmitter<void>();
  isUploadedFile = true;
  device = inject(DeviceService);
  activeTab = 'uploaded-file';

  private route = inject(ActivatedRoute);
  private submissionApi = inject(SubmissionApiService);
  private feedbackApi = inject(FeedbackApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);

  assignmentId: string | null = null;
  submissionId: string | null = null;
  studentId: string | null = null;

  classTitle: string = '';

  selectedAssignmentId: string | null = null;

  isLoading = false;

  submissions: BackendSubmission[] = [];
  currentSubmission: BackendSubmission | null = null;
  currentFeedback: BackendFeedback | null = null;

  essayImageUrl: string | null = null;

  get studentName(): string {
    const s: any = this.currentSubmission && (this.currentSubmission as any).student;
    if (!s) return '';
    if (typeof s === 'string') return '';
    return s.displayName || s.email || '';
  }

  get studentDisplayId(): string {
    const s: any = this.currentSubmission && (this.currentSubmission as any).student;
    const id = typeof s === 'string' ? s : s && (s._id || s.id);
    return id ? String(id) : '';
  }

  feedbackForm: FormGroup;

  get feedbacks(): Array<{ category: string; score: number; maxScore: number; description: string }> {
    const fb: any = this.currentFeedback;
    if (!fb) return [];

    const scoreRaw = fb.score;
    const maxScoreRaw = fb.maxScore;
    const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : 0;
    const maxScore = Number.isFinite(Number(maxScoreRaw)) ? Number(maxScoreRaw) : 0;
    const description = (fb.textFeedback || '').toString();

    return [
      {
        category: 'Overall Rubric Score',
        score,
        maxScore,
        description
      }
    ];
  }


  constructor(private router: Router, fb: FormBuilder) {
    this.feedbackForm = fb.group({
      message: ['']
    });
  }

  async ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('studentId');
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId');
    this.submissionId = this.route.snapshot.queryParamMap.get('submissionId');
    this.selectedAssignmentId = this.assignmentId;

    await this.loadClassTitle();

    await this.loadSubmissions();
    await this.loadFeedback();
  }

  private async loadClassTitle() {
    const classId = this.route.snapshot.queryParamMap.get('classId');
    if (!classId) {
      this.classTitle = '';
      return;
    }

    try {
      const summary = await this.classApi.getClassSummary(classId);
      this.classTitle = summary?.name || '';
    } catch {
      this.classTitle = '';
    }
  }

  private isProbablyImageUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    const lowered = url.toLowerCase();
    return lowered.endsWith('.png') || lowered.endsWith('.jpg') || lowered.endsWith('.jpeg');
  }

  private async loadSubmissions() {
    const assignmentId = this.assignmentId;
    if (!assignmentId) return;
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const list = await this.submissionApi.getSubmissionsByAssignment(assignmentId);
      this.submissions = list || [];

      const submissionId = this.submissionId;
      this.currentSubmission = submissionId
        ? this.submissions.find((s) => s._id === submissionId) || null
        : this.submissions[0] || null;

      const url = this.currentSubmission?.fileUrl || null;
      this.essayImageUrl = this.isProbablyImageUrl(url) ? url : null;
    } catch (err: any) {
      this.alert.showError('Failed to load submissions', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  private async loadFeedback() {
    const feedbackId = this.currentSubmission && (this.currentSubmission as any).feedback;
    if (!feedbackId || typeof feedbackId !== 'string') return;

    try {
      const fb = await this.feedbackApi.getFeedbackByIdForTeacher(feedbackId);
      this.currentFeedback = fb;
      this.feedbackForm.patchValue({
        message: fb?.textFeedback || ''
      });
    } catch (err: any) {
      // ignore if not found
    }
  }

  async submitFeedback() {
    const submission = this.currentSubmission;
    if (!submission) {
      this.alert.showWarning('No submission', 'Please select a submission first.');
      return;
    }

    const textFeedback = this.feedbackForm.value.message;

    try {
      const existingFeedbackId = submission && (submission as any).feedback;
      if (existingFeedbackId && typeof existingFeedbackId === 'string') {
        const updated = await this.feedbackApi.updateFeedback({
          feedbackId: existingFeedbackId,
          textFeedback
        });
        this.currentFeedback = updated;
      } else {
        const created = await this.feedbackApi.createFeedback({
          submissionId: submission._id,
          textFeedback
        });
        this.currentFeedback = created;
      }

      this.alert.showToast('Feedback saved', 'success');
    } catch (err: any) {
      this.alert.showError('Failed to save feedback', err?.error?.message || err?.message || 'Please try again');
    }
  }

  toBack() {
    const classId = this.route.snapshot.queryParamMap.get('classId');
    if (!this.studentId) {
      if (classId) {
        this.router.navigate(['/teacher/my-classes/detail', classId]);
        return;
      }
      this.router.navigate(['/teacher/my-classes']);
      return;
    }

    this.router.navigate(['/teacher/my-classes/detail/student-profile', this.studentId], {
      queryParams: {
        classId: classId || undefined
      }
    });
  }

  onEditRubric() {
    this.showDialog = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  onTabSelected(param: string) {
    this.activeTab = param;
  }

  onCloseSubmission() {
    this.openSheetSubmission = false;
  }
}
