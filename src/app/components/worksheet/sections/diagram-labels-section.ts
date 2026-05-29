import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  DiagramLabelsContent,
  WorksheetColorScheme,
} from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ws-diagram-labels-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-diagram-container">
      <!-- LEFT: central illustration -->
      <div class="ws-diagram-image-col">
        @if (content.centralImage.url) {
          <img
            [src]="content.centralImage.url"
            [alt]="content.centralImage.alt"
            class="ws-diagram-image"
            (error)="onImgError($event)"
          />
        } @else {
          <div class="ws-diagram-image-placeholder">
            {{ content.centralImage.alt || 'Illustration' }}
          </div>
        }
      </div>

      <!-- RIGHT: stacked labeled boxes -->
      <div class="ws-diagram-boxes-col">
        @for (label of content.labels; track label.id) {
          <div class="ws-label-box" [style.borderColor]="colorScheme.boxBorder">
            <!-- Pill-shaped tab centered on top border -->
            <div
              class="ws-label-tab"
              [style.background]="colorScheme.labelBg"
              [style.color]="colorScheme.labelText"
            >
              {{ label.labelName }}
            </div>
            <!-- Write lines inside the box -->
            <div class="ws-write-lines">
              @for (i of range(label.writeLines); track i) {
                <div class="ws-write-line"></div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class DiagramLabelsSectionComponent {
  @Input({ required: true }) content!: DiagramLabelsContent;
  @Input({ required: true }) colorScheme!: WorksheetColorScheme;

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = `https://placehold.co/260x580/f0f0f0/999?text=${encodeURIComponent(this.content.centralImage.alt)}`;
  }
}
