import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-learning-tools-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './learning-tools-picker.html',
  styleUrl: './learning-tools-picker.css',
})
export class LearningToolsPicker {
  @Input() show = false;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() toolSelected = new EventEmitter<string>();

  /**
   * Active sub-screen:
   *  'tools'            = main tool picker grid
   *  'flashcard-choice' = flashcard create-vs-assign
   *  'worksheet-choice' = worksheet create-vs-assign
   */
  activeView: 'tools' | 'flashcard-choice' | 'worksheet-choice' = 'tools';

  /** @deprecated kept for back-compat — maps to activeView */
  get flashcardView(): 'tools' | 'choice' {
    return this.activeView === 'flashcard-choice' ? 'choice' : 'tools';
  }

  close() {
    this.activeView = 'tools';
    this.show = false;
    this.showChange.emit(false);
  }

  selectTool(tool: string) {
    if (tool === 'flashcards') {
      this.activeView = 'flashcard-choice';
      return;
    }
    if (tool === 'worksheet') {
      this.activeView = 'worksheet-choice';
      return;
    }
    this.toolSelected.emit(tool);
    this.close();
  }

  /** Flashcard choice: create new set */
  chooseCreate() {
    this.toolSelected.emit('flashcards:create');
    this.close();
  }

  /** Flashcard choice: assign existing set */
  chooseAssign() {
    this.toolSelected.emit('flashcards');
    this.close();
  }

  /** Worksheet choice: create new worksheet (navigates to create page) */
  worksheetCreate() {
    this.toolSelected.emit('worksheet:create');
    this.close();
  }

  /** Worksheet choice: assign an existing worksheet via modal */
  worksheetAssign() {
    this.toolSelected.emit('worksheet:assign');
    this.close();
  }

  backToTools() {
    this.activeView = 'tools';
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('lt-backdrop')) {
      this.close();
    }
  }
}
