import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import type { RubricDesigner } from '../../../models/submission-feedback.model';

@Component({
  selector: 'app-rubric-designer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ModalDialog],
  templateUrl: './rubric-designer-modal.html',
  styleUrl: './rubric-designer-modal.css',
})
export class RubricDesignerModal implements OnDestroy {
  @Input() open = false;

  @Input() rubricDesigner: RubricDesigner | null = null;

  @Input() defaultTitle = 'Rubric';

  @Input() isGenerating = false;
  @Input() isSaving = false;
  @Input() isAttaching = false;

  @Output() closed = new EventEmitter<void>();

  @Output() save = new EventEmitter<RubricDesigner>();
  @Output() generateAi = new EventEmitter<string>();
  @Output() attachFile = new EventEmitter<File>();
  @Output() useExisting = new EventEmitter<void>();
  @Output() saveToLibrary = new EventEmitter<RubricDesigner>();

  rubricDesignerTitle = '';
  rubricLevels: Array<{ title: string; maxPoints: number | null }> = [];
  rubricCriteriaRows: Array<{ title: string; weight: number | null; cells: string[] }> = [];

  readonly rubricPromptControl = new FormControl('', { nonNullable: true });
  private generationAwaitingApplication = false;
  private bodyOverflowBeforeOpen: string | null = null;
  validationMessage = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) this.syncBodyScrollLock();
    this.hydrateFromInput();
    if (this.generationAwaitingApplication && changes['rubricDesigner'] && this.hasValidGeneratedRubric(this.rubricDesigner)) {
      this.rubricPromptControl.reset('');
      this.generationAwaitingApplication = false;
    }
  }

  ngOnInit(): void {
    this.hydrateFromInput();
    this.syncBodyScrollLock();
  }

  ngOnDestroy(): void { this.releaseBodyScrollLock(); }

  closeDialog() {
    this.validationMessage = '';
    this.closed.emit();
  }

  private syncBodyScrollLock(): void {
    if (typeof document === 'undefined') return;
    if (this.open && this.bodyOverflowBeforeOpen === null) {
      this.bodyOverflowBeforeOpen = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else if (!this.open) this.releaseBodyScrollLock();
  }

  private releaseBodyScrollLock(): void {
    if (typeof document === 'undefined' || this.bodyOverflowBeforeOpen === null) return;
    document.body.style.overflow = this.bodyOverflowBeforeOpen;
    this.bodyOverflowBeforeOpen = null;
  }

  private hydrateFromInput(): void {
    const d = this.rubricDesigner;
    if (!d) {
      this.resetRubricDesigner();
      return;
    }

    const levelsRaw = Array.isArray(d.levels) ? d.levels : [];
    const criteriaRaw = Array.isArray(d.criteria) ? d.criteria : [];

    this.rubricDesignerTitle = typeof d.title === 'string' && d.title.trim().length ? d.title : this.defaultTitle;

    this.rubricLevels = levelsRaw.length
      ? levelsRaw.map((l: any) => {
          const title = String((l as any)?.title || '');
          const rawPoints = this.coercePointsInput((l as any)?.maxPoints);
          const maxPoints = !title.trim().length && rawPoints === 0 ? null : (rawPoints ?? null);
          return { title, maxPoints };
        })
      : Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null }));

    this.rubricCriteriaRows = criteriaRaw.length
      ? criteriaRaw.map((c: any) => ({
          title: String(c?.title || ''),
          weight: this.coerceWeightInput(c?.weight),
          cells: this.rubricLevels.map((_, i) => this.coerceCellText(Array.isArray(c?.cells) ? c.cells[i] : ''))
        }))
      : [{ title: '', weight: null, cells: this.rubricLevels.map(() => '') }];
  }

  private resetRubricDesigner() {
    this.rubricDesignerTitle = this.defaultTitle;
    this.rubricLevels = Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null }));
    this.rubricCriteriaRows = [{ title: '', weight: null, cells: this.rubricLevels.map(() => '') }];
  }

  addRubricLevelColumn() {
    if (this.rubricLevels.length >= 5) return;
    this.rubricLevels = [...this.rubricLevels, { title: '', maxPoints: null }];
    this.rubricCriteriaRows = this.rubricCriteriaRows.map((r) => ({ ...r, cells: [...r.cells, ''] }));
  }

  removeRubricLevelColumn(index: number) {
    if (!Number.isFinite(index)) return;
    if (this.rubricLevels.length <= 1) return;
    if (index < 0 || index >= this.rubricLevels.length) return;

    this.rubricLevels = this.rubricLevels.filter((_, i) => i !== index);
    this.rubricCriteriaRows = this.rubricCriteriaRows.map((r) => ({
      ...r,
      cells: (Array.isArray(r.cells) ? r.cells : []).filter((_, i) => i !== index)
    }));
  }

  addRubricCriteriaRow() {
    this.rubricCriteriaRows = [
      ...this.rubricCriteriaRows,
      {
        title: '',
        weight: null,
        cells: this.rubricLevels.map(() => '')
      }
    ];
  }

  removeRubricCriteriaRow(index: number) {
    if (this.rubricCriteriaRows.length <= 1) return;
    this.rubricCriteriaRows = this.rubricCriteriaRows.filter((_, i) => i !== index);
  }

  coercePointsInput(value: any): number | null {
    if (value === '' || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  coerceWeightInput(value: any): number | null {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
  }

  get totalCriterionWeight(): number {
    return this.rubricCriteriaRows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
  }

  get isCriterionWeightTotalValid(): boolean {
    return this.rubricCriteriaRows.length >= 3 && this.totalCriterionWeight === 100
      && this.rubricCriteriaRows.every((row) => Number.isFinite(Number(row.weight)) && Number(row.weight) > 0);
  }

  private isRubricDesignerStateEmpty(): boolean {
    const anyLevelTitle = (Array.isArray(this.rubricLevels) ? this.rubricLevels : []).some((l) => String(l?.title || '').trim().length);
    const anyCriteriaTitle = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => String(r?.title || '').trim().length);
    const anyCell = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => (Array.isArray(r?.cells) ? r.cells : []).some((c) => String(c || '').trim().length));
    return !anyLevelTitle && !anyCriteriaTitle && !anyCell;
  }

  private get rubricDesignerFromState(): RubricDesigner {
    return {
      title: this.rubricDesignerTitle,
      totalPoints: 100,
      levels: this.rubricLevels.map((l) => ({
        title: String(l.title || ''),
        maxPoints: Number(l.maxPoints) || 0
      })),
      criteria: this.rubricCriteriaRows.map((r) => ({
        title: String(r.title || ''),
        weight: Number(r.weight) || 0,
        cells: Array.isArray(r.cells) ? r.cells.map((x) => String(x || '')) : []
      }))
    };
  }

  onGenerateRubricAi() {
    if (this.isGenerating) return;
    const prompt = this.rubricPromptControl.value.trim();
    if (!prompt) {
      this.validationMessage = 'Describe the rubric you want to generate.';
      return;
    }
    this.validationMessage = '';
    this.generationAwaitingApplication = true;
    this.generateAi.emit(prompt);
  }

  private hasValidGeneratedRubric(value: RubricDesigner | null): boolean {
    return Boolean(value && value.totalPoints === 100 && Array.isArray(value.criteria)
      && value.criteria.reduce((sum, row) => sum + (Number(row.weight) || 0), 0) === 100);
  }

  private coerceCellText(value: any): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      const obj: any = value;
      const preferred = [obj?.description, obj?.text, obj?.content, obj?.value, obj?.label];
      for (const x of preferred) {
        const s = typeof x === 'string' ? x : (x == null ? '' : String(x));
        if (s.trim().length) return s;
      }
      try {
        return JSON.stringify(obj).slice(0, 2000);
      } catch {
        return '';
      }
    }
    return '';
  }

  onSaveRubric() {
    if (!this.validateCurrentRubric()) return;
    this.save.emit(this.rubricDesignerFromState);
  }

  onUseExisting(): void { this.validationMessage = ''; this.useExisting.emit(); }

  onSaveToLibrary(): void {
    if (!this.validateCurrentRubric() || this.isSaving) return;
    this.saveToLibrary.emit(structuredClone(this.rubricDesignerFromState));
  }

  applyRubric(designer: RubricDesigner): void {
    this.rubricDesigner = structuredClone(designer);
    this.hydrateFromInput();
    this.validationMessage = '';
  }

  private validateCurrentRubric(): boolean {
    if (this.isRubricDesignerStateEmpty()) {
      this.validationMessage = 'Add at least one complete rubric criterion.';
      return false;
    }
    if (!this.isCriterionWeightTotalValid) {
      this.validationMessage = 'Use at least three criteria with positive weights totaling 100.';
      return false;
    }
    if (this.rubricLevels.some((level) => !level.title.trim() || level.maxPoints == null)
      || this.rubricCriteriaRows.some((row) => !row.title.trim()
        || row.cells.length !== this.rubricLevels.length || row.cells.some((cell) => !cell.trim()))) {
      this.validationMessage = 'Complete every criterion, performance level, score, and description.';
      return false;
    }
    this.validationMessage = '';
    return true;
  }

  onRubricFileSelected(ev: Event) {
    const el = ev.target as HTMLInputElement | null;
    if (!el?.files?.length) return;
    const file = el.files[0];
    this.attachFile.emit(file);
    el.value = '';
  }
}
