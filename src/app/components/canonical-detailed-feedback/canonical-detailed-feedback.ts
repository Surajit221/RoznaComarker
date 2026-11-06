import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { CanonicalSubmissionResultCoordinator, type ResultPollingState } from '../../services/canonical-submission-result-coordinator.service';
import { CommonModule } from '@angular/common';
import type { DetailedFeedbackDisplayModel } from '../../utils/detailed-feedback-display.util';

@Component({ selector: 'app-canonical-detailed-feedback', standalone: true, imports: [CommonModule],
  templateUrl: './canonical-detailed-feedback.html', styleUrl: './canonical-detailed-feedback.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class CanonicalDetailedFeedbackComponent {
  @Input({ required: true }) model!: DetailedFeedbackDisplayModel;
  @Input() teacher = false;
  @Input() marksVisible = true;
  @Input() manualRetryAllowed = false;
  @Input() retrying = false;
  @Output() retryRequested = new EventEmitter<void>();
  // The page's own result observer (guest, student and teacher pages each provide or share one). It stops after its maximum wait; then the reader can ask again.
  private readonly coordinator = inject(CanonicalSubmissionResultCoordinator, { optional: true });
  readonly polling = toSignal<ResultPollingState | null>(this.coordinator?.pollingState$ ?? of(null), { initialValue: null });

  checkAgain(): void {
    this.coordinator?.retry();
  }
}
