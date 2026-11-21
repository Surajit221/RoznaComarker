import { CommonModule } from '@angular/common';
import { Component, type OnDestroy, type OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DeviceService } from '../../../../../services/device.service';
import { AssignmentApiService } from '../../../../../api/assignment-api.service';
import { SpeakingApiService, type SpeakingResult, type TeacherSpeakingSubmission } from '../../../../../api/speaking-api.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { AnalysisProgress, type ProcessingProgress } from '../../../../../components/analysis-progress/analysis-progress';
import { SpeakingAudioPlayer } from '../../../../../components/speaking/speaking-audio-player/speaking-audio-player';
import { SpeakingTranscript } from '../../../../../components/speaking/speaking-transcript/speaking-transcript';
import { SpeakingResultView } from '../../../../../components/speaking/speaking-result-view/speaking-result-view';
import { SpeakingPoller, type SpeakingStatusView, speakingProgress, teacherSpeakingStatus } from '../../../../../utils/speaking-status';
import { speakingErrorMessage } from '../../../../../utils/speaking-messages';

/**
 * The owning teacher's view of one speaking submission (stage 7e): whose recording it is, its status with the reason and the retry that applies
 * (transcription, or marking after credits are added), the recording (play and download), what was said with the corrections, and the result.
 * Polled every 10 seconds while the recording is being turned into text or marked. Another teacher's submission answers 404: one fixed line.
 */
@Component({
  selector: 'app-teacher-speaking-submission-page',
  imports: [CommonModule, AppBarBackButton, AnalysisProgress, SpeakingAudioPlayer, SpeakingTranscript, SpeakingResultView],
  templateUrl: './teacher-speaking-submission-page.html',
  styleUrl: './teacher-speaking-submission-page.css'
})
export class TeacherSpeakingSubmissionPage implements OnInit, OnDestroy {
  readonly device = inject(DeviceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly assignmentApi = inject(AssignmentApiService);
  private readonly speakingApi = inject(SpeakingApiService);

  submissionId = '';
  classId: string | null = null;
  loading = true;
  loadError: string | null = null;
  assignmentTitle = '';
  view: TeacherSpeakingSubmission | null = null;
  result: SpeakingResult | null = null;
  statusView: SpeakingStatusView | null = null;
  busy: 'transcription' | 'marking' | null = null;
  actionError: string | null = null;
  private destroyed = false;
  private readonly poller = new SpeakingPoller(() => this.refresh());

  get title(): string { return this.assignmentTitle || 'Speaking assignment'; }
  get studentName(): string { return this.view?.studentName || 'Student'; }
  get recordingLabel(): string { return `Recording by ${this.studentName}`; }
  get progress(): ProcessingProgress { return speakingProgress(this.statusView ?? { tone: 'progress', message: 'Checking the recording…' }); }

  async ngOnInit(): Promise<void> {
    this.submissionId = this.route.snapshot.paramMap.get('submissionId') || '';
    this.classId = this.route.snapshot.queryParamMap.get('classId');
    try {
      this.view = await this.speakingApi.getTeacherSubmission(this.submissionId);
    } catch (error) {
      this.loadError = error instanceof HttpErrorResponse && error.status === 404 ? "This recording isn't available." : speakingErrorMessage(error);
      return;
    } finally {
      this.loading = false;
    }
    if (this.destroyed) return;
    void this.loadTitle(this.view.assignmentId);
    this.poller.start();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.poller.stop();
  }

  private async loadTitle(assignmentId: string): Promise<void> {
    try { this.assignmentTitle = (await this.assignmentApi.getAssignmentByIdForTeacher(assignmentId))?.title || ''; } catch { this.assignmentTitle = ''; }
  }

  /** One status check; true when nothing more will change on its own. A recording that has just failed reloads the job state (its reason). */
  private async refresh(): Promise<boolean> {
    if (this.destroyed) return true;
    const result = await this.speakingApi.getResult(this.submissionId);
    if (this.destroyed) return true;
    if (result.state === 'transcription_failed' && this.view?.recording?.status !== 'failed') {
      this.view = await this.speakingApi.getTeacherSubmission(this.submissionId);
    }
    this.result = result;
    this.statusView = teacherSpeakingStatus(result, this.view?.recording ?? null);
    return this.statusView.final;
  }

  async retryTranscription(): Promise<void> {
    if (this.busy) return;
    this.busy = 'transcription';
    this.actionError = null;
    try {
      await this.speakingApi.retryTranscription(this.submissionId);
      if (this.view?.recording) this.view = { ...this.view, recording: { ...this.view.recording, status: 'queued', lastErrorCode: null } };
      this.statusView = null;
      this.poller.start();
    } catch (error) {
      this.actionError = speakingErrorMessage(error);
    } finally {
      this.busy = null;
    }
  }

  async retryMarking(): Promise<void> {
    if (this.busy) return;
    this.busy = 'marking';
    this.actionError = null;
    try {
      this.result = await this.speakingApi.retryAssessment(this.submissionId);
      this.statusView = teacherSpeakingStatus(this.result, this.view?.recording ?? null);
      this.poller.start();
    } catch (error) {
      this.actionError = speakingErrorMessage(error);
    } finally {
      this.busy = null;
    }
  }

  back(): void {
    void this.router.navigate(this.classId ? ['/teacher/my-classes/detail', this.classId] : ['/teacher/my-classes']);
  }
}
