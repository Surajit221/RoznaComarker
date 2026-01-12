import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
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
  @Output() created = new EventEmitter<BackendAssignment>();
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);
  private assignmentApi = inject(AssignmentApiService);
  private alert = inject(AlertService);

  constructor(private fb: FormBuilder) {
    this.classForm = this.createForm();
  }

  ngOnInit(): void {
    const today = new Date().toISOString().split('T')[0];
    this.classForm.get('startDate')?.setValue(today);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    this.classForm.get('endDate')?.setValue(nextWeek.toISOString().split('T')[0]);
  }

  createForm(): FormGroup {
    return this.fb.group(
      {
        className: ['', [Validators.required, Validators.minLength(3)]],
        role: ['', Validators.required],
        startDate: ['', Validators.required],
        endDate: ['', Validators.required],
        message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
      },
      { validators: this.dateValidator }
    );
  }

  dateValidator(form: AbstractControl) {
    const startDate = form.get('startDate')?.value;
    const endDate = form.get('endDate')?.value;

    if (!startDate || !endDate) {
      return null;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    return end >= start ? null : { dateRange: true };
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.classForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onSubmit(): void {
    void this.handleSubmit();
  }

  private async handleSubmit() {
    if (!this.classForm.valid) {
      this.markAllFieldsAsTouched();
      return;
    }

    const classId = this.classId;
    if (!classId) {
      this.alert.showError('Missing class', 'Unable to create assignment: class id is missing.');
      return;
    }

    try {
      const title = this.classForm.value.className;
      const instructions = this.classForm.value.message;
      const endDate = this.classForm.value.endDate;

      const deadlineDate = new Date(endDate);
      const deadline = deadlineDate.toISOString();

      const created = await this.assignmentApi.createAssignment({
        title,
        classId,
        deadline,
        instructions
      });

      this.created.emit(created);
      this.closeDialog();
    } catch (err: any) {
      this.alert.showError('Failed to create assignment', err?.message || 'Please try again');
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
