import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AlertService } from '../../../services/alert.service';
import { ClassApiService, BackendClass } from '../../../api/class-api.service';
import type { FlashcardSet } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-flashcard-assign',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './flashcard-assign.html',
  styleUrl: './flashcard-assign.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardAssign implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly classApi = inject(ClassApiService);
  private readonly fb = inject(FormBuilder);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  set: FlashcardSet | null = null;
  classes: BackendClass[] = [];
  isLoading = false;
  isClassesLoading = false;
  isSubmitting = false;
  errorMsg: string | null = null;

  readonly assignForm = this.fb.group({
    classId: ['', Validators.required],
    title: ['', Validators.required],
    deadline: ['', Validators.required],
  });

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get displayTitle(): string {
    return this.set?.title?.trim() || 'Untitled Flashcard Set';
  }

  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnInit(): void {
    this.loadSet();
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSet(): void {
    this.isLoading = true;
    this.flashcardApi.getSetById(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.set = data;
        this.assignForm.patchValue({ title: data.title ?? '' });
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        this.errorMsg = err?.message ?? 'Failed to load flashcard set.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private async loadClasses(): Promise<void> {
    this.isClassesLoading = true;
    this.cdr.markForCheck();
    try {
      this.classes = await this.classApi.getMyTeacherClasses();
      /** Auto-select if returnToClassId matches one of the loaded classes */
      const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
      if (returnToClassId && this.classes.some((c) => c._id === returnToClassId)) {
        this.assignForm.patchValue({ classId: returnToClassId });
      } else if (this.classes.length === 1) {
        this.assignForm.patchValue({ classId: this.classes[0]._id });
      }
    } catch {
      this.errorMsg = 'Failed to load your classes.';
    } finally {
      this.isClassesLoading = false;
      this.cdr.markForCheck();
    }
  }

  private getReturnToClassId(): string | null {
    return this.route.snapshot.queryParamMap.get('returnToClassId');
  }

  submit(): void {
    if (this.assignForm.invalid || this.isSubmitting) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const { classId, title, deadline } = this.assignForm.value;
    if (!classId || !title || !deadline) {
      this.alert.showError('Missing fields', 'Please fill in all required fields.');
      return;
    }

    const deadlineDate = new Date(`${deadline}T23:59:59.999`);
    if (isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      this.alert.showError('Invalid deadline', 'Deadline must be a future date.');
      return;
    }

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.flashcardApi
      .assignSet(this.setId, {
        classId,
        title,
        deadline: deadlineDate.toISOString(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          this.alert.showSuccess('Assigned!', `"${title}" has been assigned to the class.`);
          const returnToClassId = this.getReturnToClassId();
          if (returnToClassId) {
            this.router.navigate(['/teacher/my-classes/detail', returnToClassId]);
          } else {
            this.router.navigate(['/teacher/my-classes/detail', classId]);
          }
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
          const msg = (err as { error?: { message?: string }; message?: string })?.error?.message
            ?? (err as { message?: string })?.message ?? 'Please try again';
          this.alert.showError('Assignment failed', msg);
        },
      });
  }

  cancel(): void {
    this.router.navigate(['/flashcards', this.setId]);
  }

  dismissError(): void {
    this.errorMsg = null;
    this.cdr.markForCheck();
  }
}
