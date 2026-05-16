/**
 * WorksheetAssignInlineModal
 *
 * Inline assignment modal for use in worksheet-create page.
 * After a worksheet is saved, teacher can immediately assign it to a class.
 *
 * Usage:
 *   <app-worksheet-assign-inline-modal
 *     [(show)]="showAssignModal"
 *     [worksheetId]="savedWorksheet._id"
 *     [worksheetTitle]="savedWorksheet.title"
 *     [defaultDeadline]="savedWorksheet.assignmentDeadline"
 *     (assigned)="onWorksheetAssigned($event)">
 *   </app-worksheet-assign-inline-modal>
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService, BackendClass } from '../../../api/class-api.service';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';

@Component({
  selector: 'app-worksheet-assign-inline-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SuccessModal, ErrorModal],
  templateUrl: './worksheet-assign-inline-modal.html',
  styleUrl: './worksheet-assign-inline-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetAssignInlineModal implements OnChanges, OnDestroy {
  @Input() show = false;
  @Input() worksheetId = '';
  @Input() worksheetTitle = '';
  @Input() defaultDeadline = '';

  @Output() showChange = new EventEmitter<boolean>();
  @Output() assigned = new EventEmitter<{ classId: string; assignmentId: string }>();

  private readonly assignmentApi = inject(AssignmentApiService);
  private readonly classApi = inject(ClassApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  classes: BackendClass[] = [];
  isClassesLoading = false;
  isSubmitting = false;

  /** Form field values */
  selectedClassId = '';
  assignmentTitle = '';
  deadline = '';
  instructions = '';

  /** Inline validation error messages */
  classError = '';
  titleError = '';
  deadlineError = '';

  /** Success/error modal state */
  showSuccessModal = false;
  showErrorModal = false;
  modalTitle = '';
  modalMessage = '';

  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.resetForm();
      this.loadClasses();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private resetForm(): void {
    this.selectedClassId = '';
    this.assignmentTitle = this.worksheetTitle ?? '';
    this.deadline = this.formatDateForInput(this.defaultDeadline);
    this.instructions = '';
    this.classError = '';
    this.titleError = '';
    this.deadlineError = '';
    this.isSubmitting = false;
    this.showSuccessModal = false;
    this.showErrorModal = false;
    this.cdr.markForCheck();
  }

  private formatDateForInput(isoDate: string): string {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  private async loadClasses(): Promise<void> {
    this.isClassesLoading = true;
    this.cdr.markForCheck();
    try {
      this.classes = await this.classApi.getMyTeacherClasses();
      if (this.classes.length === 1) {
        this.selectedClassId = this.classes[0]._id;
      }
    } catch {
      this.classes = [];
    } finally {
      this.isClassesLoading = false;
      this.cdr.markForCheck();
    }
  }

  private validate(): boolean {
    let valid = true;
    this.classError = this.titleError = this.deadlineError = '';

    if (!this.selectedClassId) {
      this.classError = 'Please select a class.';
      valid = false;
    }
    if (!this.assignmentTitle.trim()) {
      this.titleError = 'Assignment title cannot be empty.';
      valid = false;
    }
    if (!this.deadline) {
      this.deadlineError = 'Please select a deadline.';
      valid = false;
    } else {
      const dl = new Date(`${this.deadline}T23:59:59.999`);
      if (isNaN(dl.getTime()) || dl.getTime() <= Date.now()) {
        this.deadlineError = 'Deadline must be a future date.';
        valid = false;
      }
    }
    this.cdr.markForCheck();
    return valid;
  }

  async submit(): Promise<void> {
    if (this.isSubmitting || !this.validate()) return;

    const selectedClass = this.classes.find((c) => c._id === this.selectedClassId);
    const deadlineIso = new Date(`${this.deadline}T23:59:59.999`).toISOString();
    const title = this.assignmentTitle.trim();

    this.isSubmitting = true;
    this.cdr.markForCheck();

    try {
      const assignment = await this.assignmentApi.createAssignment({
        title,
        classId: this.selectedClassId,
        deadline: deadlineIso,
        writingType: 'worksheet',
        instructions: this.instructions.trim() || undefined,
        resourceType: 'worksheet',
        resourceId: this.worksheetId,
      });

      this.isSubmitting = false;
      this.modalTitle = 'Assigned!';
      this.modalMessage = `"${title}" has been assigned to ${selectedClass?.name ?? 'the class'}.`;
      this.showSuccessModal = true;
      this.cdr.markForCheck();
      this.assigned.emit({ classId: this.selectedClassId, assignmentId: assignment._id });
    } catch (err: unknown) {
      this.isSubmitting = false;
      const msg =
        (err as { error?: { message?: string } })?.error?.message ??
        (err as { message?: string })?.message ??
        'Please try again.';
      this.modalTitle = 'Assignment Failed';
      this.modalMessage = msg;
      this.showErrorModal = true;
      this.cdr.markForCheck();
    }
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.show = false;
    this.showChange.emit(false);
  }

  onSuccessClose(): void {
    this.showSuccessModal = false;
    this.show = false;
    this.showChange.emit(false);
  }

  onErrorClose(): void {
    this.showErrorModal = false;
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('waim-backdrop')) {
      this.cancel();
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.show && !this.isSubmitting && !this.showSuccessModal && !this.showErrorModal) {
      this.cancel();
    }
  }
}
