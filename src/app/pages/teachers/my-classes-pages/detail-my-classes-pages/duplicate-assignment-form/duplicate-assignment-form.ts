import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, inject, Input, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';
import { ClassApiService, type BackendClass } from '../../../../../api/class-api.service';
import { getAssignmentCapabilities } from '../../../../../utils/assignment-capabilities';

export type AssignmentDuplicatedEvent = { assignment: BackendAssignment; targetClassId: string };

@Component({
  selector: 'app-duplicate-assignment-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './duplicate-assignment-form.html',
  styleUrl: './duplicate-assignment-form.css'
})
export class DuplicateAssignmentForm {
  @Input({ required: true }) assignment: BackendAssignment | null = null;
  @Input() currentClassId: string | null = null;
  @Output() duplicated = new EventEmitter<AssignmentDuplicatedEvent>();
  @Output() closed = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly assignments = inject(AssignmentApiService);
  private readonly classesApi = inject(ClassApiService);

  readonly form = this.fb.nonNullable.group({
    targetClassId: ['', Validators.required],
    title: ['', [Validators.required, Validators.minLength(3)]],
    deadline: ['', Validators.required]
  });
  classes: BackendClass[] = [];
  loadingClasses = false;
  isSubmitting = false;
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignment'] || changes['currentClassId']) this.prefill();
    if (this.assignment && !this.classes.length && !this.loadingClasses) void this.loadClasses();
  }

  get sourceTitle(): string { return this.assignment?.title || '' ; }
  get capabilities() { return getAssignmentCapabilities(this.assignment); }
  get sourceDeadlineExpired(): boolean {
    const deadline = this.assignment?.deadline ? new Date(this.assignment.deadline) : null;
    return !deadline || Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now();
  }

  private prefill(): void {
    const source = this.assignment;
    if (!source) return;
    const deadline = new Date(source.deadline);
    const futureDeadline = !Number.isNaN(deadline.getTime()) && deadline.getTime() > Date.now()
      ? deadline.toISOString().slice(0, 10) : '';
    this.form.reset({
      targetClassId: this.currentClassId || '',
      title: `${source.title} - Copy`,
      deadline: futureDeadline
    });
    this.error = '';
  }

  private async loadClasses(): Promise<void> {
    this.loadingClasses = true;
    try {
      this.classes = (await this.classesApi.getMyTeacherClasses('active'))
        .filter((item) => item.isActive !== false && item.status !== 'archived');
      const selected = this.form.controls.targetClassId.value;
      if (!this.classes.some((item) => item._id === selected)) {
        this.form.controls.targetClassId.setValue(this.classes[0]?._id || '');
      }
    } catch {
      this.error = 'Active classes could not be loaded. Please try again.';
    } finally {
      this.loadingClasses = false;
    }
  }

  async submit(): Promise<void> {
    if (this.isSubmitting) return;
    if (this.form.invalid || !this.assignment?._id) {
      this.form.markAllAsTouched();
      return;
    }
    const deadline = new Date(`${this.form.controls.deadline.value}T23:59:59.999`);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      this.form.controls.deadline.setErrors({ future: true });
      this.error = 'Choose a deadline in the future.';
      return;
    }

    this.isSubmitting = true;
    this.error = '';
    const targetClassId = this.form.controls.targetClassId.value;
    try {
      const assignment = await this.assignments.duplicateAssignment(this.assignment._id, {
        targetClassId,
        title: this.form.controls.title.value.trim(),
        deadline: deadline.toISOString()
      });
      this.duplicated.emit({ assignment, targetClassId });
    } catch (err: any) {
      this.error = err?.error?.message || 'The assignment could not be duplicated. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel(): void { if (!this.isSubmitting) this.closed.emit(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.cancel(); }
}
