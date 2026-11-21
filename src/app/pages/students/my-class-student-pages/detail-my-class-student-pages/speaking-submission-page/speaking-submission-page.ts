import { CommonModule } from '@angular/common';
import { Component, type OnDestroy, type OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { AssignmentApiService } from '../../../../../api/assignment-api.service';
import { SpeakingApiService, type SpeakingLimits, type SpeakingResult, type StudentSpeakingSubmission } from '../../../../../api/speaking-api.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { AnalysisProgress, type ProcessingProgress } from '../../../../../components/analysis-progress/analysis-progress';
import { SpeakingUploadDialog, type SpeakingUploadTarget } from '../../../../../components/student/speaking-upload-dialog/speaking-upload-dialog';
import { SpeakingAudioPlayer } from '../../../../../components/speaking/speaking-audio-player/speaking-audio-player';
import { SpeakingTranscript } from '../../../../../components/speaking/speaking-transcript/speaking-transcript';
import { SpeakingResultView } from '../../../../../components/speaking/speaking-result-view/speaking-result-view';
import { SpeakingPoller, type SpeakingStatusView, studentSpeakingStatus } from '../../../../../utils/speaking-status';
import { speakingErrorMessage } from '../../../../../utils/speaking-messages';

/**
 * A student's speaking assignment (stage 7d): their recording's status from upload to result, polled every 10 seconds while it is being turned
 * into text or marked, and stopped at a final state. Fixed text only. Upload (and a new recording where the state invites one) through the
 * speaking upload dialog.
 */
@Component({
  selector: 'app-student-speaking-submission-page',
  imports: [CommonModule, AppBarBackButton, AnalysisProgress, SpeakingUploadDialog, SpeakingAudioPlayer, SpeakingTranscript, SpeakingResultView],
  templateUrl: './speaking-submission-page.html',
  styleUrl: './speaking-submission-page.css'
})
export class StudentSpeakingSubmissionPage implements OnInit, OnDestroy {
  readonly device = inject(DeviceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly assignmentApi = inject(AssignmentApiService);
  private readonly speakingApi = inject(SpeakingApiService);

  assignmentId = '';
  classId: string | null = null;
  loading = true;
  loadError: string | null = null;
  assignment: SpeakingUploadTarget | null = null;
  limits: SpeakingLimits | null = null;
  submission: StudentSpeakingSubmission | null = null;
  result: SpeakingResult | null = null;
  statusView: SpeakingStatusView | null = null;
  retrying = false;
  retryError: string | null = null;
  dialogOpen = false;
  private destroyed = false;
  private readonly poller = new SpeakingPoller(() => this.refresh());

  get title(): string { return this.assignment?.title || 'Speaking assignment'; }

  /** The status for app-analysis-progress (it announces changes politely). */
  get progress(): ProcessingProgress {
    const view = this.statusView ?? { tone: 'progress', message: 'Checking your recording…' };
    const base = { stage: 'speaking', percent: view.tone === 'done' ? 100 : 0, indeterminate: true, message: view.message };
    if (view.tone === 'progress') return { ...base, status: 'processing', completed: false, failed: false, active: true };
    if (view.tone === 'done') return { ...base, status: 'completed', completed: true, failed: false, active: false };
    if (view.tone === 'waiting') return { ...base, status: 'partial', completed: false, failed: false, active: false };
    return { ...base, status: 'failed', completed: false, failed: true, active: false };
  }

  /** Replace recording (stage 7f): while the server says it can still be replaced (not marked, before the due date) and it is not shown as marked. */
  get canReplaceRecording(): boolean { return this.submission?.canReplace === true && this.result?.state !== 'ready'; }

  get durationText(): string {
    const seconds = this.submission?.recording?.durationSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  async ngOnInit(): Promise<void> {
    this.assignmentId = this.route.snapshot.paramMap.get('assignmentId') || '';
    this.classId = this.route.snapshot.queryParamMap.get('classId');
    try {
      const assignment = await this.assignmentApi.getAssignmentById(this.assignmentId);
      this.assignment = { id: this.assignmentId, title: assignment?.title || '', instructions: assignment?.instructions?.trim() || undefined,
        deadline: assignment?.deadline || undefined };
    } catch {
      this.assignment = { id: this.assignmentId, title: '' };
    }
    try {
      const mine = await this.speakingApi.getMyStatus(this.assignmentId);
      if (this.destroyed) return;
      this.limits = mine.limits;
      this.submission = mine.submission;
    } catch (error) {
      this.loadError = speakingErrorMessage(error);
      return;
    } finally {
      this.loading = false;
    }
    if (this.submission) this.poller.start();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.poller.stop();
  }

  /** One status check; true when nothing more will change on its own. */
  private async refresh(): Promise<boolean> {
    const submission = this.submission;
    if (!submission || this.destroyed) return true;
    const result = await this.speakingApi.getResult(submission.id);
    if (this.destroyed || this.submission !== submission) return true;
    this.result = result;
    this.statusView = studentSpeakingStatus(result, submission.recording);
    if (this.statusView.final) void this.reloadStatus(submission.id);
    return this.statusView.final;
  }

  /** Once the status is final, the recording's own status is read again (whether it can still be replaced or retried). */
  private async reloadStatus(submissionId: string): Promise<void> {
    try {
      const mine = await this.speakingApi.getMyStatus(this.assignmentId);
      if (!this.destroyed && mine.submission?.id === submissionId && this.submission?.id === submissionId) {
        this.submission = mine.submission;
        if (this.result) this.statusView = studentSpeakingStatus(this.result, mine.submission.recording);
      }
    } catch {
      // The status already shown stays; the server checks again on any action.
    }
  }

  openUpload(): void { this.dialogOpen = true; }

  onUploaded(saved: StudentSpeakingSubmission): void {
    this.dialogOpen = false;
    this.submission = saved;
    this.result = null;
    this.statusView = null;
    this.retryError = null;
    this.poller.start();
  }

  async retryTranscription(): Promise<void> {
    const submission = this.submission;
    if (!submission || this.retrying) return;
    this.retrying = true;
    this.retryError = null;
    try {
      await this.speakingApi.retryTranscription(submission.id);
      this.statusView = null;
      this.poller.start();
    } catch (error) {
      this.retryError = speakingErrorMessage(error);
    } finally {
      this.retrying = false;
    }
  }

  back(): void {
    void this.router.navigate(this.classId ? ['/student/my-classes/detail', this.classId] : ['/student/my-classes']);
  }
}
