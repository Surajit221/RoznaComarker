import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-true-false-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        {{ question.questionText }}
        <div class="ws-tf-options">
          @for (opt of ['True', 'False']; track opt) {
            <div class="ws-tf-option">
              <div class="ws-tf-box"></div>
              <span>{{ opt }}</span>
            </div>
          }
        </div>
        @if (showAnswer && question.answer) {
          <div class="ws-answer-reveal">Answer: {{ question.answer }}</div>
        }
      </div>
    </div>
  `,
})
export class TrueFalseQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;
}
