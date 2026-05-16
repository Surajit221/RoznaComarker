/**
 * FlashcardPreviewModal - Preview flashcard sets before assignment creation
 *
 * Provides a clean, interactive preview of flashcard sets with:
 * - Card navigation (previous/next)
 * - Progress indicator
 * - Card flip animation
 * - Set statistics
 * - Responsive design
 *
 * Usage:
 *   <app-flashcard-preview-modal
 *     [(show)]="showPreview"
 *     [flashcardSet]="selectedSet"
 *     (back)="onBackToAssignment()">
 *   </app-flashcard-preview-modal>
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import type { FlashcardSet } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-flashcard-preview-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flashcard-preview-modal.html',
  styleUrl: './flashcard-preview-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardPreviewModal {
  @Input() show = false;
  @Input() flashcardSet: FlashcardSet | null = null;
  
  @Output() showChange = new EventEmitter<boolean>();
  @Output() back = new EventEmitter<void>();

  private readonly cdr = inject(ChangeDetectorRef);

  currentCardIndex = 0;
  isFlipped = false;
  searchTerm = '';

  /** Get the current card being displayed */
  get currentCard(): any {
    if (!this.flashcardSet?.cards) return null;
    return this.flashcardSet.cards[this.currentCardIndex];
  }

  /** Get total number of cards in the set */
  get totalCards(): number {
    return this.flashcardSet?.cards?.length || 0;
  }

  /** Get progress percentage */
  get progressPercentage(): number {
    if (this.totalCards === 0) return 0;
    return Math.round(((this.currentCardIndex + 1) / this.totalCards) * 100);
  }

  /** Get filtered cards based on search */
  get filteredCards(): any[] {
    if (!this.flashcardSet?.cards) return [];
    if (!this.searchTerm.trim()) return this.flashcardSet.cards;
    
    const searchLower = this.searchTerm.toLowerCase();
    return this.flashcardSet.cards.filter(card => 
      card.front.toLowerCase().includes(searchLower) ||
      card.back.toLowerCase().includes(searchLower)
    );
  }

  /** Get current card from filtered results */
  get currentFilteredCard(): any {
    const filtered = this.filteredCards;
    if (filtered.length === 0) return null;
    return filtered[this.currentCardIndex % filtered.length];
  }

  /** Close the modal */
  close(): void {
    this.show = false;
    this.showChange.emit(false);
    this.resetState();
  }

  /** Handle backdrop click */
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('fpm-backdrop')) {
      this.close();
    }
  }

  /** Go back to assignment creation */
  onBackClick(): void {
    this.back.emit();
    this.close();
  }

  /** Reset component state */
  private resetState(): void {
    this.currentCardIndex = 0;
    this.isFlipped = false;
    this.searchTerm = '';
  }

  /** Get full image URL from relative path */
  getImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
    return `${environment.apiUrl}${relativePath}`;
  }

  /** Navigate to previous card */
  previousCard(): void {
    if (this.currentCardIndex > 0) {
      this.currentCardIndex--;
      this.isFlipped = false;
      this.cdr.markForCheck();
    }
  }

  /** Navigate to next card */
  nextCard(): void {
    const maxIndex = this.filteredCards.length - 1;
    if (this.currentCardIndex < maxIndex) {
      this.currentCardIndex++;
      this.isFlipped = false;
      this.cdr.markForCheck();
    }
  }

  /** Toggle card flip animation */
  flipCard(): void {
    this.isFlipped = !this.isFlipped;
    this.cdr.markForCheck();
  }

  /** Handle keyboard navigation */
  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.previousCard();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.nextCard();
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.flipCard();
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  /** Jump to specific card */
  goToCard(index: number): void {
    if (index >= 0 && index < this.filteredCards.length) {
      this.currentCardIndex = index;
      this.isFlipped = false;
      this.cdr.markForCheck();
    }
  }

  /** Handle search input */
  onSearchChange(): void {
    this.currentCardIndex = 0;
    this.isFlipped = false;
    this.cdr.markForCheck();
  }

  /** Get card display number (1-based) */
  getCardNumber(): number {
    return this.currentCardIndex + 1;
  }

  /** Check if at first card */
  get isFirstCard(): boolean {
    return this.currentCardIndex === 0;
  }

  /** Check if at last card */
  get isLastCard(): boolean {
    return this.currentCardIndex >= this.filteredCards.length - 1;
  }

  /** Get set statistics */
  getSetStats(): { totalCards: number; template: string; language: string } {
    const cards = this.flashcardSet?.cards || [];
    const totalCards = cards.length;
    
    // Get template info
    const template = this.flashcardSet?.template || 'standard';
    
    // Get language info
    const language = this.flashcardSet?.language || 'en';
    
    return { totalCards, template, language };
  }
}
