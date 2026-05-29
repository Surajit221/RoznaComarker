import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { InstructionsContent } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ws-instructions-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p
      class="ws-instructions"
      [style.fontWeight]="content.bold ? 'bold' : 'normal'"
      [style.textAlign]="content.alignment ?? 'justify'"
    >
      {{ content.text }}
    </p>
  `,
})
export class InstructionsSectionComponent {
  @Input({ required: true }) content!: InstructionsContent;
}
