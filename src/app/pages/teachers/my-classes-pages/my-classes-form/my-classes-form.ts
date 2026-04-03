import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
export class MyClassesForm implements OnChanges {
  classForm: FormGroup;
  device = inject(DeviceService);
  private classApi = inject(ClassApiService);
  private alert = inject(AlertService);
  isSubmitting = false;

  @Input() mode: 'create' | 'edit' = 'create';
  @Input() classId: string | null = null;
  @Input() classData: BackendClass | null = null;

  @Output() created = new EventEmitter<BackendClass>();
  @Output() updated = new EventEmitter<BackendClass>();
  @Output() closed = new EventEmitter<void>();
  dismissible: any;

  constructor(private fb: FormBuilder) {
    this.classForm = this.createForm();
  }

  ngOnInit(): void {
    this.applyModeDefaults();
    this.patchFromClassData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] || changes['classData']) {
      this.applyModeDefaults();
      this.patchFromClassData();
    }
  }

  createForm(): FormGroup {
    return this.fb.group(
      {
        className: ['', [Validators.required, Validators.minLength(3)]],
        subjectLevel: [''],
        startDate: [''],
        endDate: [''],
        description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]]
      },
      { validators: this.dateValidator }
    );
  }

  private applyModeDefaults(): void {
    if (this.mode === 'edit') return;

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    this.classForm.patchValue({
      className: '',
      subjectLevel: '',
      startDate: today,
      endDate: nextWeek.toISOString().split('T')[0],
      description: ''
    }, { emitEvent: false });
  }

  private patchFromClassData(): void {
    const classData = this.classData;
    if (!classData || !classData._id) return;

    this.classForm.patchValue(
      {
        className: classData.name || '',
        subjectLevel: classData.subjectLevel || '',
        startDate: this.normalizeDateInput(classData.startDate),
        endDate: this.normalizeDateInput(classData.endDate),
        description: classData.description || ''
      },
      { emitEvent: false }
    );
  }

  private normalizeDateInput(value?: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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

    if (this.isSubmitting) return;

    this.isSubmitting = true;

    try {
      const payload = {
        name: this.classForm.value.className,
        subjectLevel: this.classForm.value.subjectLevel || null,
        startDate: this.classForm.value.startDate || null,
        endDate: this.classForm.value.endDate || null,
        description: this.classForm.value.description || null
      };

      if (this.mode === 'edit') {
        if (!this.classId) {
          this.alert.showError('Failed to update class', 'Missing class id');
          return;
        }

        const updated = await this.classApi.updateClass(this.classId, payload);

        this.updated.emit(updated);
        this.closeDialog();
        return;
      }

      const created = await this.classApi.createClass(payload);

      this.created.emit(created);
      this.closeDialog();
      this.onReset();
    } catch (err: any) {
      const title = this.mode === 'edit' ? 'Failed to update class' : 'Failed to create class';
      this.alert.showError(title, err?.message || 'Please try again');
    } finally {
      this.isSubmitting = false;
    }
  }

  onReset(): void {
    this.classForm.reset();
    this.applyModeDefaults();
    this.patchFromClassData();
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
