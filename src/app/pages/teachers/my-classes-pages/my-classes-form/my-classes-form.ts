import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DeviceService } from '../../../../services/device.service';
import { AlertService } from '../../../../services/alert.service';
import { ClassApiService, type BackendClass } from '../../../../api/class-api.service';

@Component({
  selector: 'app-my-classes-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './my-classes-form.html',
  styleUrl: './my-classes-form.css',
})
export class MyClassesForm {
  classForm: FormGroup;
  device = inject(DeviceService);
  private classApi = inject(ClassApiService);
  private alert = inject(AlertService);

  @Output() created = new EventEmitter<BackendClass>();
  @Output() closed = new EventEmitter<void>();
  dismissible: any;

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

    try {
      const name = this.classForm.value.className;
      const description = this.classForm.value.message;

      const created = await this.classApi.createClass({
        name,
        description
      });

      this.created.emit(created);
      this.closeDialog();
      this.onReset();
    } catch (err: any) {
      this.alert.showError('Failed to create class', err?.message || 'Please try again');
    }
  }

  onReset(): void {
    this.classForm.reset();
    this.ngOnInit();
  }

  closeDialog() {
    this.closed.emit();
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.classForm.controls).forEach((key) => {
      const control = this.classForm.get(key);
      control?.markAsTouched();
    });
  }
}
