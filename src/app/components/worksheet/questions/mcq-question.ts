import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-mcq-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        {{ question.questionText }}
        <div class="ws-mcq-options">
          @for (opt of question.options ?? []; track $index) {
            <div class="ws-mcq-option">
              <div class="ws-option-bubble"></div>
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
export class McqQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;
}
