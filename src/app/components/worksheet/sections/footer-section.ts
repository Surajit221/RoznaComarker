import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FooterContent, WorksheetColorScheme } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ws-footer-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ws-footer"
      [style.background]="colorScheme.primary"
      [style.color]="colorScheme.headerText"
    >
      <span>{{ content.leftText }}</span>
      @if (content.rightText) {
        <span>{{ content.rightText }}</span>
      }
    </div>
  `,
})
export class FooterSectionComponent {
  @Input({ required: true }) content!: FooterContent;
  @Input({ required: true }) colorScheme!: WorksheetColorScheme;
}
