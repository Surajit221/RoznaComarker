import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashCard, FlashcardSet } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-study-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './study-mode.html',
  styleUrl: './study-mode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyMode implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  set: FlashcardSet | null = null;
  cards: FlashCard[]       = [];
  currentIndex             = 0;
  knownCards: FlashCard[]    = [];
  learningCards: FlashCard[] = [];
  isFlipped                = false;
  isSliding                = false;
  slideOutClass            = '';
  slideInClass             = '';
  startTime                = new Date();
  isLoading                = true;

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  /** Navigate back to the flashcard detail page without relying on history.back() */
  goBack(): void {
    this.router.navigate(['/flashcards', this.setId]);
  }

  /** Toggle the card flip (front ↔ back) */
  flipCard(): void {
    if (this.isSliding) return;
    this.isFlipped = !this.isFlipped;
    this.cdr.markForCheck();
  }

  get currentCard(): FlashCard | null { return this.cards[this.currentIndex] ?? null; }
  get answeredCount(): number { return this.knownCards.length + this.learningCards.length; }
  get progress(): number {
    return this.cards.length ? (this.answeredCount / this.cards.length) * 100 : 0;
  }
  get isComplete(): boolean {
    return this.cards.length > 0 && this.answeredCount === this.cards.length;
  }

  ngOnInit(): void {
    this.startTime = new Date();
    this.loadSet();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.speechSynthesis.cancel();
  }

  private loadSet(): void {
    this.isLoading = true;
    this.flashcardApi.getSetById(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.set   = data;
        this.cards = [...(data.cards ?? [])];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Speak the current card's back (definition) using Web Speech API */
  speak(): void {
    if (!this.currentCard) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(this.currentCard.back));
  }

  /**
   * Grade the current card as 'know' or 'learning'.
   * Animates slide-out then slide-in before advancing.
   * On completion, navigates to results with router state.
   */
  grade(status: 'know' | 'learning'): void {
    if (this.isSliding || !this.currentCard || !this.isFlipped) return;
    const card = this.currentCard;

    if (status === 'know') this.knownCards.push(card);
    else this.learningCards.push(card);

    if (this.isComplete) {
      const elapsed = Math.round((Date.now() - this.startTime.getTime()) / 1000);
      this.router.navigate(
        ['/flashcards', this.setId, 'study', 'results'],
        { state: { known: this.knownCards, learning: this.learningCards, timeTaken: elapsed } }
      );
      return;
    }

    this.isFlipped     = false;
    this.isSliding     = true;
    this.slideOutClass = 'slide-out-left';
    this.cdr.markForCheck();

    setTimeout(() => {
      this.currentIndex++;
      this.slideOutClass = '';
      this.slideInClass  = 'slide-in-right';
      this.cdr.markForCheck();

      setTimeout(() => {
        this.slideInClass = '';
        this.isSliding    = false;
        this.cdr.markForCheck();
      }, 300);
    }, 300);
  }
}
