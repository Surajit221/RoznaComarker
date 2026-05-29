import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-ordering-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        <div style="margin-bottom:8px">{{ question.questionText }}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          @for (item of question.items ?? []; track $index) {
            <div class="ws-ordering-item">
              <span class="ws-ordering-badge">{{ $index + 1 }}</span>
              {{ item }}
            </div>
          }
        </div>
        @if (showAnswer && question.answer) {
          <div class="ws-answer-reveal">Correct order: {{ question.answer }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .ws-ordering-item {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 6px 12px;
      background: #fafafa;
      font-size: 13px;
    }
    .ws-ordering-badge {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1.5px solid #999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
  `],
})
export class OrderingQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;
}
