import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import { AssignmentForm } from './assignment-form/assignment-form';
import { DialogQrClasses } from './dialog-qr-classes/dialog-qr-classes';
import { DialogViewSubmissions } from './dialog-view-submissions/dialog-view-submissions';
import { DeviceService } from '../../../../services/device.service';
import { AppBarBackButton } from '../../../../shared/app-bar-back-button/app-bar-back-button';
import { BottomsheetDialog } from '../../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { AssignmentApiService, type BackendAssignment } from '../../../../api/assignment-api.service';
import { AlertService } from '../../../../services/alert.service';
import { ClassApiService, type BackendClassStudent, type BackendClassSummary } from '../../../../api/class-api.service';
import { SubmissionApiService } from '../../../../api/submission-api.service';
import { QrGeneratorService } from '../../../../services/qr-generator.service';

@Component({
  selector: 'app-detail-my-classes-pages',
  imports: [
    CommonModule,
    ModalDialog,
    AssignmentForm,
    DialogQrClasses,
    DialogViewSubmissions,
    AppBarBackButton,
    BottomsheetDialog,
  ],
  templateUrl: './detail-my-classes-pages.html',
  styleUrl: './detail-my-classes-pages.css',
})
export class DetailMyClassesPages {
  showDialog = false;
  showDialogSubmission = false;
  showDialogQRClasses = false;
  device = inject(DeviceService);
  private route = inject(ActivatedRoute);
  private assignmentApi = inject(AssignmentApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);
  private submissionApi = inject(SubmissionApiService);
  private qrGenerator = inject(QrGeneratorService);
  isButtonFabOpen = false;
  openSheetAssignment = false;
  openSheetQr = false;
  openSheetSubmission = false;

  classId: string | null = null;
  isLoading = false;

  classSummary: BackendClassSummary | null = null;

  get classTitle(): string {
    return this.classSummary?.name || '';
  }

  get classDescription(): string {
    return this.classSummary?.description || '';
  }

  get classCode(): string {
    const code = this.classSummary?.joinCode;
    return typeof code === 'string' ? code : '';
  }

  get shareLink(): string {
    const code = this.classCode;
    if (!code) return '';
    return this.qrGenerator.generateClassJoinUrl(code);
  }

  get qrValue(): string {
    const code = this.classCode;
    if (!code) return '';
    return this.qrGenerator.generateQrValue(code, true);
  }

  get selectedAssignmentTitle(): string {
    const id = this.selectedAssignmentId;
    if (!id) return '';
    const found = (this.assignments || []).find((a) => a.id === id);
    return found?.title || '';
  }

  selectedAssignmentId: string | null = null;

  assignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    submitted: number;
    total: number;
    status: 'pending' | 'in-progress' | 'completed';
  }> = [];

  async ngOnInit() {
    this.classId = this.route.snapshot.paramMap.get('slug');
    await this.loadClassSummary();
    await this.loadStudents();
    await this.loadAssignments();
  }

  private async loadClassSummary() {
    const classId = this.classId;
    if (!classId) return;
    try {
      this.classSummary = await this.classApi.getClassSummary(classId);
    } catch {
      this.classSummary = null;
    }
  }

  private mapAssignment(a: BackendAssignment) {
    const deadline = a.deadline ? new Date(a.deadline) : null;
    const dueDate = deadline ? deadline.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '';
    const status: 'pending' | 'in-progress' | 'completed' = deadline && deadline.getTime() < Date.now() ? 'completed' : 'pending';

    return {
      id: a._id,
      title: a.title,
      dueDate,
      submitted: 0,
      total: 0,
      status
    };
  }

  async loadAssignments() {
    const classId = this.classId;
    if (!classId) return;

    if (this.isLoading) return;
    this.isLoading = true;
    try {
      const assignments = await this.assignmentApi.getClassAssignments(classId);
      this.assignments = (assignments || []).map((a) => this.mapAssignment(a));

      // fill in submission stats
      const totalStudents = this.studentsCount;
      await Promise.all(
        this.assignments.map(async (item) => {
          try {
            const submissions = await this.submissionApi.getSubmissionsByAssignment(item.id);
            item.submitted = (submissions || []).length;
            item.total = totalStudents;
          } catch {
            item.submitted = 0;
            item.total = totalStudents;
          }
        })
      );
    } catch (err: any) {
      this.alert.showError('Failed to load assignments', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onAssignmentCreated(_created: BackendAssignment) {
    this.closeDialog();
    this.onCloseCreateAssignment();
    await this.loadAssignments();
  }

  students: Array<{
    id: string;
    name: string;
    image: string;
    status: 'ACTIVE' | 'INVITED';
    submitted: number;
    total: number;
    lastActivity: string;
  }> = [];

  get studentsCount(): number {
    return this.students.length;
  }

  get assignmentsCount(): number {
    return this.assignments.length;
  }

  get totalSubmissions(): number {
    const sum = (this.assignments || []).reduce((acc, a) => acc + (Number.isFinite(a.submitted) ? a.submitted : 0), 0);
    return Number.isFinite(sum) ? sum : 0;
  }

  private mapStudent(s: BackendClassStudent) {
    const joined = s.joinedAt ? new Date(s.joinedAt) : null;
    const lastActivity = joined ? joined.toLocaleDateString() : '';
    return {
      id: s.id,
      name: s.name,
      image: 'img/default-img.png',
      status: 'ACTIVE' as const,
      submitted: 0,
      total: 0,
      lastActivity
    };
  }

  private async loadStudents() {
    const classId = this.classId;
    if (!classId) return;
    try {
      const students = await this.classApi.getClassStudents(classId);
      this.students = (students || []).map((s) => this.mapStudent(s));
    } catch (err: any) {
      this.alert.showError('Failed to load students', err?.error?.message || err?.message || 'Please try again');
    }
  }

  constructor(private router: Router) {}

  toMyClasses() {
    this.router.navigate(['/teacher/my-classes']);
  }

  toStudentProfile(studentId: string) {
    this.router.navigate(['/teacher/my-classes/detail/student-profile', studentId], {
      queryParams: {
        classId: this.classId || undefined
      }
    });
  }

  onAddAssignment() {
    this.showDialog = true;
  }

  onOpenSubmission(assignmentId: string) {
    this.selectedAssignmentId = assignmentId;
    this.showDialogSubmission = true;
  }

  onOpenQRClasses() {
    this.showDialogQRClasses = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  closeDialogSubmission() {
    this.showDialogSubmission = false;
    this.selectedAssignmentId = null;
  }

  closeDialogQRClasses() {
    this.showDialogQRClasses = false;
  }

  onCloseCreateAssignment() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetAssignment = false;
  }

  onOpenCreateNewAssignment() {
    document.body.classList.add('overflow-hidden');
    this.openSheetAssignment = true;
  }

  onCloseQR() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetQr = false;
  }

  onOpenQR() {
    document.body.classList.add('overflow-hidden');
    this.openSheetQr = true;
  }

  onCloseSubmission() {
    document.body.classList.remove('overflow-hidden');
    this.openSheetSubmission = false;
    this.selectedAssignmentId = null;
  }

  onOpenSheetSubmission(assignmentId?: string) {
    document.body.classList.add('overflow-hidden');
    this.selectedAssignmentId = assignmentId || null;
    this.openSheetSubmission = true;
  }

  handleGoBack() {
    this.router.navigate(['/student/my-classes']);
  }

  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.alert.showSuccess('Success', 'Copied to clipboard!');
    }
  }

  copyClassLink() {
    this.copyToClipboard(this.shareLink);
  }

  copyClassCode() {
    this.copyToClipboard(this.classCode);
  }
}
