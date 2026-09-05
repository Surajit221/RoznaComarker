/**
 * WorksheetExtractReviewComponent
 * 
 * Displays extracted worksheet structure from uploaded files for teacher review.
 * Allows inline editing of questions, answers, types, and topics before publishing.
 * Flags low-confidence items that need manual verification.
 */
import { Component, Input, Output, EventEmitter, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ExtractedQuestion {
  id: string;
  prompt: string;
  type: 'fill_blank' | 'multiple_choice' | 'matching' | 'true_false' | 'short_answer' | 'essay';
  options?: string[];
  correct_answer: string | string[];
  topic: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedSection {
  instruction: string;
  questions: ExtractedQuestion[];
}

export interface ExtractedStructure {
  title: string;
  description: string;
  subject: string;
  sections: ExtractedSection[];
}

@Component({
  selector: 'app-worksheet-extract-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './worksheet-extract-review.html',
  styleUrl: './worksheet-extract-review.css',
})
export class WorksheetExtractReviewComponent {
  @ViewChildren('questionCard') questionCards!: QueryList<ElementRef<HTMLElement>>;
  @Input() isOpen = false;
  @Input() extractedStructure: ExtractedStructure | null = null;
  @Input() fileName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<ExtractedStructure>();

  readonly questionTypes = [
    { value: 'fill_blank', label: 'Fill in the Blank' },
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'matching', label: 'Matching' },
    { value: 'true_false', label: 'True/False' },
    { value: 'short_answer', label: 'Short Answer' },
    { value: 'essay', label: 'Essay' },
  ];

  readonly confidenceLevels = ['high', 'medium', 'low'];

  editingQuestion: ExtractedQuestion | null = null;
  expandedSections: Set<number> = new Set();
  invalidQuestions = new Set<string>();
  validationMessage = '';

  private issueKey(sectionIndex: number, questionIndex: number): string { return `${sectionIndex}:${questionIndex}`; }

  private normalized(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  }

  validationIssue(question: ExtractedQuestion): 'missingCorrectAnswer' | 'missingGradingGuidance' | 'invalidOptions' | null {
    const answer = Array.isArray(question.correct_answer)
      ? question.correct_answer.map(value => String(value).trim()).filter(Boolean)
      : String(question.correct_answer ?? '').trim();
    if (!answer || (Array.isArray(answer) && !answer.length)) {
      return question.type === 'short_answer' || question.type === 'essay'
        ? 'missingGradingGuidance'
        : 'missingCorrectAnswer';
    }
    if (question.type === 'multiple_choice') {
      const sourceOptions = question.options || [];
      const options = sourceOptions.map(value => String(value).trim());
      const normalizedOptions = options.map(value => this.normalized(value));
      if (options.length < 2 || options.length > 8 || normalizedOptions.some(value => !value) ||
          new Set(normalizedOptions).size !== options.length) return 'invalidOptions';
      if (normalizedOptions.filter(option => option === this.normalized(answer)).length !== 1) return 'missingCorrectAnswer';
    }
    if (question.type === 'true_false' && !['true', 'false'].includes(this.normalized(answer))) return 'missingCorrectAnswer';
    return null;
  }

  needsReview(sectionIndex: number, questionIndex: number): boolean {
    return this.invalidQuestions.has(this.issueKey(sectionIndex, questionIndex));
  }

  isSubjective(question: ExtractedQuestion): boolean {
    return question.type === 'short_answer' || question.type === 'essay';
  }

  issueMessage(question: ExtractedQuestion): string {
    return this.validationIssue(question) === 'missingGradingGuidance'
      ? 'Add grading guidance or a model answer.'
      : 'Select or enter the correct answer.';
  }

  get lowConfidenceCount(): number {
    if (!this.extractedStructure) return 0;
    return this.extractedStructure.sections.reduce((count, section) => {
      return count + section.questions.filter(q => q.confidence === 'low').length;
    }, 0);
  }

  get totalQuestions(): number {
    if (!this.extractedStructure) return 0;
    return this.extractedStructure.sections.reduce((count, section) => {
      return count + section.questions.length;
    }, 0);
  }

  toggleSection(index: number): void {
    if (this.expandedSections.has(index)) {
      this.expandedSections.delete(index);
    } else {
      this.expandedSections.add(index);
    }
  }

  editQuestion(sectionIndex: number, question: ExtractedQuestion): void {
    this.editingQuestion = { ...question, options: question.options ? [...question.options] : undefined,
      correct_answer: Array.isArray(question.correct_answer) ? [...question.correct_answer] : question.correct_answer };
  }

  saveQuestion(sectionIndex: number, questionIndex: number): void {
    if (!this.extractedStructure || !this.editingQuestion) return;
    
    const corrected = { ...this.editingQuestion, options: this.editingQuestion.options ? [...this.editingQuestion.options] : undefined };
    if (!this.validationIssue(corrected) && corrected.confidence === 'low') corrected.confidence = 'high';
    this.extractedStructure.sections[sectionIndex].questions[questionIndex] = corrected;
    this.invalidQuestions.delete(this.issueKey(sectionIndex, questionIndex));
    if (!this.invalidQuestions.size) this.validationMessage = '';
    this.editingQuestion = null;
  }

  cancelEdit(): void {
    this.editingQuestion = null;
  }

  addOption(question: ExtractedQuestion): void {
    if (!question.options) {
      question.options = [];
    }
    question.options.push('');
  }

  removeOption(question: ExtractedQuestion, index: number): void {
    if (question.options && question.options.length > index) {
      question.options.splice(index, 1);
    }
  }

  getConfidenceBadgeClass(confidence: string): string {
    switch (confidence) {
      case 'high': return 'wer-confidence-high';
      case 'medium': return 'wer-confidence-medium';
      case 'low': return 'wer-confidence-low';
      default: return '';
    }
  }

  getConfidenceLabel(confidence: string): string {
    switch (confidence) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return confidence;
    }
  }

  formatAnswer(answer: string | string[]): string {
    if (Array.isArray(answer)) {
      return answer.join(', ');
    }
    return answer;
  }

  close(): void {
    this.closed.emit();
    this.editingQuestion = null;
    this.expandedSections.clear();
    this.invalidQuestions.clear();
    this.validationMessage = '';
  }

  confirm(): void {
    if (!this.extractedStructure) return;
    
    this.invalidQuestions.clear();
    this.extractedStructure.sections.forEach((section, sectionIndex) => section.questions.forEach((question, questionIndex) => {
      if (this.validationIssue(question)) this.invalidQuestions.add(this.issueKey(sectionIndex, questionIndex));
    }));
    if (this.invalidQuestions.size > 0) {
      this.validationMessage = `${this.invalidQuestions.size} question${this.invalidQuestions.size === 1 ? '' : 's'} need your review.`;
      this.reviewFirstIssue();
      return;
    }

    this.confirmed.emit(this.extractedStructure);
    this.close();
  }

  reviewFirstIssue(): void {
    const firstKey = this.invalidQuestions.values().next().value as string | undefined;
    if (!firstKey) return;
    const [sectionIndex, questionIndex] = firstKey.split(':').map(Number);
    this.expandedSections.add(sectionIndex);
    setTimeout(() => {
      const card = this.questionCards?.find(item => item.nativeElement.dataset['issueKey'] === firstKey)?.nativeElement;
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (card?.querySelector('button.wer-edit-btn') as HTMLButtonElement | null)?.focus();
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('wer-backdrop')) {
      this.close();
    }
  }
}
