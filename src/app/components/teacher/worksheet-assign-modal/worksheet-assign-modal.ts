/**
 * WorksheetAssignModal
 *
 * Teacher picks one of their saved worksheets and sets a deadline,
 * then calls worksheetApi.assignToClass(). Mirrors FlashcardAssignModal.
 *
 * Usage:
 *   <app-worksheet-assign-modal
 *     [(show)]="showWorksheetAssignModal"
 *     [classId]="classId"
 *     [preselectedWorksheetId]="preselectedWorksheetId"
 *     (assigned)="onWorksheetAssigned()">
 *   </app-worksheet-assign-modal>
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
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { WorksheetApiService, type Worksheet } from '../../../api/worksheet-api.service';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-worksheet-assign-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './worksheet-assign-modal.html',
  styleUrl: './worksheet-assign-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetAssignModal implements OnChanges, OnDestroy {
  @Input() show  = false;
  @Input() classId: string | null = null;
  @Input() preselectedWorksheetId: string | null = null;

  @Output() showChange = new EventEmitter<boolean>();
  @Output() assigned   = new EventEmitter<void>();

  private readonly api      = inject(WorksheetApiService);
  private readonly alert    = inject(AlertService);
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  worksheets: Worksheet[] = [];
  isLoading    = false;
  isSubmitting = false;
  selectedId: string | null = null;
  deadline = '';

  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.resetForm();
      this.loadWorksheets();
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
    if ((event.target as HTMLElement).classList.contains('wam-backdrop')) {
      this.close();
    }
  }

  submit(): void {
    if (this.isSubmitting) return;

    if (!this.selectedId) {
      this.alert.showError('No worksheet selected', 'Please choose a worksheet.');
      return;
    }
    if (!this.deadline) {
      this.alert.showError('No deadline', 'Please enter a deadline date.');
      return;
    }
    if (!this.classId) {
      this.alert.showError('Missing class', 'Class ID is not available.');
      return;
    }

    const deadlineDate = new Date(`${this.deadline}T23:59:59.999`);
    if (isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      this.alert.showError('Invalid deadline', 'Deadline must be a future date.');
      return;
    }

    const selected = this.worksheets.find((w) => w._id === this.selectedId);
    const title = selected?.title ?? 'Worksheet Assignment';

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.api
      .assignToClass(this.selectedId, {
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
        error: (err: any) => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          const msg = err?.error?.message ?? err?.message ?? 'Please try again';
          this.alert.showError('Assignment failed', msg);
        },
      });
  }

  private resetForm(): void {
    this.selectedId  = this.preselectedWorksheetId ?? null;
    this.deadline    = '';
    this.worksheets  = [];
    this.isLoading   = false;
    this.isSubmitting = false;
    this.cdr.markForCheck();
  }

  private loadWorksheets(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.api
      .getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.worksheets = res?.data ?? [];
          this.isLoading = false;
          if (this.preselectedWorksheetId && this.worksheets.some((w) => w._id === this.preselectedWorksheetId)) {
            this.selectedId = this.preselectedWorksheetId;
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
