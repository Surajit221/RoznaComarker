import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { HeaderContent, WorksheetColorScheme } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ws-header-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="ws-header-top">
        @if (content.decorativeImageUrl) {
          <img
            [src]="content.decorativeImageUrl"
            alt="worksheet decoration"
            class="ws-header-decorative-img"
            (error)="onImgError($event)"
          />
        }
        <div class="ws-header-right">
          @if (content.showNameField) {
            <div class="ws-name-field">NAME:</div>
          }
          <div
            class="ws-title-banner"
            [style.background]="colorScheme.headerBg"
            [style.color]="colorScheme.headerText"
          >
            {{ content.title }}
          </div>
        </div>
      </div>

      <div class="ws-student-fields">
        @if (content.showNameField) {
          <div class="ws-student-field">
            NAME: <div class="ws-student-field-line"></div>
          </div>
        }
        @if (content.showDateField) {
          <div class="ws-student-field">
            DATE: <div class="ws-student-field-line"></div>
          </div>
        }
        @if (content.showClassField) {
          <div class="ws-student-field">
            CLASS: <div class="ws-student-field-line"></div>
          </div>
        }
      </div>
    </div>
  `,
})
export class HeaderSectionComponent {
  @Input({ required: true }) content!: HeaderContent;
  @Input({ required: true }) colorScheme!: WorksheetColorScheme;

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
