import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-matching-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="margin-bottom:12px">
      @if (question.questionText) {
        <div style="font-weight:800;font-size:13px;margin-bottom:8px">
          {{ question.questionText }}
        </div>
      }
      <div class="ws-matching-grid">
        @for (pair of question.matchPairs ?? []; track $index) {
          <div class="ws-match-left">{{ pair.left }}</div>
          <div class="ws-match-line"></div>
          <div class="ws-match-right">{{ pair.right }}</div>
        }
      </div>
      @if (showAnswer && question.answer) {
        <div class="ws-answer-reveal">Answer: {{ question.answer }}</div>
      }
    </div>
  `,
})
export class MatchingQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;
}
