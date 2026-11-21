import { Component, inject } from '@angular/core';
import { RubricDesignerModal } from '../rubric-designer-modal/rubric-designer-modal';
import { SpeakingAssignmentsFacade } from '../../../services/speaking-assignments.facade';

/** The Rubric button of a speaking card: the existing rubric designer (no AI or library tools), saved as this assignment's own copy. */
@Component({
  selector: 'app-speaking-rubric-editor',
  standalone: true,
  imports: [RubricDesignerModal],
  template: `
    <app-rubric-designer-modal [open]="facade.rubricOpen()" [rubricDesigner]="facade.rubricDesigner()" [isSaving]="facade.rubricSaving()"
      [showTools]="false" defaultTitle="Speaking rubric" (closed)="facade.closeRubric()" (save)="facade.saveRubric($event)">
    </app-rubric-designer-modal>
  `
})
export class SpeakingRubricEditor {
  readonly facade = inject(SpeakingAssignmentsFacade);
}
