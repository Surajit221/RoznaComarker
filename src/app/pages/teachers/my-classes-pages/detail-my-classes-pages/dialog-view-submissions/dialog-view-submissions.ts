import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, inject, Output } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';

@Component({
  selector: 'app-dialog-view-submissions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog-view-submissions.html',
  styleUrl: './dialog-view-submissions.css',
})
export class DialogViewSubmissions {
  @Input() assignmentId: string | null = null;
  @Input() navigateOnSelect = true;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();
  device = inject(DeviceService);
  private submissionApi = inject(SubmissionApiService);
  private alert = inject(AlertService);

  isLoading = false;

  submissions: BackendSubmission[] = [];

  students: Array<{
    submissionId: string;
    name: string;
    image: string;
    lastActivity: string;
  }> = [];

  constructor(private router: Router) { }

  async ngOnInit() {
    await this.load();
  }

  async ngOnChanges() {
    await this.load();
  }

  private mapSubmissionToRow(s: BackendSubmission) {
    const student: any = s && (s as any).student;
    const name = (student && (student.displayName || student.email)) || 'Student';
    const image = (student && student.photoURL) || 'img/default-img.png';
    const date = s && s.submittedAt ? new Date(s.submittedAt) : null;
    const lastActivity = date ? date.toLocaleDateString() : '';

    return {
      submissionId: s._id,
      name,
      image,
      lastActivity
    };
  }

  private async load() {
    const assignmentId = this.assignmentId;
    if (!assignmentId) return;
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const submissions = await this.submissionApi.getSubmissionsByAssignment(assignmentId);
      this.submissions = submissions || [];
      this.students = this.submissions.map((s) => this.mapSubmissionToRow(s));
    } catch (err: any) {
      this.alert.showError('Failed to load submissions', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  toStudentSubmission(student: { submissionId: string }) {
    this.closeDialog();

    if (!this.navigateOnSelect) {
      this.selected.emit(student.submissionId);
      return;
    }

    const submission = this.submissions.find((s) => s._id === student.submissionId);
    const studentObj: any = submission && (submission as any).student;
    const studentId = studentObj && (studentObj._id || studentObj.id);

    if (!studentId) {
      this.alert.showError('Missing student', 'Unable to open submission: student id is missing.');
      return;
    }

    this.router.navigate(['/teacher/my-classes/detail/student-submissions', studentId], {
      queryParams: {
        classId: submission && (submission as any).class && ((submission as any).class._id || (submission as any).class),
        assignmentId: this.assignmentId || undefined,
        submissionId: student.submissionId
      }
    });
  }

  closeDialog() {
    this.closed.emit();
  }
}
