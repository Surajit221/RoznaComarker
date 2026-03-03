import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output, SimpleChanges } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DeviceService } from '../../../../../services/device.service';
import { AlertService } from '../../../../../services/alert.service';
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';

@Component({
  selector: 'app-assignment-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './assignment-form.html',
  styleUrl: './assignment-form.css',
})
export class AssignmentForm {
  classForm: FormGroup;
  @Input() classId: string | null = null;
  @Input() assignment: BackendAssignment | null = null;
  @Output() created = new EventEmitter<BackendAssignment>();
  @Output() updated = new EventEmitter<BackendAssignment>();
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);
  private assignmentApi = inject(AssignmentApiService);
  private alert = inject(AlertService);

  isSubmitting = false;

  constructor(private fb: FormBuilder) {
    this.classForm = this.createForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignment']) {
      this.applyAssignmentToForm();
    }
  }

  ngOnInit(): void {
    this.applyAssignmentToForm();
  }

  private applyAssignmentToForm(): void {
    const a = this.assignment;
    if (a) {
      const deadline = a.deadline ? new Date(a.deadline) : null;
      const dateOnly = deadline && !Number.isNaN(deadline.getTime()) ? deadline.toISOString().split('T')[0] : '';

      this.classForm.reset();
      this.classForm.patchValue({
        className: a.title || '',
        writingType: a.writingType || '',
        startDate: dateOnly,
        message: a.instructions || ''
      });
      return;
    }

    this.classForm.reset();
    const today = new Date().toISOString().split('T')[0];
    this.classForm.get('startDate')?.setValue(today);
  }

  createForm(): FormGroup {
    return this.fb.group(
      {
        className: ['', [Validators.required, Validators.minLength(3)]],
        writingType: ['', Validators.required],
        startDate: ['', Validators.required],
        message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
      }
    );
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.classForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onSubmit(): void {
    if (this.isSubmitting) return;
    void this.handleSubmit();
  }

  private async handleSubmit() {
    if (this.isSubmitting) return;

    if (!this.classForm.valid) {
      this.markAllFieldsAsTouched();
      return;
    }

    try {
      this.isSubmitting = true;

      const title = this.classForm.value.className;
      const instructions = this.classForm.value.message;
      const writingType = this.classForm.value.writingType;
      const deadlineDateOnly = this.classForm.value.startDate;

      const now = new Date();
      const deadlineDate = new Date(`${deadlineDateOnly}T23:59:59.999`);
      if (Number.isNaN(deadlineDate.getTime())) {
        this.alert.showError('Invalid deadline', 'Please select a valid deadline date.');
        return;
      }

      if (deadlineDate.getTime() <= now.getTime()) {
        this.alert.showError(
          'Invalid deadline',
          'Deadline must be in the future. Please pick a later date.'
        );
        return;
      }

      const deadline = deadlineDate.toISOString();

      if (this.assignment?._id) {
        const updated = await this.assignmentApi.updateAssignment(this.assignment._id, {
          title,
          deadline,
          instructions,
          writingType
        });
        this.updated.emit(updated);
        this.closeDialog();
        return;
      }

      const classId = this.classId;
      if (!classId) {
        this.alert.showError('Missing class', 'Unable to create assignment: class id is missing.');
        return;
      }

      const created = await this.assignmentApi.createAssignment({
        title,
        classId,
        deadline,
        instructions,
        writingType
      });

      this.created.emit(created);
      this.closeDialog();
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Please try again';
      this.alert.showError(this.assignment?._id ? 'Failed to update assignment' : 'Failed to create assignment', message);
    } finally {
      this.isSubmitting = false;
    }
  }

  onReset(): void {
    this.classForm.reset();
    this.ngOnInit();
  }

  closeDialog() {
    this.closed.emit();
    this.onReset();
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.classForm.controls).forEach((key) => {
      const control = this.classForm.get(key);
      control?.markAsTouched();
    });
  }
}
