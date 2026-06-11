import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { WordBankContent, WorksheetColorScheme } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ws-word-bank-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-word-bank" [style.borderColor]="colorScheme.primary">
      <div class="ws-word-bank-title" [style.color]="colorScheme.primary">
        {{ content.title }}
      </div>
      <div class="ws-word-bank-words">
        @for (word of content.words; track $index) {
          <span class="ws-word-bank-word">{{ word }}</span>
        }
      </div>
    </div>
  `,
})
export class WordBankSectionComponent {
  @Input({ required: true }) content!: WordBankContent;
  @Input({ required: true }) colorScheme!: WorksheetColorScheme;
}
