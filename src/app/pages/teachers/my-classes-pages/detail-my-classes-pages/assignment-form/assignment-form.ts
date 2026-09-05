import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
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
import { FormsModule } from '@angular/forms';
import { RubricLibrarySelector } from '../../../../../components/teacher/rubric-library-selector/rubric-library-selector';
import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';
import { RubricApiService, type SavedRubric } from '../../../../../api/rubric-api.service';
import { RubricLibraryStateService } from '../../../../../services/rubric-library-state.service';
import { designerToRubricData, rubricDataToDesigner } from '../../../../../utils/rubric-library.util';
import { getAssignmentCapabilities } from '../../../../../utils/assignment-capabilities';

@Component({
  selector: 'app-assignment-form',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RubricDesignerModal, RubricLibrarySelector, ModalDialog],
  templateUrl: './assignment-form.html',
  styleUrl: './assignment-form.css',
})
export class AssignmentForm {
  @ViewChild(RubricDesignerModal) rubricEditor?: RubricDesignerModal;
  classForm: FormGroup;
  @Input() classId: string | null = null;
  @Input() assignment: BackendAssignment | null = null;
  @Output() created = new EventEmitter<BackendAssignment>();
  @Output() updated = new EventEmitter<BackendAssignment>();
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);
  private assignmentApi = inject(AssignmentApiService);
  private alert = inject(AlertService);
  private rubricApi = inject(RubricApiService);
  private rubricLibraryState = inject(RubricLibraryStateService);

  isSubmitting = false;
  isRubricDialogOpen = false;
  rubricDesignerForModal: RubricDesigner | null = null;
  isRubricSaving = false;
  isRubricGenerating = false;
  isRubricSelectorOpen = false;
  isSaveToLibraryOpen = false;
  isSavingToLibrary = false;
  libraryName = '';
  libraryDescription = '';
  private libraryRubricDraft: RubricDesigner | null = null;
  get capabilities() { return getAssignmentCapabilities(this.assignment); }
  get isResourceAssignment(): boolean { return !this.capabilities.writingControls; }

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
    const writingTypeControl = this.classForm.get('writingType');
    const messageControl = this.classForm.get('message');
    if (!getAssignmentCapabilities(a).writingControls) {
      writingTypeControl?.clearValidators();
      messageControl?.setValidators([Validators.maxLength(500)]);
    } else {
      writingTypeControl?.setValidators([Validators.required]);
      messageControl?.setValidators([Validators.required, Validators.minLength(10), Validators.maxLength(500)]);
    }
    writingTypeControl?.updateValueAndValidity({ emitEvent: false });
    messageControl?.updateValueAndValidity({ emitEvent: false });
    if (a) {
      const deadline = a.deadline ? new Date(a.deadline) : null;
      const dateOnly = deadline && !Number.isNaN(deadline.getTime()) ? deadline.toISOString().split('T')[0] : '';

      this.classForm.reset();
      this.classForm.patchValue({
        className: a.title || '',
        writingType: a.writingType || '',
        startDate: dateOnly,
        message: a.instructions || '',
        showMarksToStudent: a.showMarksToStudent !== false,
        allowResubmission: a.allowResubmission === true,
        requireAdaptiveBeforeResubmission:
          a.allowResubmission === true && a.requireAdaptiveBeforeResubmission === true
      });
      
      // Load existing rubric if present
      this.loadRubricFromAssignment(a);
      return;
    }

    this.classForm.reset();
    const today = new Date().toISOString().split('T')[0];
    this.classForm.get('startDate')?.setValue(today);
    this.classForm.patchValue({
      showMarksToStudent: true,
      allowResubmission: false,
      requireAdaptiveBeforeResubmission: false
    });
    
    // A new assignment must be persisted before any rubric workflow starts.
    this.rubricDesignerForModal = null;
  }

  createForm(): FormGroup {
    return this.fb.group(
      {
        className: ['', [Validators.required, Validators.minLength(3)]],
        writingType: ['', Validators.required],
        startDate: ['', Validators.required],
        message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
        showMarksToStudent: [true],
        allowResubmission: [false],
        requireAdaptiveBeforeResubmission: [false],
      }
    );
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.classForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  onAllowResubmissionChange(): void {
    if (this.classForm.value.allowResubmission !== true) {
      this.classForm.get('requireAdaptiveBeforeResubmission')?.setValue(false);
    }
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
      };
      if (this.capabilities.showMarksToStudent) payload.showMarksToStudent = this.classForm.value.showMarksToStudent === true;
      if (this.capabilities.allowResubmission) payload.allowResubmission = this.classForm.value.allowResubmission === true;
      if (this.capabilities.requireAdaptiveBeforeResubmission) payload.requireAdaptiveBeforeResubmission =
        this.classForm.value.allowResubmission === true && this.classForm.value.requireAdaptiveBeforeResubmission === true;
      if (!this.isResourceAssignment) payload.writingType = writingType;
      
      // Existing assignments retain their rubric edit support. Creation never
      // sends a draft rubric: the parent opens the persisted-assignment editor.
      if (this.assignment?._id && this.rubricDesignerForModal) {
        payload.rubrics = {
          totalPoints: 100,
          criteria: this.rubricDesignerForModal.criteria.map(c => ({
            name: c.title,
            weight: Number(c.weight) || 0,
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
        this.alert.showToast('Assignment updated successfully', 'success');
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

      this.alert.showToast('Assignment created successfully', 'success');
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

  openExistingRubricSelector(): void { this.isRubricSelectorOpen = true; }

  async useExistingRubric(saved: SavedRubric): Promise<void> {
    if (this.rubricDesignerForModal) {
      const confirmed = await this.alert.showConfirm(
        'Replace assignment rubric?',
        `This assignment already has a rubric. Replace it with “${saved.name}”? Existing graded work follows the current assignment update rules.`
      );
      if (!confirmed) return;
    }
    const imported = rubricDataToDesigner(saved.rubricData, saved.name);
    this.rubricDesignerForModal = structuredClone(imported);
    this.rubricEditor?.applyRubric(imported);
    this.isRubricSelectorOpen = false;
    this.alert.showToast('Saved rubric copied into assignment', 'success');
  }

  openSaveToLibrary(designer?: RubricDesigner): void {
    const current = designer || this.rubricDesignerForModal;
    if (!current) return;
    this.libraryRubricDraft = structuredClone(current);
    this.libraryName = (this.assignment?.title || this.classForm.value.className || 'Assignment Rubric').trim();
    this.libraryDescription = '';
    this.isSaveToLibraryOpen = true;
  }

  async saveCurrentRubricToLibrary(): Promise<void> {
    const rubricToSave = this.libraryRubricDraft || this.rubricDesignerForModal;
    if (this.isSavingToLibrary || !rubricToSave || !this.libraryName.trim()) return;
    this.isSavingToLibrary = true;
    try {
      const saved = await this.rubricApi.createSavedRubric({
        name: this.libraryName.trim(),
        description: this.libraryDescription.trim() || undefined,
        writingType: this.classForm.value.writingType || this.assignment?.writingType || undefined,
        rubricData: designerToRubricData(rubricToSave)
      });
      this.rubricLibraryState.upsert(saved);
      this.isSaveToLibraryOpen = false;
      this.libraryRubricDraft = null;
      this.alert.showToast('Rubric saved to library', 'success');
    } catch (error: any) {
      this.alert.showError('Unable to save rubric', error?.error?.message || 'Please review the rubric and try again.');
    } finally { this.isSavingToLibrary = false; }
  }

  async onRubricGenerateAi(prompt: string): Promise<void> {
    if (this.isRubricGenerating) return;
    this.isRubricGenerating = true;
    try {
      const context = {
        title: String(this.classForm.value.className || '').trim(),
        writingType: String(this.classForm.value.writingType || '').trim(),
        instructions: String(this.classForm.value.message || '').trim()
      };
      const designer = this.assignment?._id
        ? await this.assignmentApi.generateRubricDesignerFromPrompt(this.assignment._id, prompt)
        : await this.assignmentApi.generateDraftRubricDesignerFromPrompt(prompt, context);
      this.rubricDesignerForModal = structuredClone(designer);
      this.rubricEditor?.applyRubric(designer);
    } catch (error: any) {
      this.alert.showError('Generate Rubric failed', error?.error?.message || error?.message || 'Please try again.');
    } finally { this.isRubricGenerating = false; }
  }

  async onRubricFileAttach(file: File): Promise<void> {
    if (!this.assignment?._id) {
      this.alert.showError('Import unavailable', 'Save the assignment before importing a rubric file.');
      return;
    }
    try {
      const updated = await this.assignmentApi.uploadRubricFile(this.assignment._id, file);
      this.loadRubricFromAssignment(updated);
      if (this.rubricDesignerForModal) this.rubricEditor?.applyRubric(this.rubricDesignerForModal);
    } catch (error: any) {
      this.alert.showError('Unable to import rubric', error?.error?.message || 'Please try again.');
    }
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
        weight: Number(c?.weight) || 0,
        cells: levels.map((_lvl: any, i: number) => String(rowLevels[i]?.description ?? ''))
      };
    });

    return {
      title: `Rubric: ${assignmentTitle}`,
      totalPoints: Number(obj.totalPoints) || 100,
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
      totalPoints: Number(obj.totalPoints) || 100,
      levels: levels.map((l: any) => ({
        title: typeof l?.title === 'string' ? String(l.title) : '',
        maxPoints: Number(l?.maxPoints) || 0
      })),
      criteria: criteria.map((c: any) => ({
        title: typeof c?.title === 'string' ? String(c.title) : '',
        weight: Number(c?.weight) || 0,
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
