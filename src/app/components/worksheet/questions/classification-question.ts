import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Question } from '../../../models/worksheet-document.model';

@Component({
  selector: 'app-classification-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-question">
      <span class="ws-question-number">{{ question.number }}.</span>
      <div class="ws-question-body">
        <div style="margin-bottom:10px">{{ question.questionText }}</div>

        <!-- Word pool -->
        <div class="ws-classif-pool">
          @for (item of question.classificationItems ?? []; track $index) {
            <span class="ws-classif-chip">{{ item }}</span>
          }
        </div>

        <!-- Category columns -->
        <div class="ws-classif-grid" [style.gridTemplateColumns]="gridCols">
          @for (cat of question.categories ?? []; track cat) {
            <div>
              <div class="ws-classif-header">{{ cat }}</div>
              <div class="ws-classif-body">
                @if (showAnswer && question.classificationAnswers?.[cat]) {
                  @for (ans of question.classificationAnswers![cat]; track ans) {
                    <div class="ws-classif-answer">{{ ans }}</div>
                  }
                } @else {
                  @for (i of emptyLines; track i) {
                    <div class="ws-write-line" style="margin-bottom:4px"></div>
                  }
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ws-classif-pool {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 14px;
      padding: 8px 12px;
      border: 1px dashed #bbb;
      border-radius: 6px;
      background: #fafafa;
    }
    .ws-classif-chip {
      padding: 3px 10px;
      border: 1px solid #ccc;
      border-radius: 12px;
      font-size: 12px;
      background: #fff;
    }
    .ws-classif-grid {
      display: grid;
      gap: 10px;
    }
    .ws-classif-header {
      background: var(--ws-primary, #2d6a2d);
      color: #fff;
      text-align: center;
      padding: 5px 8px;
      border-radius: 6px 6px 0 0;
      font-size: 12px;
      font-weight: 700;
    }
    .ws-classif-body {
      border: 1px solid var(--ws-primary, #2d6a2d);
      border-top: none;
      border-radius: 0 0 6px 6px;
      min-height: 60px;
      padding: 8px;
    }
    .ws-classif-answer {
      font-size: 12px;
      color: #2d6a2d;
      font-weight: 600;
      margin-bottom: 2px;
    }
  `],
})
export class ClassificationQuestionComponent {
  @Input({ required: true }) question!: Question;
  @Input() showAnswer = false;

  readonly emptyLines = [0, 1, 2];

  get gridCols(): string {
    const n = Math.min(this.question.categories?.length ?? 2, 3);
    return `repeat(${n}, 1fr)`;
  }
}
