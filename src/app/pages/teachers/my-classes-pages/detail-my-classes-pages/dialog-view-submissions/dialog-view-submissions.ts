import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, inject, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { SubmissionApiService, type BackendSubmission, type BackendUserLite } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { AssignmentApiService, type BulkEvaluationStartResult,
  type StaleEvaluationSummary } from '../../../../../api/assignment-api.service';
import { environment } from '../../../../../../environments/environment';
import { TeacherDashboardStateService } from '../../../../../services/teacher-dashboard-state.service';
import { TeacherUploadApiService, friendlyError, type TeacherUploadItem } from '../../../../../api/teacher-upload-api.service';
import { uploadCanRetry, uploadIsStopped, uploadStatusDescription, uploadStatusLabel } from '../../../../../components/teacher/upload-student-work/teacher-upload-status';

export type SubmissionModalState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

@Component({
  selector: 'app-dialog-view-submissions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog-view-submissions.html',
  styleUrl: './dialog-view-submissions.css',
})
export class DialogViewSubmissions implements OnChanges, OnDestroy {
  @Input() assignmentId: string | null = null;
  @Input() open = false;
  @Input() navigateOnSelect = true;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();
  @Output() removed = new EventEmitter<string>();
  device = inject(DeviceService);
  private submissionApi = inject(SubmissionApiService);
  private alert = inject(AlertService);
  private assignmentApi = inject(AssignmentApiService);
  private teacherUploadApi = inject(TeacherUploadApiService);
  private router = inject(Router);
  private teacherDashboardState = inject(TeacherDashboardStateService);
  private freshnessInvalidationSub = this.teacherDashboardState.evaluationFreshnessInvalidated$
    .subscribe((assignmentId) => {
      if (assignmentId === this.assignmentId) void this.load(true);
    });

  modalState: SubmissionModalState = 'idle';
  readonly skeletonRows = [0, 1, 2];
  private requestSequence = 0;
  private destroyed = false;
  private loadingAssignmentId: string | null = null;
  private bulkRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  staleEvaluationSummary: StaleEvaluationSummary | null = null;
  bulkStartResult: BulkEvaluationStartResult | null = null;
  isBulkStarting = false;
  bulkFailedCount = 0;
  removingSubmissionId: string | null = null;

  get isBulkRunActive(): boolean {
    return this.submissions.some((submission) => submission.evaluationStatus === 'processing');
  }

  submissions: BackendSubmission[] = [];

