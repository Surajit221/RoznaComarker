import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import type { RubricDesigner } from '../../../models/submission-feedback.model';

@Component({
  selector: 'app-rubric-designer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalDialog],
  templateUrl: './rubric-designer-modal.html',
  styleUrl: './rubric-designer-modal.css',
})
export class RubricDesignerModal {
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

  rubricDesignerTitle = '';
  rubricLevels: Array<{ title: string; maxPoints: number | null }> = [];
  rubricCriteriaRows: Array<{ title: string; cells: string[] }> = [];

  rubricPromptText = '';

  ngOnChanges(): void {
    this.hydrateFromInput();
  }

  ngOnInit(): void {
    this.hydrateFromInput();
  }

  closeDialog() {
    this.closed.emit();
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
          cells: this.rubricLevels.map((_, i) => this.coerceCellText(Array.isArray(c?.cells) ? c.cells[i] : ''))
        }))
      : [{ title: '', cells: this.rubricLevels.map(() => '') }];
  }

  private resetRubricDesigner() {
    this.rubricDesignerTitle = this.defaultTitle;
    this.rubricLevels = Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null }));
    this.rubricCriteriaRows = [{ title: '', cells: this.rubricLevels.map(() => '') }];
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

  private isRubricDesignerStateEmpty(): boolean {
    const anyLevelTitle = (Array.isArray(this.rubricLevels) ? this.rubricLevels : []).some((l) => String(l?.title || '').trim().length);
    const anyCriteriaTitle = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => String(r?.title || '').trim().length);
    const anyCell = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => (Array.isArray(r?.cells) ? r.cells : []).some((c) => String(c || '').trim().length));
    return !anyLevelTitle && !anyCriteriaTitle && !anyCell;
  }

  private get rubricDesignerFromState(): RubricDesigner {
    return {
      title: this.rubricDesignerTitle,
      levels: this.rubricLevels.map((l) => ({
        title: String(l.title || ''),
        maxPoints: Number(l.maxPoints) || 0
      })),
      criteria: this.rubricCriteriaRows.map((r) => ({
        title: String(r.title || ''),
        cells: Array.isArray(r.cells) ? r.cells.map((x) => String(x || '')) : []
      }))
    };
  }

  onGenerateRubricAi() {
    const prompt = String(this.rubricPromptText || '').trim();
    this.generateAi.emit(prompt);
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
    if (this.isRubricDesignerStateEmpty()) return;
    this.save.emit(this.rubricDesignerFromState);
  }

  onRubricFileSelected(ev: Event) {
    const el = ev.target as HTMLInputElement | null;
    if (!el?.files?.length) return;
    const file = el.files[0];
    this.attachFile.emit(file);
    el.value = '';
  }
}
