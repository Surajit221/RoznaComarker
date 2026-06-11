import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-short-answer-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        {{ question.questionText }}
        <div class="ws-answer-lines">
          @for (i of lineRange; track i) {
            <div class="ws-write-line" style="margin-bottom:4px"></div>
          }
        </div>
        @if (showAnswer && question.answer) {
          <div class="ws-answer-reveal">Answer: {{ question.answer }}</div>
        }
      </div>
    </div>
  `,
})
export class ShortAnswerQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;

  get lineRange(): number[] {
    const n = this.question.writeLines ?? 2;
    return Array.from({ length: n }, (_, i) => i);
  }
}
