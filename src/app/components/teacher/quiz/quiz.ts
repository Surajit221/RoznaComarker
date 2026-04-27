import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { QuizQuestion, WorksheetActivityResult } from '../../../models/worksheet.model';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quiz.html',
  styleUrl: './quiz.css',
})
export class QuizComponent {
  private sourceQuestions: QuizQuestion[] = [];

  @Input() title = 'Activity 3: Quick Quiz';
  @Input() subtitle = 'Choose the best answer and get instant feedback.';
  @Output() resultChange = new EventEmitter<WorksheetActivityResult>();

  @Input() set questions(value: QuizQuestion[]) {
    this.sourceQuestions = Array.isArray(value) ? value.map((question) => ({
      ...question,
      options: Array.isArray(question.options) ? question.options.map((option) => ({ ...option })) : [],
    })) : [];
    this.resetQuiz(false);
  }

  questionStates: QuizQuestion[] = [];

  trackByQuestion(_: number, question: QuizQuestion): string {
    return question.id;
  }

  trackByOption(_: number, option: { id: string }): string {
    return option.id;
  }

  selectOption(questionId: string, optionId: string): void {
    this.questionStates = this.questionStates.map((question) => {
      if (question.id !== questionId || question.revealed) {
        return question;
      }

      return {
        ...question,
        selectedOptionId: optionId,
        revealed: true,
      };
    });

    this.emitResult();
  }

  resetQuiz(emit = true): void {
    this.questionStates = this.sourceQuestions.map((question) => ({
      ...question,
      selectedOptionId: null,
      revealed: false,
      options: question.options.map((option) => ({ ...option })),
    }));

    if (emit) {
      this.resultChange.emit({
        completed: false,
        score: 0,
        maxScore: this.questionStates.length,
        selections: {},
      });
    }
  }

  isCorrect(question: QuizQuestion, optionId: string): boolean {
    return question.answerId === optionId;
  }

  isSelected(question: QuizQuestion, optionId: string): boolean {
    return question.selectedOptionId === optionId;
  }

  get score(): number {
    return this.questionStates.reduce((count, question) => {
      return question.selectedOptionId === question.answerId ? count + 1 : count;
    }, 0);
  }

  get isComplete(): boolean {
    return this.questionStates.length > 0 && this.questionStates.every((question) => question.revealed);
  }

  private emitResult(): void {
    const selections = this.questionStates.reduce((acc, question) => {
      acc[question.id] = question.selectedOptionId ?? null;
      return acc;
    }, {} as Record<string, string | null>);

    this.resultChange.emit({
      completed: this.isComplete,
      score: this.score,
      maxScore: this.questionStates.length,
      selections,
    });
  }
}
