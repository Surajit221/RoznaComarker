import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../../services/alert.service';
import type { FlashCard } from '../../../models/flashcard.model';

type CreatorStep = 'configure' | 'generating' | 'preview';

const MOCK_CARDS: FlashCard[] = [
  {
    question: 'What is photosynthesis?',
    answer: 'The process by which green plants convert sunlight, water, and CO₂ into glucose and oxygen using chlorophyll.',
  },
  {
    question: 'What organelle performs photosynthesis?',
    answer: 'The chloroplast, which contains the pigment chlorophyll.',
  },
  {
    question: 'What are the two stages of photosynthesis?',
    answer: 'The light-dependent reactions and the Calvin cycle (light-independent reactions).',
  },
  {
    question: 'What is the role of chlorophyll in photosynthesis?',
    answer: 'Chlorophyll absorbs light energy (mainly red and blue wavelengths) and converts it into chemical energy.',
  },
  {
    question: 'What is the overall chemical equation of photosynthesis?',
    answer: '6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂',
  },
  {
    question: 'Where do the light-dependent reactions occur?',
    answer: 'In the thylakoid membranes of the chloroplast.',
  },
  {
    question: 'What is produced during the light-dependent reactions?',
    answer: 'ATP, NADPH, and oxygen (as a byproduct of water splitting).',
  },
  {
    question: 'What is the Calvin cycle?',
    answer: 'A series of light-independent reactions in the stroma that use ATP and NADPH to fix CO₂ into glucose.',
  },
];

@Component({
  selector: 'app-flashcard-creator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flashcard-creator.html',
  styleUrl: './flashcard-creator.css',
})
export class FlashcardCreator {
  @Input() show = false;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() backToPicker = new EventEmitter<void>();

  private alert = inject(AlertService);

  currentStep: CreatorStep = 'configure';

  activeTab: 'topic' | 'text' | 'file' = 'topic';
  topicInput = '';
  textInput = '';
  numberOfCards = 'automatic';
  language = 'english';

  cards: FlashCard[] = [];
  currentCardIndex = 0;
  selectedAssignmentId: string | null = null;

  readonly mockAssignments = [
    { id: 'asgn1', title: 'fdsfasdcas' },
    { id: 'asgn2', title: 'Importance of Environment...' },
  ];

  get currentCard(): FlashCard | null {
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
    this.cards = [];
    this.currentCardIndex = 0;
    this.selectedAssignmentId = null;
  }

  generate() {
    this.currentStep = 'generating';
    window.setTimeout(() => {
      this.cards = MOCK_CARDS.map((c, i) => ({ ...c, id: String(i), isEditing: false }));
      this.currentCardIndex = 0;
      this.currentStep = 'preview';
    }, 2000);
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

  toggleEdit(card: FlashCard) {
    card.isEditing = !card.isEditing;
  }

  deleteCard(index: number) {
    this.cards = this.cards.filter((_, i) => i !== index);
    if (this.currentCardIndex >= this.cards.length && this.cards.length > 0) {
      this.currentCardIndex = this.cards.length - 1;
    }
  }

  saveToClass() {
    this.alert.showToast('Flashcard set saved to class!', 'success');
    this.closeAll();
  }

  backToEditor() {
    this.currentStep = 'configure';
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('fc-configure-backdrop')) {
      this.closeAll();
    }
  }
}
