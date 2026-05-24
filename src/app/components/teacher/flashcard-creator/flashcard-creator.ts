import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AlertService } from '../../../services/alert.service';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';

type CreatorStep = 'configure' | 'generating' | 'preview';

interface CreatorCard {
  id: string;
  question: string;
  answer: string;
  frontImage?: string | null;
  backImage?: string | null;
  isEditing: boolean;
}

@Component({
  selector: 'app-flashcard-creator',
  standalone: true,
  imports: [CommonModule, FormsModule, SuccessModal, ErrorModal],
  templateUrl: './flashcard-creator.html',
  styleUrl: './flashcard-creator.css',
})
export class FlashcardCreator implements OnChanges {
  @Input() show = false;
  @Input() classId: string | null = null;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() backToPicker = new EventEmitter<void>();

  private alert = inject(AlertService);
  private flashcardApi = inject(FlashcardApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  showSuccessModal = false;
  showErrorModal = false;
  modalTitle = '';
  modalMessage = '';

  openSuccessModal(title: string, message: string): void {
    this.modalTitle = title;
    this.modalMessage = message;
    this.showSuccessModal = true;
    this.cdr.markForCheck();
  }
  openErrorModal(title: string, message: string): void {
    this.modalTitle = title;
    this.modalMessage = message;
    this.showErrorModal = true;
    this.cdr.markForCheck();
  }
  closeModal(): void {
    this.showSuccessModal = false;
    this.showErrorModal = false;
    this.cdr.markForCheck();
  }

  currentStep: CreatorStep = 'configure';

  activeTab: 'topic' | 'text' | 'file' | 'image' = 'topic';
  topicInput = '';
  textInput = '';
  numberOfCards = 'automatic';
  language = 'english';
  imageSearchQuery = '';

  cards: CreatorCard[] = [];
  currentCardIndex = 0;
  isGenerating = false;

  ngOnChanges(changes: SimpleChanges): void {
    // No assignment loading needed
  }

  get currentCard(): CreatorCard | null {
    return this.cards[this.currentCardIndex] ?? null;
  }

  get totalCards(): number {
    return this.cards.length;
  }

  goBack() {
    this.currentStep = 'configure';
    this.show = false;
    this.showChange.emit(false);
    this.backToPicker.emit();
  }

  closeAll() {
    this.show = false;
    this.showChange.emit(false);
    this.resetState();
  }

  private resetState() {
    this.currentStep = 'configure';
    this.activeTab = 'topic';
    this.topicInput = '';
    this.textInput = '';
    this.numberOfCards = 'automatic';
    this.language = 'english';
    this.imageSearchQuery = '';
    this.cards = [];
    this.currentCardIndex = 0;
    this.isGenerating = false;
  }

  async generate() {
    if (!this.topicInput && !this.textInput && !this.imageSearchQuery) {
      this.openErrorModal(
        'Missing Input',
        'Please enter a topic, text, or image search query to generate flashcards',
      );
      return;
    }

    this.currentStep = 'generating';
    this.isGenerating = true;

    try {
      const payload: any = {
        topic: this.topicInput,
        text: this.textInput,
        imageSearchQuery: this.imageSearchQuery,
        numberOfCards:
          this.numberOfCards === 'automatic' ? undefined : parseInt(this.numberOfCards, 10),
        language: this.language,
      };

      const generatedCards = await firstValueFrom(this.flashcardApi.generateFlashcards(payload));

      // Map backend response (front/back) to frontend model (question/answer)
      this.cards = generatedCards.map((c: any, i: number) => ({
        id: c._id || String(i),
        question: c.front || c.question || '',
        answer: c.back || c.answer || '',
        frontImage: c.frontImage || null,
        backImage: c.backImage || null,
        isEditing: false,
      }));
      this.currentCardIndex = 0;
      this.currentStep = 'preview';
    } catch (error) {
      this.openErrorModal('Generation Failed', 'Failed to generate flashcards. Please try again.');
      this.currentStep = 'configure';
    } finally {
      this.isGenerating = false;
    }
  }

  prevCard() {
    if (this.currentCardIndex > 0) {
      this.currentCardIndex--;
    }
  }

  nextCard() {
    if (this.currentCardIndex < this.totalCards - 1) {
      this.currentCardIndex++;
    }
  }

  toggleEdit(card: CreatorCard) {
    card.isEditing = !card.isEditing;
  }

  deleteCard(index: number) {
    this.cards = this.cards.filter((_, i) => i !== index);
    if (this.currentCardIndex >= this.cards.length && this.cards.length > 0) {
      this.currentCardIndex = this.cards.length - 1;
    }
  }

  async saveToClass() {
    if (this.cards.length === 0) {
      this.openErrorModal('Nothing to Save', 'No flashcards to save');
      return;
    }

    try {
      const payload: any = {
        title: this.topicInput || 'Untitled Flashcard Set',
        description: this.textInput || '',
        cards: this.cards.map((c, i) => ({
          front: c.question,
          back: c.answer,
          frontImage: c.frontImage || null,
          backImage: c.backImage || null,
          order: i,
        })),
      };

      const savedSet = await firstValueFrom(this.flashcardApi.createSet(payload));
      const setId = (savedSet as any)._id || (savedSet as any).id;

      this.openSuccessModal('Saved!', 'Flashcard set saved successfully!');
      this.closeAll();

      // Navigate to preview after saving, preserving classId if available
      const queryParams = this.classId ? { classId: this.classId } : undefined;
      this.router.navigate(['/flashcards', setId], { queryParams });
    } catch (error) {
      this.openErrorModal('Save Failed', 'Failed to save flashcard set. Please try again.');
    }
  }

  backToEditor() {
    this.currentStep = 'configure';
  }

  /** Get full image URL from relative path */
  getImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://'))
      return relativePath;
    return `${environment.apiUrl}${relativePath}`;
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('fc-configure-backdrop')) {
      this.closeAll();
    }
  }
}
