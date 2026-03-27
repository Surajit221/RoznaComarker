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
import { RubricDesignerModal } from '../../../../../components/teacher/rubric-designer-modal/rubric-designer-modal';
import type { RubricDesigner } from '../../../../../models/submission-feedback.model';

@Component({
  selector: 'app-assignment-form',
  imports: [CommonModule, ReactiveFormsModule, RubricDesignerModal],
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
  isRubricDialogOpen = false;
  rubricDesignerForModal: RubricDesigner | null = null;
  isRubricSaving = false;

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
      
      // Load existing rubric if present
      this.loadRubricFromAssignment(a);
      return;
    }

    this.classForm.reset();
    const today = new Date().toISOString().split('T')[0];
    this.classForm.get('startDate')?.setValue(today);
    
    // Reset rubric for new assignment
    this.rubricDesignerForModal = null;
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

      const payload: any = {
        title,
        deadline,
        instructions,
        writingType
      };
      
      // Include rubric if it exists
      if (this.rubricDesignerForModal) {
        payload.rubrics = {
          criteria: this.rubricDesignerForModal.criteria.map(c => ({
            name: c.title,
            levels: this.rubricDesignerForModal!.levels.map((lvl, i) => ({
              title: lvl.title,
              score: lvl.maxPoints,
              description: c.cells[i] || ''
            }))
          }))
        };
      }

      if (this.assignment?._id) {
        const updated = await this.assignmentApi.updateAssignment(this.assignment._id, payload);
        this.updated.emit(updated);
        this.closeDialog();
        return;
      }

      const classId = this.classId;
      if (!classId) {
        this.alert.showError('Missing class', 'Unable to create assignment: class id is missing.');
        return;
      }

      payload.classId = classId;
      const created = await this.assignmentApi.createAssignment(payload);

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

  openRubricDesignerDialog() {
    this.isRubricDialogOpen = true;
  }

  closeRubricDesignerDialog() {
    this.isRubricDialogOpen = false;
  }

  private loadRubricFromAssignment(assignment: BackendAssignment) {
    const rubrics = (assignment as any)?.rubrics;
    const rubric = (assignment as any)?.rubric;
    
    if (rubrics) {
      this.rubricDesignerForModal = this.parseRubricDesignerFromRubricsField(rubrics, assignment.title);
    } else if (rubric) {
      this.rubricDesignerForModal = this.parseLegacyRubricDesigner(rubric, assignment.title);
    } else {
      this.rubricDesignerForModal = null;
    }
  }

  private parseRubricDesignerFromRubricsField(value: any, assignmentTitle: string): RubricDesigner | null {
    const obj = value && typeof value === 'object' ? value : null;
    const criteriaRaw = Array.isArray(obj?.criteria) ? obj.criteria : null;
    if (!criteriaRaw) return null;

    const first = criteriaRaw[0] && typeof criteriaRaw[0] === 'object' ? criteriaRaw[0] : null;
    const levelsRaw = Array.isArray((first as any)?.levels) ? (first as any).levels : [];
    if (!levelsRaw.length) return null;

    const levels = levelsRaw.map((l: any) => ({
      title: typeof l?.title === 'string' ? String(l.title) : '',
      maxPoints: Number(l?.score) || 0
    }));

    const criteria = criteriaRaw.map((c: any) => {
      const rowLevels = Array.isArray(c?.levels) ? c.levels : [];
      return {
        title: typeof c?.name === 'string' ? String(c.name) : '',
        cells: levels.map((_lvl: any, i: number) => String(rowLevels[i]?.description ?? ''))
      };
    });

    return {
      title: `Rubric: ${assignmentTitle}`,
      levels,
      criteria
    };
  }

  private parseLegacyRubricDesigner(value: any, assignmentTitle: string): RubricDesigner | null {
    if (!value) return null;
    let obj;
    if (typeof value === 'string') {
      try {
        obj = JSON.parse(value);
      } catch {
        return null;
      }
    } else {
      obj = value;
    }
    
    if (!obj || typeof obj !== 'object') return null;

    const levels = Array.isArray(obj.levels) ? obj.levels : null;
    const criteria = Array.isArray(obj.criteria) ? obj.criteria : null;
    if (!levels || !criteria) return null;

    return {
      title: typeof obj.title === 'string' ? obj.title : `Rubric: ${assignmentTitle}`,
      levels: levels.map((l: any) => ({
        title: typeof l?.title === 'string' ? String(l.title) : '',
        maxPoints: Number(l?.maxPoints) || 0
      })),
      criteria: criteria.map((c: any) => ({
        title: typeof c?.title === 'string' ? String(c.title) : '',
        cells: Array.isArray(c?.cells) ? c.cells.map((x: any) => String(x ?? '')) : []
      }))
    };
  }

  async onRubricDesignerSave(designer: RubricDesigner) {
    if (!designer) return;
    if (this.isRubricSaving) return;

    this.isRubricSaving = true;
    try {
      this.rubricDesignerForModal = designer;
      this.alert.showToast('Rubric saved successfully', 'success');
      this.closeRubricDesignerDialog();
    } catch (err: any) {
      this.alert.showError('Failed to save rubric', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRubricSaving = false;
    }
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.classForm.controls).forEach((key) => {
      const control = this.classForm.get(key);
      control?.markAsTouched();
    });
  }
}
