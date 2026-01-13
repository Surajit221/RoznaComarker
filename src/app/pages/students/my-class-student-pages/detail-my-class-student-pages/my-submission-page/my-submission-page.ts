import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { CommonModule } from '@angular/common';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { FeedbackApiService, type BackendFeedback } from '../../../../../api/feedback-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { ClassApiService } from '../../../../../api/class-api.service';

@Component({
  selector: 'app-my-submission-page',
  imports: [CommonModule, ReactiveFormsModule, AppBarBackButton],
  templateUrl: './my-submission-page.html',
  styleUrl: './my-submission-page.css',
})
export class MySubmissionPage {
  isUploadedFile = false;
  device = inject(DeviceService);
  activeTab = 'uploaded-file';

  private route = inject(ActivatedRoute);
  private submissionApi = inject(SubmissionApiService);
  private feedbackApi = inject(FeedbackApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);

  assignmentId: string | null = null;
  classId: string | null = null;

  classTitle: string = '';

  isLoading = false;
  submission: BackendSubmission | null = null;
  feedback: BackendFeedback | null = null;

  uploadedFileUrl: string | null = null;
  teacherComment: string | null = null;

  feedbackForm: FormGroup;

  get feedbacks(): Array<{ category: string; score: number; maxScore: number; description: string }> {
    const fb: any = this.feedback;
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
    this.assignmentId = this.route.snapshot.paramMap.get('slug');
    this.classId = this.route.snapshot.queryParamMap.get('classId');

    await this.loadClassTitle();

    await this.load();
  }

  private async loadClassTitle() {
    const classId = this.classId;
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

  private async load() {
    const assignmentId = this.assignmentId;
    if (!assignmentId) return;
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      let submission: BackendSubmission | null = null;
      try {
        submission = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId);
      } catch (e: any) {
        const mine = await this.submissionApi.getMySubmissions();
        const match = (mine || []).find((s) => {
          const a: any = s && (s as any).assignment;
          return typeof a === 'string' ? a === assignmentId : a && a._id === assignmentId;
        });
        submission = match || null;
      }

      this.submission = submission;
      this.uploadedFileUrl = submission?.fileUrl || null;

      if (submission && (submission as any).feedback) {
        const submissionId = submission._id;
        const fb = await this.feedbackApi.getFeedbackBySubmissionForStudent(submissionId);
        this.feedback = fb;
        this.teacherComment = fb?.textFeedback || null;

        this.feedbackForm.patchValue({
          message: this.teacherComment || ''
        });
      }
    } catch (err: any) {
      this.alert.showError('Failed to load submission', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  toBack() {
    if (this.classId) {
      this.router.navigate(['/student/my-classes/detail', this.classId]);
      return;
    }

    this.router.navigate(['/student/my-classes']);
  }

  onTabSelected(param: string) {
    this.activeTab = param;
  }
}
