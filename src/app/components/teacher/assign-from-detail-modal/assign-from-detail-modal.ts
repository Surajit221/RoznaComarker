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
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { ClassApiService, BackendClass } from '../../../api/class-api.service';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';

@Component({
  selector: 'app-assign-from-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SuccessModal, ErrorModal],
  templateUrl: './assign-from-detail-modal.html',
  styleUrl: './assign-from-detail-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignFromDetailModal implements OnChanges, OnDestroy {
  /** MongoDB _id of the flashcard set being assigned */
  @Input() flashcardSetId = '';
  /** Display title of the flashcard set */
  @Input() flashcardTitle = '';
  /** Card count for the subtitle */
  @Input() cardCount = 0;
  /** Whether the modal is open */
  @Input() isOpen = false;
  /** Emitted when modal should close (success or cancel) */
  @Output() closed = new EventEmitter<void>();
  /** Emitted after a successful assignment */
  @Output() assigned = new EventEmitter<void>();

  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly classApi = inject(ClassApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  classes: BackendClass[] = [];
  isClassesLoading = false;
  isSubmitting = false;

  /** Form field values */
  selectedClassId = '';
  assignmentTitle = '';
  deadline = '';

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

  get defaultDeadline(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
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
    this.assignmentTitle = this.flashcardTitle ?? '';
    this.deadline = this.defaultDeadline;
    this.classError = '';
    this.titleError = '';
    this.deadlineError = '';
    this.isSubmitting = false;
    this.showSuccessModal = false;
    this.showErrorModal = false;
    this.cdr.markForCheck();
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

  submit(): void {
    if (this.isSubmitting || !this.validate()) return;

    const selectedClass = this.classes.find((c) => c._id === this.selectedClassId);
    const deadlineIso = new Date(`${this.deadline}T23:59:59.999`).toISOString();
    const title = this.assignmentTitle.trim();

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.flashcardApi
      .assignSet(this.flashcardSetId, {
        classId: this.selectedClassId,
        title,
        deadline: deadlineIso,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.modalTitle = 'Assigned!';
          this.modalMessage = `"${title}" has been assigned to ${selectedClass?.name ?? 'the class'}.`;
          this.showSuccessModal = true;
          this.cdr.markForCheck();
          this.assigned.emit();
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          const msg =
            (err as { error?: { message?: string } })?.error?.message ??
            (err as { message?: string })?.message ??
            'Please try again.';
          this.modalTitle = 'Assignment Failed';
          this.modalMessage = msg;
          this.showErrorModal = true;
          this.cdr.markForCheck();
        },
      });
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.closed.emit();
  }

  onSuccessClose(): void {
    this.showSuccessModal = false;
    this.closed.emit();
    // Redirect to the class details page after a successful assignment.
    if (this.selectedClassId) {
      this.router.navigate(['/teacher/my-classes/detail', this.selectedClassId]);
    }
  }

  onErrorClose(): void {
    this.showErrorModal = false;
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('afdm-backdrop')) {
      this.cancel();
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.isOpen && !this.isSubmitting && !this.showSuccessModal && !this.showErrorModal) {
      this.cancel();
    }
  }
}
