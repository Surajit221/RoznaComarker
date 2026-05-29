import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  QuestionBlockContent,
  WorksheetColorScheme,
} from '../../../models/worksheet-document.model';
import { OrderingQuestionComponent } from '../questions/ordering-question';
import { ClassificationQuestionComponent } from '../questions/classification-question';
import { FillBlankQuestionComponent } from '../questions/fill-blank-question';
import { McqQuestionComponent } from '../questions/mcq-question';
import { ShortAnswerQuestionComponent } from '../questions/short-answer-question';
import { TrueFalseQuestionComponent } from '../questions/true-false-question';
import { MatchingQuestionComponent } from '../questions/matching-question';
import { WriteLinesQuestionComponent } from '../questions/write-lines-question';

@Component({
  selector: 'app-ws-question-block-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OrderingQuestionComponent,
    ClassificationQuestionComponent,
    FillBlankQuestionComponent,
    McqQuestionComponent,
    ShortAnswerQuestionComponent,
    TrueFalseQuestionComponent,
    MatchingQuestionComponent,
    WriteLinesQuestionComponent,
  ],
  template: `
    <div style="margin-bottom:16px">
      @if (content.showSectionTitle && content.sectionTitle) {
        <div
          class="ws-section-title"
          [style.color]="colorScheme.primary"
          [style.borderColor]="colorScheme.primary"
        >
          {{ content.sectionTitle }}
        </div>
      }
      <div [style]="twoColStyle">
        @for (question of content.questions; track question.id) {
          @switch (question.type) {
            @case ('ordering_sequencing') {
              <app-ordering-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('classification') {
              <app-classification-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('multiple_choice') {
              <app-mcq-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('fill_in_blanks') {
              <app-fill-blank-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('matching_pairs') {
              <app-matching-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('true_false') {
              <app-true-false-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @case ('short_answer') {
              <app-short-answer-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }

            @default {
              <!-- Fallback for any unrecognised type -->
              <app-write-lines-question
                [question]="question"
                [showAnswer]="showAnswerKey && mode === 'preview'"
              />
            }
          }
        }
      </div>
    </div>
  `,
})
export class QuestionBlockSectionComponent {
  @Input({ required: true }) content!: QuestionBlockContent;
  @Input({ required: true }) colorScheme!: WorksheetColorScheme;
  @Input() mode: 'preview' | 'print' | 'student' = 'preview';
  @Input() showAnswerKey = false;
  @Input() answerKey: { questionId: string; answer: string }[] = [];

  get twoColStyle(): Record<string, string> {
    return this.content.layout === 'two_column'
      ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }
      : {};
  }
}
