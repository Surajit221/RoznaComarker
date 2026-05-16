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
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { WorksheetApiService, type Worksheet } from '../../../api/worksheet-api.service';
import { ClassApiService, type BackendClass } from '../../../api/class-api.service';
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
  @Output() assigned   = new EventEmitter<{ classId: string }>();

  private readonly api      = inject(WorksheetApiService);
  private readonly router   = inject(Router);
  private readonly classApi = inject(ClassApiService);
  private readonly alert    = inject(AlertService);
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  worksheets: Worksheet[] = [];
  isLoading    = false;
  isSubmitting = false;
  selectedId: string | null = null;

  classes: BackendClass[] = [];
  isLoadingClasses = false;
  selectedClassId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.resetForm();
      this.loadWorksheets();
      if (!this.classId) {
        this.loadClasses();
      }
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

  openWorksheetLibrary(): void {
    this.close();
    this.router.navigate(['/worksheets']);
  }

  submit(): void {
    if (this.isSubmitting) return;

    if (!this.selectedId) {
      this.alert.showError('No worksheet selected', 'Please choose a worksheet.');
      return;
    }
    const classIdToUse = this.classId || this.selectedClassId;
    if (!classIdToUse) {
      this.alert.showError('Missing class', 'Please select a class.');
      return;
    }

    const selected = this.worksheets.find((w) => w._id === this.selectedId);
    const title = selected?.title ?? 'Worksheet Assignment';

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.api
      .assignToClass(this.selectedId, {
        classId: classIdToUse,
        title,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          this.assigned.emit({ classId: classIdToUse });
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
    this.worksheets  = [];
    this.isLoading   = false;
    this.isSubmitting = false;

    this.classes = [];
    this.isLoadingClasses = false;
    this.selectedClassId = null;
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

  private loadClasses(): void {
    this.isLoadingClasses = true;
    this.cdr.markForCheck();
    this.classApi.getMyTeacherClasses()
      .then((classes) => {
        this.classes = classes || [];
        this.isLoadingClasses = false;
        if (!this.selectedClassId && this.classes.length === 1) {
          this.selectedClassId = this.classes[0]._id;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingClasses = false;
        this.cdr.markForCheck();
      });
  }
}
