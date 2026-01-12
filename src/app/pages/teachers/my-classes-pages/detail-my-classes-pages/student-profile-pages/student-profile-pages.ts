import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { AuthService, type BackendUser } from '../../../../../auth/auth.service';
import { ClassApiService } from '../../../../../api/class-api.service';

@Component({
  selector: 'app-student-profile-pages',
  imports: [CommonModule, AppBarBackButton],
  templateUrl: './student-profile-pages.html',
  styleUrl: './student-profile-pages.css',
})
export class StudentProfilePages {
  device = inject(DeviceService);
  private route = inject(ActivatedRoute);
  private assignmentApi = inject(AssignmentApiService);
  private submissionApi = inject(SubmissionApiService);
  private alert = inject(AlertService);
  private auth = inject(AuthService);
  private classApi = inject(ClassApiService);

  studentId: string | null = null;
  classId: string | null = null;

  student: BackendUser | null = null;
  classTitle: string = '';

  get studentName(): string {
    return this.student?.displayName || this.student?.email || '';
  }

  get studentDisplayId(): string {
    return this.student?._id ? String(this.student._id) : (this.studentId ? String(this.studentId) : '');
  }

  isLoading = false;

  assignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    submitted: number;
    total: number;
    status: 'pending' | 'in-progress' | 'completed';
  }> = [];

  private mapAssignment(a: BackendAssignment) {
    const deadline = a.deadline ? new Date(a.deadline) : null;
    const dueDate = deadline
      ? deadline.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
      : '';

    // will be updated after fetching submissions
    return {
      id: a._id,
      title: a.title,
      dueDate,
      submitted: 0,
      total: 0,
      status: 'pending' as const
    };
  }

  private getStudentIdFromSubmission(s: BackendSubmission): string | null {
    const student: any = s && (s as any).student;
    if (typeof student === 'string') return student;
    return (student && (student._id || student.id)) || null;
  }

  constructor(private router: Router) { }

  async ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('studentId');
    this.classId = this.route.snapshot.queryParamMap.get('classId');

    await this.loadHeaderData();

    await this.loadAssignments();
  }

  private async loadHeaderData() {
    const studentId = this.studentId;
    const classId = this.classId;

    if (studentId) {
      try {
        this.student = await this.auth.getUserById(studentId);
      } catch {
        this.student = null;
      }
    }

    if (classId) {
      try {
        const summary = await this.classApi.getClassSummary(classId);
        this.classTitle = summary?.name || '';
      } catch {
        this.classTitle = '';
      }
    }
  }

  private async loadAssignments() {
    const classId = this.classId;
    const studentId = this.studentId;
    if (!classId || !studentId) return;
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const assignments = await this.assignmentApi.getClassAssignments(classId);
      this.assignments = (assignments || []).map((a) => this.mapAssignment(a));

      await Promise.all(
        this.assignments.map(async (item) => {
          try {
            const submissions = await this.submissionApi.getSubmissionsByAssignment(item.id);
            const hasSubmitted = (submissions || []).some((s) => this.getStudentIdFromSubmission(s) === studentId);
            item.submitted = hasSubmitted ? 1 : 0;
            item.total = 1;
            item.status = hasSubmitted ? 'completed' : 'pending';
          } catch {
            item.submitted = 0;
            item.total = 1;
            item.status = 'pending';
          }
        })
      );
    } catch (err: any) {
      this.alert.showError('Failed to load assignments', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  toDetailMyClasses() {
    const classId = this.classId;
    if (classId) {
      this.router.navigate(['/teacher/my-classes/detail', classId]);
      return;
    }
    this.router.navigate(['/teacher/my-classes']);
  }

  toStudentEssay(assignmentId?: string) {
    if (!this.studentId) {
      this.alert.showError('Missing student', 'Unable to open submissions: student id is missing.');
      return;
    }

    this.router.navigate(['/teacher/my-classes/detail/student-submissions', this.studentId], {
      queryParams: {
        classId: this.classId || undefined,
        assignmentId: assignmentId || undefined
      }
    });
  }

  handleGoBack() {
    this.router.navigate(['/teacher/my-classes']);
  }
}