  students: {
    submissionId: string;
    name: string;
    image: string;
    lastActivity: string;
    /** Set when the teacher uploaded this work: marking and email status. */
    upload?: TeacherUploadItem;
    /** The email the teacher typed (work the teacher uploaded only). */
    email?: string;
  }[] = [];
  sendingSubmissionId: string | null = null;
  retryingSubmissionId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignmentId'] || (changes['open'] && this.open)) void this.load(Boolean(changes['open']));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.freshnessInvalidationSub.unsubscribe();
    ++this.requestSequence;
    if (this.bulkRefreshTimer) clearTimeout(this.bulkRefreshTimer);
  }

  private avatarUrlFromPhoto(photo: unknown): string {
    const url = typeof photo === 'string' ? photo : '';
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.backendUrl}${url}`;
  }

  private mapSubmissionToRow(s: BackendSubmission) {
    const student = typeof s.student === 'string'
      ? null
      : s.student as BackendUserLite & { photoUrl?: string; avatar?: string; image?: string };
    const name = s.guest?.displayName ? `${s.guest.displayName} (Guest)` : (student && (student.displayName || student.email)) || 'Student';
    const rawPhoto = student && (student.photoURL || student.photoUrl || student.avatar || student.image);
    const image = this.avatarUrlFromPhoto(rawPhoto);
    const date = s && s.submittedAt ? new Date(s.submittedAt) : null;
    const lastActivity = date ? date.toLocaleDateString() : '';

    return {
      submissionId: s._id,
      name,
      image,
      lastActivity
    };
  }

  uploadStatusLabel(item: TeacherUploadItem): string { return uploadStatusLabel(item); }
  /** The reason shown under a stopped upload (failed or waiting for credits). */
  uploadStatusReason(item: TeacherUploadItem): string { return uploadIsStopped(item) ? uploadStatusDescription(item) : ''; }
  uploadIsStopped(item: TeacherUploadItem): boolean { return uploadIsStopped(item); }
  /** Retry marking is offered for every state that is not finished; the server ignores it while a run is live. */
  uploadCanRetry(item: TeacherUploadItem): boolean { return uploadCanRetry(item); }
  /** Marking failed and the email has not gone out: there is no feedback to send yet. */
  markingFailedNoEmail(item: TeacherUploadItem): boolean { return item.status === 'failed' && item.emailStatus !== 'sent'; }
  emailStatusLabel(item: TeacherUploadItem): string {
    if (this.markingFailedNoEmail(item) || item.emailStatus === 'held') return 'Marking failed, email not sent';
    if (item.emailStatus === 'failed' && item.emailDeliveryUncertain) return 'Delivery uncertain';
    if (item.emailStatus === 'sent') { const at = this.emailSentTime(item); return at ? `Email sent ${at}` : 'Email sent'; }
    return ({ none: 'Not emailed', queued: 'Email queued', sending: 'Email sending', sent: 'Email sent', failed: 'Email failed' } as const)[item.emailStatus];
  }
  /** When the mail server accepted it, in the teacher's local time: "09:22" today, "12 Nov 09:22" on another day. */
  emailSentTime(item: TeacherUploadItem, now = new Date()): string {
    const at = item.emailSentAt ? new Date(item.emailSentAt) : null;
    if (!at || Number.isNaN(at.getTime())) return '';
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at);
    return at.toDateString() === now.toDateString() ? time : `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(at)} ${time}`;
  }

  /** Marks the work again (one credit, charged only if marking succeeds). A held email is then sent once, after marking. */
  async retryMarking(row: { submissionId: string; upload?: TeacherUploadItem }): Promise<void> {
    if (!this.assignmentId || !row.upload || this.retryingSubmissionId) return;
    this.retryingSubmissionId = row.submissionId;
    try {
      const result = await this.teacherUploadApi.retry(this.assignmentId, row.submissionId);
      row.upload = result.item;
      if (result.alreadyRequested) this.alert.showSuccess('Marking is already running', 'This work is being marked now. Check back in a few minutes.');
      else this.alert.showSuccess('Marking restarted', 'This work is being marked again. Check back in a few minutes.');
    } catch (error) {
      this.alert.showError('Marking not restarted', friendlyError(error).message);
    } finally {
      this.retryingSubmissionId = null;
    }
  }

  /** Send (or resend after a failure) the student's feedback email; the server queues it once, however often this is clicked. */
  async sendFeedbackEmail(row: { submissionId: string; upload?: TeacherUploadItem }): Promise<void> {
    if (!this.assignmentId || !row.upload || this.sendingSubmissionId) return;
    this.sendingSubmissionId = row.submissionId;
    try {
      const result = await this.teacherUploadApi.send(this.assignmentId, row.submissionId);
      row.upload = result.item;
      this.alert.showSuccess('Email queued', result.item.status === 'marked'
        ? 'The feedback link will be emailed shortly.' : 'The feedback link will be emailed when marking is finished.');
    } catch (error) {
      this.alert.showError('Email not queued', friendlyError(error).message);
    } finally {
      this.sendingSubmissionId = null;
    }
  }

  /** "Resend email" for an email that was already sent (a student says it never arrived): asks first, then queues it once. */
  async resendFeedbackEmail(row: { submissionId: string; upload?: TeacherUploadItem }): Promise<void> {
    if (!this.assignmentId || !row.upload || this.sendingSubmissionId) return;
    const confirmed = await this.alert.showConfirm('Resend email?', 'This will send the link again.', 'Resend email', 'Cancel');
    if (!confirmed || this.destroyed || !this.assignmentId) return;
    this.sendingSubmissionId = row.submissionId;
    try {
      const result = await this.teacherUploadApi.send(this.assignmentId, row.submissionId, { requestId: crypto.randomUUID() });
      row.upload = result.item;
      this.alert.showSuccess('Email queued', 'The feedback link will be emailed again shortly.');
    } catch (error) {
      this.alert.showError('Email not queued', friendlyError(error).message);
    } finally {
      this.sendingSubmissionId = null;
    }
  }

  async load(force = false): Promise<void> {
    const assignmentId = this.assignmentId;
    if (!assignmentId) {
      this.modalState = 'idle';
      return;
    }
    if (!force && this.modalState === 'loading' && this.loadingAssignmentId === assignmentId) return;
    const requestSequence = ++this.requestSequence;
    this.loadingAssignmentId = assignmentId;
    this.modalState = 'loading';
    this.submissions = [];
    this.students = [];

    try {
      const [submissions, staleSummary, uploads] = await Promise.all([
        this.submissionApi.getSubmissionsByAssignment(assignmentId, null, 'cards'),
        this.assignmentApi.getStaleEvaluationSummary(assignmentId).catch(() => null),
        // Statuses of work the teacher uploaded; the list still loads without them.
        this.teacherUploadApi.list(assignmentId).catch(() => null)
      ]);
      if (this.destroyed || requestSequence !== this.requestSequence || assignmentId !== this.assignmentId) return;
      this.submissions = submissions || [];
      this.staleEvaluationSummary = staleSummary;
      const uploadById = new Map((uploads?.items || []).map((item) => [item.submissionId, item]));
      this.students = this.submissions.map((s) => this.withUpload(this.mapSubmissionToRow(s), uploadById.get(s._id)));
      this.modalState = this.students.length ? 'loaded' : 'empty';
      this.loadingAssignmentId = null;
    } catch {
      if (this.destroyed || requestSequence !== this.requestSequence || assignmentId !== this.assignmentId) return;
      this.modalState = 'error';
      this.loadingAssignmentId = null;
    }
  }

  toStudentSubmission(student: { submissionId: string }) {
    this.closeDialog();

    if (!this.navigateOnSelect) {
      this.selected.emit(student.submissionId);
      return;
    }

    const submission = this.submissions.find((s) => s._id === student.submissionId);
    const studentObj = submission && typeof submission.student !== 'string' ? submission.student : null;
    const studentId = submission?.submissionMode === 'guest' ? 'guest' : studentObj?._id;

    if (!studentId) {
      this.alert.showError('Missing student', 'Unable to open submission: student id is missing.');
      return;
    }

    this.router.navigate(['/teacher/my-classes/detail/student-submissions', studentId], {
      queryParams: {
        classId: this.relatedId(submission?.class),
        assignmentId: this.assignmentId || undefined,
        submissionId: student.submissionId
      }
    });
  }

  async removeSubmission(student: { submissionId: string; name: string }): Promise<void> {
    if (!student.submissionId || this.removingSubmissionId) return;
    const confirmed = await this.alert.showConfirm(
      'Remove this submission?',
      "This will remove the student's current submission and related current analysis for this assignment. The student will be able to submit again according to the assignment's submission rules.",
      'Remove Submission',
      'Cancel'
    );
    if (!confirmed || this.destroyed) return;

    this.removingSubmissionId = student.submissionId;
    try {
      await this.submissionApi.removeSubmission(student.submissionId);
      this.alert.showToast('Submission removed successfully', 'success');
      this.removed.emit(student.submissionId);
      await this.load(true);
    } catch (error: any) {
      this.alert.showError('Unable to remove submission',
        error?.error?.message || 'The submission could not be removed. Please try again.');
    } finally {
      this.removingSubmissionId = null;
    }
  }

  async startBulkReEvaluation(): Promise<void> {
    const assignmentId = this.assignmentId;
    const count = this.staleEvaluationSummary?.eligibleCount || 0;
    if (!assignmentId || !count || this.isBulkStarting || this.isBulkRunActive) return;
    const confirmed = await this.alert.showConfirm(
      'Re-evaluate outdated submissions',
      `Re-evaluate ${count} submissions using the current rubric and grading settings? This may use AI processing credits.`,
      'Re-evaluate submissions',
      'Cancel'
    );
    if (!confirmed || this.destroyed || assignmentId !== this.assignmentId) return;
    this.isBulkStarting = true;
    try {
      this.bulkStartResult = await this.assignmentApi.retryStaleEvaluations(assignmentId);
      this.alert.showToast(`${this.bulkStartResult.startedCount} submissions queued`, 'success');
      await this.refreshBulkProgress();
    } catch (error: any) {
      this.alert.showError('Bulk re-evaluation failed', error?.error?.message || error?.message || 'Please try again');
    } finally {
      this.isBulkStarting = false;
    }
  }

  private async refreshBulkProgress(): Promise<void> {
    const assignmentId = this.assignmentId;
    if (!assignmentId || this.destroyed) return;
    try {
      const [submissions, summary] = await Promise.all([
        this.submissionApi.getSubmissionsByAssignment(assignmentId, null, 'cards'),
        this.assignmentApi.getStaleEvaluationSummary(assignmentId)
      ]);
      if (this.destroyed || assignmentId !== this.assignmentId) return;
      this.submissions = submissions || [];
      // Keep each row's upload status (it was dropped here, so the status chips vanished after a bulk refresh).
      const uploadById = new Map(this.students.filter(row => row.upload).map(row => [row.submissionId, row.upload!]));
      this.students = this.submissions.map((submission) => this.withUpload(this.mapSubmissionToRow(submission), uploadById.get(submission._id)));
      this.staleEvaluationSummary = summary;
      this.bulkFailedCount = this.submissions.filter((submission) =>
        submission.evaluationStatus === 'failed').length;
      const processing = this.submissions.some((submission) => submission.evaluationStatus === 'processing');
      if (processing) {
        if (this.bulkRefreshTimer) clearTimeout(this.bulkRefreshTimer);
        this.bulkRefreshTimer = setTimeout(() => void this.refreshBulkProgress(), 5000);
      }
    } catch {
      // The queued jobs continue even if a status refresh fails.
    }
  }

  /** Work the teacher uploaded shows the name and email the teacher typed. */
  private withUpload(row: { submissionId: string; name: string; image: string; lastActivity: string }, upload?: TeacherUploadItem) {
    if (!upload) return { ...row, upload };
    return { ...row, name: upload.account === 'guest' ? `${upload.name} (Guest)` : upload.name || row.name, email: upload.email, upload };
  }

  private relatedId(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && '_id' in value && typeof value._id === 'string') return value._id;
    return undefined;
  }

  closeDialog() {
    ++this.requestSequence;
    if (this.bulkRefreshTimer) clearTimeout(this.bulkRefreshTimer);
    this.bulkRefreshTimer = null;
    this.closed.emit();
  }
}
