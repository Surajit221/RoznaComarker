import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RubricApiService, type SavedRubric } from '../../../api/rubric-api.service';
import { RubricLibraryStateService } from '../../../services/rubric-library-state.service';
import { AlertService } from '../../../services/alert.service';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { RubricDesignerModal } from '../../../components/teacher/rubric-designer-modal/rubric-designer-modal';
import type { RubricDesigner } from '../../../models/submission-feedback.model';
import { designerToRubricData, rubricDataToDesigner } from '../../../utils/rubric-library.util';
import { Router } from '@angular/router';

@Component({
  selector: 'app-rubric-library', standalone: true,
  imports: [CommonModule, FormsModule, ModalDialog, RubricDesignerModal],
  templateUrl: './rubric-library.html', styleUrl: './rubric-library.css'
})
export class RubricLibraryPage {
  readonly state = inject(RubricLibraryStateService);
  private readonly api = inject(RubricApiService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);
  readonly query = signal('');
  readonly filtered = computed(() => {
    const query = this.query().trim().toLowerCase();
    return query ? this.state.rubrics().filter((item) => item.name.toLowerCase().includes(query)) : this.state.rubrics();
  });
  detailsOpen = false; designerOpen = false; preview: SavedRubric | null = null; saving = false;
  editing: SavedRubric | null = null; workingDesigner: RubricDesigner | null = null;
  name = ''; description = ''; writingType = '';

  ngOnInit(): void { void this.state.load(); }
  newRubric(): void { this.editing = null; this.name = ''; this.description = ''; this.writingType = ''; this.workingDesigner = null; this.detailsOpen = true; }
  edit(item: SavedRubric): void {
    this.editing = item; this.name = item.name; this.description = item.description || ''; this.writingType = item.writingType || '';
    this.workingDesigner = rubricDataToDesigner(item.rubricData, item.name); this.detailsOpen = true;
  }
  onDesignerSave(designer: RubricDesigner): void { this.workingDesigner = designer; this.designerOpen = false; this.detailsOpen = true; }
  async save(): Promise<void> {
    if (this.saving || !this.name.trim() || !this.workingDesigner) return;
    this.saving = true;
    try {
      const payload = { name: this.name.trim(), description: this.description.trim() || undefined,
        writingType: this.writingType.trim() || undefined, rubricData: designerToRubricData(this.workingDesigner) };
      const result = this.editing ? await this.api.updateSavedRubric(this.editing._id, payload) : await this.api.createSavedRubric(payload);
      this.state.upsert(result); this.detailsOpen = false; this.alert.showToast(this.editing ? 'Saved rubric updated' : 'Rubric saved to library', 'success');
    } catch (error: any) { this.alert.showError('Unable to save rubric', error?.error?.message || 'Please review the rubric and try again.'); }
    finally { this.saving = false; }
  }
  async duplicate(item: SavedRubric): Promise<void> {
    try { this.state.upsert(await this.api.duplicateSavedRubric(item._id)); this.alert.showToast('Rubric duplicated', 'success'); }
    catch (error: any) { this.alert.showError('Unable to duplicate rubric', error?.error?.message || 'Please try again.'); }
  }
  async use(item: SavedRubric): Promise<void> {
    this.state.useForNextAssignment(item);
    this.alert.showToast('Rubric selected. Choose a class and create an assignment.', 'success');
    await this.router.navigate(['/teacher/my-classes']);
  }
  async archive(item: SavedRubric): Promise<void> {
    const confirmed = await this.alert.showConfirm('Archive rubric?', `Archive “${item.name}”? Existing assignments will remain unchanged.`);
    if (!confirmed) return;
    try { await this.api.archiveSavedRubric(item._id); this.state.remove(item._id); this.alert.showToast('Rubric archived', 'success'); }
    catch (error: any) { this.alert.showError('Unable to archive rubric', error?.error?.message || 'Please try again.'); }
  }
  updatedLabel(item: SavedRubric): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(item.updatedAt)); }
}
