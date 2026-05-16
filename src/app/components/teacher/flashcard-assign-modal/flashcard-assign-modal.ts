/**
 * FlashcardAssignModal — PART 1 / f5
 *
 * Teacher selects a flashcard set from their library and enters a deadline;
 * on submit it calls FlashcardApiService.assignSet() which also creates an
 * Assignment record so students see it in their class detail view.
 *
 * Usage:
 *   <app-flashcard-assign-modal
 *     [(show)]="showFlashcardModal"
 *     [classId]="classId"
 *     (assigned)="onFlashcardAssigned($event)">
 *   </app-flashcard-assign-modal>
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AlertService } from '../../../services/alert.service';
import type { FlashcardSet } from '../../../models/flashcard-set.model';
import { FlashcardPreviewModal } from '../flashcard-preview-modal/flashcard-preview-modal';

@Component({
  selector: 'app-flashcard-assign-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FlashcardPreviewModal],
  templateUrl: './flashcard-assign-modal.html',
  styleUrl: './flashcard-assign-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardAssignModal implements OnChanges, OnDestroy {
  @Input() show  = false;
  @Input() classId: string | null = null;
  /** Preselect a set (e.g. when returning from create flow) */
  @Input() preselectedSetId: string | null = null;

  @Output() showChange = new EventEmitter<boolean>();
  /** Emits when the assignment was created successfully */
  @Output() assigned   = new EventEmitter<void>();

  private readonly api     = inject(FlashcardApiService);
  private readonly alert   = inject(AlertService);
  private readonly cdr     = inject(ChangeDetectorRef);
  private readonly router  = inject(Router);
  private readonly destroy$ = new Subject<void>();

  sets: FlashcardSet[] = [];
  isLoading   = false;
  isSubmitting = false;
  selectedSetId: string | null = null;
  deadline = '';

  // Preview state
  showPreview = false;
  selectedSetForPreview: FlashcardSet | null = null;

  // Error state
  errorMessage: string | null = null;
  
  /** Minimum date for deadline picker = today */
  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.resetForm();
      this.loadSets();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.show = false;
    this.showChange.emit(false);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('fam-backdrop')) {
      this.close();
    }
  }

  openFlashcardLibrary(): void {
    this.close();
    this.router.navigate(['/flashcards']);
  }

  /** Open preview for selected flashcard set */
  openPreview(set: FlashcardSet): void {
    this.selectedSetForPreview = set;
    this.showPreview = true;
    this.cdr.markForCheck();
  }

  /** Handle returning from preview */
  onBackFromPreview(): void {
    // Preview is closed automatically by the modal
    // Focus back on the set selection
    this.selectedSetForPreview = null;
    this.cdr.markForCheck();
  }

  submit(): void {
    this.errorMessage = null;
    if (this.isSubmitting) return;
    if (!this.selectedSetId) {
      this.errorMessage = 'Please choose a flashcard set.';
      this.cdr.markForCheck();
      return;
    }
    if (!this.deadline) {
      this.errorMessage = 'Please enter a deadline date.';
      this.cdr.markForCheck();
      return;
    }
    if (!this.classId) {
      this.errorMessage = 'Class ID is not available. Please try again from the class page.';
      this.cdr.markForCheck();
      return;
    }

    const deadlineDate = new Date(`${this.deadline}T23:59:59.999`);
    if (isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      this.errorMessage = 'Deadline must be a future date.';
      this.cdr.markForCheck();
      return;
    }

    const selectedSet = this.sets.find((s) => s._id === this.selectedSetId);
    const title = selectedSet?.title ?? 'Flashcard Assignment';

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.api
      .assignSet(this.selectedSetId, {
        classId: this.classId,
        title,
        deadline: deadlineDate.toISOString(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          this.assigned.emit();
          this.close();
          this.alert.showSuccess('Assigned!', `"${title}" has been assigned to the class.`);
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          const msg = (err as { error?: { message?: string }; message?: string })?.error?.message
            ?? (err as { message?: string })?.message ?? 'Please try again';
          this.errorMessage = msg;
          this.cdr.markForCheck();
        },
      });
  }

  private resetForm(): void {
    this.selectedSetId  = this.preselectedSetId ?? null;
    this.deadline       = '';
    this.sets           = [];
    this.isLoading      = false;
    this.isSubmitting   = false;
    this.errorMessage   = null;
    this.cdr.markForCheck();
  }

  private loadSets(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.api
      .getAllSets()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sets) => {
          this.sets      = sets ?? [];
          this.isLoading = false;
          /** Auto-select preselected set if it exists in the loaded list */
          if (this.preselectedSetId && this.sets.some((s) => s._id === this.preselectedSetId)) {
            this.selectedSetId = this.preselectedSetId;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }
}
