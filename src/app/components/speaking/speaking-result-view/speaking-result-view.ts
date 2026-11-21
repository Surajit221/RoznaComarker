import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { CanonicalDetailedFeedbackComponent } from '../../canonical-detailed-feedback/canonical-detailed-feedback';
import type { DetailedFeedbackDisplayModel } from '../../../utils/detailed-feedback-display.util';
import type { SpeakingFluency, SpeakingResultBlock } from '../../../api/speaking-api.service';

/**
 * A speaking result (stage 7e), the same for the student and the teacher: the overall score (or the "marks hidden" notice), the off-topic note
 * when the score was capped (the cap and the score before it for the teacher only), one row per rubric criterion (level, points when marks are
 * shown, comment), the fluency figures worked out by software, and the feedback lists through the existing feedback component.
 */
@Component({
  selector: 'app-speaking-result-view',
  imports: [DecimalPipe, CanonicalDetailedFeedbackComponent],
  templateUrl: './speaking-result-view.html',
  styleUrl: './speaking-result-view.css'
})
export class SpeakingResultView {
  @Input({ required: true }) result!: SpeakingResultBlock;
  @Input() marksVisible = true;
  @Input() fluency: SpeakingFluency | null = null;
  @Input() audience: 'student' | 'teacher' = 'student';
  @Input() offTopicCap: { cap: number; uncappedScore: number } | null = null;

  get showScore(): boolean { return this.marksVisible && typeof this.result?.overallScore === 'number'; }

  /** The existing feedback component's plain-list layout ("legacy"): improvements, strengths and action steps as written. */
  get feedback(): DetailedFeedbackDisplayModel {
    return { status: 'legacy', message: null, retryLabel: '', sourceHash: null, evaluationVersion: null, areasForImprovement: [], strengths: [], actionSteps: [],
      legacyAreas: this.result?.improvements ?? [], legacyStrengths: this.result?.strengths ?? [],
      legacyActionSteps: (this.result?.actionSteps ?? []).map(step => step.action) };
  }
}
