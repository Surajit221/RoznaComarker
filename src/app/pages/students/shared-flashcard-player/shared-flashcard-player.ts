/**
 * SharedFlashcardPlayer — PART 2 (public share link viewer)
 * Route: /shared/flashcards/:shareToken  (no auth guard)
 *
 * Anyone with the link can study the flashcard set.
 * - If user IS logged in AND enrolled → submission is saved.
 * - If user IS logged in but NOT enrolled → "Join class to save progress" banner.
 * - If user is NOT logged in → "Sign in to save your progress" banner.
 * "Study again" always visible.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashCard } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-shared-flashcard-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shared-flashcard-player.html',
  styleUrl: './shared-flashcard-player.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedFlashcardPlayer implements OnInit, OnDestroy {
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  title        = '';
  cards: FlashCard[] = [];
  currentIndex = 0;
  isFlipped    = false;

  isLoading  = true;
  errorMsg: string | null = null;

  /** Study session state */
  knownCards: FlashCard[]    = [];
  learningCards: FlashCard[] = [];
  startTime = new Date();
  isComplete = false;
  score      = 0;

  /** Post-completion banner state */
  isSubmitting     = false;
  submitBanner: 'saved' | 'not_enrolled' | 'sign_in' | null = null;
  alreadyCompleted = false;

  private shareToken = '';

  get currentCard(): FlashCard | null { return this.cards[this.currentIndex] ?? null; }
  get progress(): number {
    const answered = this.knownCards.length + this.learningCards.length;
    return this.cards.length ? (answered / this.cards.length) * 100 : 0;
  }

  ngOnInit(): void {
    this.shareToken = this.route.snapshot.paramMap.get('shareToken') ?? '';
    this.loadSet();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.speechSynthesis?.cancel();
  }

  flip(): void {
    this.isFlipped = !this.isFlipped;
    this.cdr.markForCheck();
  }

  speak(): void {
    if (!this.currentCard) return;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(this.currentCard.back));
  }

  grade(status: 'know' | 'learning'): void {
    if (!this.currentCard) return;
    const card = this.currentCard;
    if (status === 'know') this.knownCards.push(card);
    else this.learningCards.push(card);

    if (this.knownCards.length + this.learningCards.length === this.cards.length) {
      const total = this.cards.length;
      this.score     = Math.round((this.knownCards.length / total) * 100);
      this.isComplete = true;
      this.cdr.markForCheck();
      this.trySubmit();
      return;
    }

    this.isFlipped = false;
    this.currentIndex++;
    this.cdr.markForCheck();
  }

  /** Restart the study session */
  studyAgain(): void {
    this.knownCards    = [];
    this.learningCards = [];
    this.currentIndex  = 0;
    this.isFlipped     = false;
    this.isComplete    = false;
    this.score         = 0;
    this.submitBanner  = null;
    this.startTime     = new Date();
    this.cdr.markForCheck();
  }

  goToSignIn(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: window.location.pathname } });
  }

  private loadSet(): void {
    this.isLoading = true;
    this.errorMsg  = null;
    this.cdr.markForCheck();

    this.flashcardApi
      .getSharedSet(this.shareToken)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.title     = data.title;
          this.cards     = data.cards ?? [];
          this.startTime = new Date();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading = false;
          this.errorMsg  = err.status === 404
            ? 'This share link is no longer active.'
            : 'Failed to load flashcard set. Please try again.';
          this.cdr.markForCheck();
        },
      });
  }

  private trySubmit(): void {
    const token = this.getJwtToken();
    if (!token) {
      this.submitBanner = 'sign_in';
      this.cdr.markForCheck();
      return;
    }

    const elapsed = Math.round((Date.now() - this.startTime.getTime()) / 1000);
    const results = [
      ...this.knownCards.map((c) => ({ cardId: String((c as { _id?: string })._id ?? ''), status: 'know' })),
      ...this.learningCards.map((c) => ({ cardId: String((c as { _id?: string })._id ?? ''), status: 'learning' })),
    ];

    this.isSubmitting = true;
    this.cdr.markForCheck();

    this.flashcardApi
      .submitSharedSession(this.shareToken, { score: this.score, timeTaken: elapsed, results })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submitBanner  = 'saved';
          this.isSubmitting  = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting = false;
          if (err.status === 403) {
            this.submitBanner = 'not_enrolled';
          } else if (err.status === 401) {
            this.submitBanner = 'sign_in';
          }
          this.cdr.markForCheck();
        },
      });
  }

  private getJwtToken(): string | null {
    try {
      return localStorage.getItem('token') || localStorage.getItem('authToken') || sessionStorage.getItem('token');
    } catch {
      return null;
    }
  }
}
