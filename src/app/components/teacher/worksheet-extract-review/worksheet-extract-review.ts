/**
 * WorksheetExtractReviewComponent
 * 
 * Displays extracted worksheet structure from uploaded files for teacher review.
 * Allows inline editing of questions, answers, types, and topics before publishing.
 * Flags low-confidence items that need manual verification.
 */
import { Component, Input, Output, EventEmitter } from '@angular/core';
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
    this.editingQuestion = { ...question };
  }

  saveQuestion(sectionIndex: number, questionIndex: number): void {
    if (!this.extractedStructure || !this.editingQuestion) return;
    
    this.extractedStructure.sections[sectionIndex].questions[questionIndex] = { ...this.editingQuestion };
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
  }

  confirm(): void {
    if (!this.extractedStructure) return;
    
    // Validate that all questions have answers
    const missingAnswers = this.extractedStructure.sections.reduce((count, section) => {
      return count + section.questions.filter(q => !q.correct_answer || q.correct_answer === '').length;
    }, 0);

    if (missingAnswers > 0) {
      alert(`${missingAnswers} question(s) are missing correct answers. Please fill them in before confirming.`);
      return;
    }

    this.confirmed.emit(this.extractedStructure);
    this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('wer-backdrop')) {
      this.close();
    }
  }
}
