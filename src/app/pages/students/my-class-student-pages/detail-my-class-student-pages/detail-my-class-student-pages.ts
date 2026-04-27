import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import { UploadEssayForm } from './upload-essay-form/upload-essay-form';
import { DeviceService } from '../../../../services/device.service';
import { BottomsheetDialog } from '../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { AppBarBackButton } from '../../../../shared/app-bar-back-button/app-bar-back-button';
import { AssignmentApiService, type BackendAssignment } from '../../../../api/assignment-api.service';
import { SubmissionApiService } from '../../../../api/submission-api.service';
import { type BackendUploadResponse, UploadApiService } from '../../../../api/upload-api.service';
import { AlertService } from '../../../../services/alert.service';
import { ClassApiService, type BackendClassSummary } from '../../../../api/class-api.service';
import { TeacherDashboardStateService } from '../../../../services/teacher-dashboard-state.service';
import { NotificationRealtimeService } from '../../../../services/notification-realtime.service';
import { AssignmentStateService } from '../../../../services/assignment-state.service';
import { WorksheetApiService } from '../../../../api/worksheet-api.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-detail-my-class-student-pages',
  imports: [CommonModule, ModalDialog, UploadEssayForm, BottomsheetDialog, AppBarBackButton],
  templateUrl: './detail-my-class-student-pages.html',
  styleUrl: './detail-my-class-student-pages.css',
})
export class DetailMyClassStudentPages {
  @ViewChild('uploadFormDialog') uploadFormDialog?: UploadEssayForm;
  @ViewChild('uploadFormSheet') uploadFormSheet?: UploadEssayForm;

  showDialog = false;
  openSheet = false;
  device = inject(DeviceService);

  private route = inject(ActivatedRoute);
  private assignmentApi = inject(AssignmentApiService);
  private submissionApi = inject(SubmissionApiService);
  private uploadApi = inject(UploadApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);
  private teacherDashboardState = inject(TeacherDashboardStateService);
  private realtime = inject(NotificationRealtimeService);

  private realtimeSub: Subscription | null = null;
  private completionSub: Subscription | null = null;
  private assignmentsPollId: number | null = null;
  private pendingAssignmentsRefresh = false;
  private assignmentState = inject(AssignmentStateService);
  private worksheetApi    = inject(WorksheetApiService);

  classId: string | null = null;
  isLoading = false;

  classSummary: BackendClassSummary | null = null;

  get classTitle(): string {
    return this.classSummary?.name || '';
  }

  get classDescription(): string {
    return this.classSummary?.description || '';
  }

  get teacherName(): string {
    return this.classSummary?.teacher?.name || this.classSummary?.teacher?.email || '';
  }

  get studentsCount(): number {
    const n = this.classSummary?.studentsCount;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  }

  selectedAssignmentId: string | null = null;

  assignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    submitted: number;
    total: number;
    status: 'waiting' | 'pending' | 'in-progress' | 'completed';
    resourceType?: string;
    resourceId?: string;
  }> = [];

  constructor(private router: Router) {}

  async ngOnInit() {
    this.classId = this.route.snapshot.paramMap.get('slug') || this.route.snapshot.paramMap.get('classId');
    await this.loadClassSummary();
    await this.loadAssignments();

    this.realtimeSub?.unsubscribe();
    this.realtimeSub = this.realtime.notifications$.subscribe((n: any) => {
      if (!n || !['assignment_uploaded', 'assignment_removed'].includes(String(n.type || ''))) return;
      const classId = this.classId;
      const eventClassId = n?.data?.classId ? String(n.data.classId) : '';
      if (!classId || !eventClassId || eventClassId !== classId) return;
      this.scheduleAssignmentsRefresh();
    });

    /** GAP 1 — flip assignment status badge instantly after student submits */
    this.completionSub?.unsubscribe();
    this.completionSub = this.assignmentState.completed$.subscribe((assignmentId) => {
      const a = this.assignments.find((x) => x.id === assignmentId);
      if (a) {
        a.status = 'completed';
      }
    });

    this.startAssignmentsPolling();
  }

  ngOnDestroy() {
    this.realtimeSub?.unsubscribe();
    this.realtimeSub = null;
    this.completionSub?.unsubscribe();
    this.completionSub = null;

    if (this.assignmentsPollId !== null) {
      window.clearInterval(this.assignmentsPollId);
      this.assignmentsPollId = null;
    }
  }

  private scheduleAssignmentsRefresh(): void {
    if (this.pendingAssignmentsRefresh) return;
    this.pendingAssignmentsRefresh = true;

    // Debounce to avoid rapid refresh storms if multiple notifications arrive.
    window.setTimeout(() => {
      this.pendingAssignmentsRefresh = false;
      void this.loadClassSummary();
      void this.loadAssignments();
    }, 500);
  }

  private startAssignmentsPolling(): void {
    if (this.assignmentsPollId !== null) return;

    this.assignmentsPollId = window.setInterval(() => {
      try {
        if (document.visibilityState !== 'visible') return;
      } catch {
        // ignore
      }

      void this.loadAssignments();
    }, 30000);
  }

  private async loadClassSummary() {
    const classId = this.classId;
    if (!classId) return;
    try {
      this.classSummary = await this.classApi.getClassSummary(classId);
    } catch (err: any) {
      // keep page usable even if summary fails
      this.classSummary = null;
    }
  }

  private async mapAssignment(a: BackendAssignment) {
    const deadline = a.deadline ? new Date(a.deadline) : null;
    const dueDate = deadline
      ? deadline.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
      : '';

    // Check if student has submitted this assignment
    let status: 'waiting' | 'pending' | 'in-progress' | 'completed' = 'waiting';
    let submitted = 0;
    let total = 1; // Each assignment has 1 total submission slot

    try {
      if (a.resourceType === 'flashcard') {
        /** Check FlashcardSubmission for flashcard-type assignments */
        const sub = await this.assignmentApi.getMyFlashcardSubmission(a._id);
        if (sub) {
          submitted = 1;
          status = 'completed';
        }
      } else if (a.resourceType === 'worksheet' && a.resourceId) {
        /** Check WorksheetSubmission for worksheet-type assignments */
        const sub = await this.worksheetApi.getMySubmissionByAssignment(a.resourceId, a._id);
        if (sub) {
          submitted = 1;
          status = 'completed';
        }
      } else {
        const submission = await this.submissionApi.getMySubmissionByAssignmentId(a._id);
        if (submission) {
          submitted = 1;
          status = 'completed';
        }
      }
    } catch (err) {
      // No submission found, keep default status
    }

    // Update status based on deadline
    if (deadline && deadline.getTime() < Date.now() && status === 'waiting') {
      status = 'pending'; // Overdue
    }

    return {
      id: a._id,
      title: a.title,
      dueDate,
      submitted,
      total,
      status,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
    };
  }

  async loadAssignments() {
    const classId = this.classId;
    if (!classId) return;

    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const assignments = await this.assignmentApi.getMyAssignments();
      const filtered = (assignments || []).filter((a) => {
        const c: any = a.class;
        return typeof c === 'string' ? c === classId : c && c._id === classId;
      });

      const assignmentCards = await Promise.all(
        filtered.map((a) => this.mapAssignment(a))
      );
      this.assignments = assignmentCards;
    } catch (err: any) {
      this.alert.showError('Failed to load assignments', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  toMyClasses() {
    this.router.navigate(['/student/my-classes']);
  }

  toViewSubmission(assignmentId: string) {
    this.selectedAssignmentId = assignmentId;
    this.router.navigate(['/student/my-classes/detail/my-submissions', assignmentId], {
      queryParams: {
        classId: this.classId || undefined
      }
    });
  }

  openUpload(assignmentId: string) {
    this.selectedAssignmentId = assignmentId;

    if (this.device.isMobile() || this.device.isTablet()) {
      document.body.classList.add('overflow-hidden');
      this.openSheet = true;
      this.showDialog = false;
      return;
    }

    this.showDialog = true;
    this.openSheet = false;
  }

  selectedFile: File | null = null;

  selectedFiles: File[] = [];

  uploadProgressPercent: number | null = null;
  uploadErrorMessage: string | null = null;
  uploadSuccessMessage: string | null = null;
  uploadedSubmission: BackendUploadResponse | null = null;

  onFilesSelected(files: File[]) {
    this.selectedFiles = files;
  }

  async uploadFiles(event?: Event) {
    try {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    } catch {
      // ignore
    }

    const assignmentId = this.selectedAssignmentId;
    if (!assignmentId) {
      this.alert.showWarning('Select assignment', 'Please select an assignment before uploading.');
      return;
    }

    if (!this.selectedFiles || this.selectedFiles.length === 0) {
      this.alert.showWarning('No file selected', 'Please select a file to upload.');
      return;
    }

    if (this.isLoading) return;
    this.isLoading = true;
    this.uploadProgressPercent = 0;
    this.uploadErrorMessage = null;
    this.uploadSuccessMessage = null;
    this.uploadedSubmission = null;

    try {
      await new Promise<void>((resolve, reject) => {
        const subscription = this.uploadApi.submitSubmissionFiles(this.selectedFiles, assignmentId).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress) {
              const total = typeof event.total === 'number' ? event.total : null;
              const percent = total ? Math.round((100 * event.loaded) / total) : null;
              this.uploadProgressPercent = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0;
              return;
            }

            if (event.type === HttpEventType.Response) {
              const body = event.body as any;
              if (!body || body.success !== true) {
                reject(new Error(body?.message || 'Upload failed'));
                subscription.unsubscribe();
                return;
              }

              this.uploadProgressPercent = 100;
              this.uploadedSubmission = null;
              this.uploadSuccessMessage = 'Upload successful';
              resolve();
              subscription.unsubscribe();
            }
          },
          error: (err) => {
            subscription.unsubscribe();
            reject(err);
          }
        });
      });

      this.alert.showToast('Upload successful', 'success');

      // Keep teacher dashboard data consistent within the same app session.
      // Backend remains the source of truth (no synthetic submissions).
      // Intentionally skip teacher dashboard refresh for student uploads.
      // Teacher-only dashboard endpoints (e.g. /api/classes/mine) will return 403 for students.

      const idx = this.assignments.findIndex((a) => a.id === assignmentId);
      if (idx >= 0) {
        this.assignments[idx] = {
          ...this.assignments[idx],
          submitted: 1,
          status: 'completed'
        };
      }

      // Close any open dialogs/sheets
      this.showDialog = false;
      if (this.openSheet) {
        document.body.classList.remove('overflow-hidden');
      }
      this.openSheet = false;

      this.selectedFiles = [];
      this.selectedAssignmentId = null;

      this.uploadFormDialog?.reset();
      this.uploadFormSheet?.reset();

      const refreshToken = String(Date.now());
      const tree = this.router.createUrlTree(['/student/my-classes/detail/my-submissions', assignmentId], {
        queryParams: {
          classId: this.classId || undefined,
          refresh: refreshToken
        }
      });
      const url = this.router.serializeUrl(tree);
      void this.router.navigateByUrl(url);

    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Please try again';
      this.uploadErrorMessage = message;
      this.alert.showError('Upload failed', message);
    } finally {
      this.isLoading = false;
    }
  }

  closeDialog() {
    this.showDialog = false;
    this.selectedFiles = [];
    this.selectedAssignmentId = null;
    this.uploadProgressPercent = null;
    this.uploadErrorMessage = null;
    this.uploadSuccessMessage = null;
    this.uploadedSubmission = null;
    this.uploadFormDialog?.reset();
  }

  onOpenSheet() {
    document.body.classList.add('overflow-hidden');
    this.openSheet = true;
  }

  onCLoseSheet() {
    document.body.classList.remove('overflow-hidden');
    this.openSheet = false;
    this.selectedAssignmentId = null;
    this.selectedFiles = [];
    this.uploadProgressPercent = null;
    this.uploadErrorMessage = null;
    this.uploadSuccessMessage = null;
    this.uploadedSubmission = null;
    this.uploadFormSheet?.reset();
  }

  handleGoBack() {
    this.router.navigate(['/student/my-classes']); // arahkan ke halaman spesifik
  }

  /** Navigate to the results page for a completed flashcard assignment */
  viewResult(item: { id: string; resourceType?: string; resourceId?: string }): void {
    this.assignmentApi.getMyFlashcardSubmission(item.id).then((sub) => {
      if (!sub) return;
      this.router.navigate(['/student/results'], {
        state: {
          assignmentId:    item.id,
          flashcardSetId:  item.resourceId ?? (sub as any).flashcardSetId ?? '',
          template:        (sub as any).template ?? 'term-def',
          score:           sub.score,
          total:           (sub as any).totalCards ?? 100,
          cardResults:     (sub as any).cardResults ?? [],
          cards:           (sub as any).cards ?? [],
          timeTaken:       sub.timeTaken,
          classId:         this.classId ?? '',
          type:            'flashcard' as const,
        },
      });
    }).catch(() => {});
  }

  /** Open the student flashcard player for a flashcard-type assignment */
  openFlashcardPlayer(resourceId: string, assignmentId: string): void {
    this.router.navigate(['/student/flashcard-player', resourceId], {
      queryParams: { assignmentId, classId: this.classId ?? undefined },
    });
  }

  /** Navigate to the full-page worksheet viewer */
  openWorksheetViewer(resourceId: string, assignmentId: string): void {
    this.router.navigate(['/student/worksheet', resourceId], {
      queryParams: { assignmentId, classId: this.classId ?? undefined },
    });
  }

  /** Navigate to the results page for a completed worksheet assignment */
  viewWorksheetResult(item: { id: string; resourceType?: string; resourceId?: string }): void {
    if (!item.resourceId) return;
    this.worksheetApi
      .getMySubmissionByAssignment(item.resourceId, item.id)
      .then((sub) => {
        if (!sub) {
          this.openWorksheetViewer(item.resourceId!, item.id);
          return;
        }
        this.router.navigate(['/student/worksheet-results'], {
          state: {
            submission:     sub,
            worksheetTitle: sub.worksheet?.title ?? '',
            classId:        this.classId ?? '',
            assignmentId:   item.id,
          },
        });
      })
      .catch(() => this.openWorksheetViewer(item.resourceId!, item.id));
  }
}
