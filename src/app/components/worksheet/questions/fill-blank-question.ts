import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-fill-blank-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        {{ question.questionText }}
        @if (showAnswer && question.answer) {
          <div class="ws-answer-reveal">Answer: {{ question.answer }}</div>
        }
      </div>
    </div>
  `,
})
export class FillBlankQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;
}
