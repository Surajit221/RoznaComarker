import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, inject, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { SubmissionApiService, type BackendSubmission, type BackendUserLite } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { environment } from '../../../../../../environments/environment';

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
  @Input() navigateOnSelect = true;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();
  device = inject(DeviceService);
  private submissionApi = inject(SubmissionApiService);
  private alert = inject(AlertService);
  private router = inject(Router);

  modalState: SubmissionModalState = 'idle';
  readonly skeletonRows = [0, 1, 2];
  private requestSequence = 0;
  private destroyed = false;
  private loadingAssignmentId: string | null = null;

  submissions: BackendSubmission[] = [];

  students: {
    submissionId: string;
    name: string;
    image: string;
    lastActivity: string;
  }[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignmentId']) void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.requestSequence;
  }

  private avatarUrlFromPhoto(photo: unknown): string {
    const url = typeof photo === 'string' ? photo : '';
    if (!url) return 'img/default-img.png';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.apiUrl}${url}`;
  }

  private mapSubmissionToRow(s: BackendSubmission) {
    const student = typeof s.student === 'string'
      ? null
      : s.student as BackendUserLite & { photoUrl?: string; avatar?: string; image?: string };
    const name = (student && (student.displayName || student.email)) || 'Student';
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

  async load(): Promise<void> {
    const assignmentId = this.assignmentId;
    if (!assignmentId) {
      this.modalState = 'idle';
      return;
    }
    if (this.modalState === 'loading' && this.loadingAssignmentId === assignmentId) return;
    const requestSequence = ++this.requestSequence;
    this.loadingAssignmentId = assignmentId;
    this.modalState = 'loading';
    this.submissions = [];
    this.students = [];

    try {
      const submissions = await this.submissionApi.getSubmissionsByAssignment(assignmentId);
      if (this.destroyed || requestSequence !== this.requestSequence || assignmentId !== this.assignmentId) return;
      this.submissions = submissions || [];
      this.students = this.submissions.map((s) => this.mapSubmissionToRow(s));
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
    const studentId = studentObj?._id;

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

  private relatedId(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && '_id' in value && typeof value._id === 'string') return value._id;
    return undefined;
  }

  closeDialog() {
    ++this.requestSequence;
    this.closed.emit();
  }
}
