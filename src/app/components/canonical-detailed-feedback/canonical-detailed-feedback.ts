import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DetailedFeedbackDisplayModel } from '../../utils/detailed-feedback-display.util';

@Component({ selector: 'app-canonical-detailed-feedback', standalone: true, imports: [CommonModule],
  templateUrl: './canonical-detailed-feedback.html', styleUrl: './canonical-detailed-feedback.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class CanonicalDetailedFeedbackComponent {
  @Input({ required: true }) model!: DetailedFeedbackDisplayModel;
  @Input() teacher = false;
  @Input() manualRetryAllowed = false;
  @Input() retrying = false;
  @Output() retryRequested = new EventEmitter<void>();
}
