/**
 * Changed: Added template awareness, per-card cardResults breakdown, retry-wrong-cards
 *          action, study-again action, and flashcardSetId forwarding.
 * Why: Parts 4 and 7 of flashcard template system.
 * Template awareness: reads template from router state and conditionally renders
 *   Q&A per-card detail (correct answer vs student answer) or term-def/concept
 *   review list for cards marked as needing review.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import type { CardResult, FlashCard } from '../../../models/flashcard-set.model';

interface ResultState {
  score:             number | null;
  total:             number;
  timeTaken:         number;
  setTitle:          string;
  classId:           string;
  assignmentId:      string;
  flashcardSetId?:   string;
  template?:         string;
  cardResults?:      CardResult[];
  cards?:            FlashCard[];
  correctCount?:     number | null;
  needsReviewCount?: number | null;
  type:              'flashcard' | 'worksheet';
}

@Component({
  selector: 'app-student-results-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-results-page.html',
  styleUrl: './student-results-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentResultsPage implements OnInit {
  private readonly router = inject(Router);

  score:            number | null = null;
  total             = 0;
  timeTaken         = 0;
  setTitle          = '';
  classId           = '';
  assignmentId      = '';
  flashcardSetId    = '';
  template          = 'term-def';
  cardResults:      CardResult[] = [];
  cards:            FlashCard[]  = [];
  correctCount:     number | null = null;
  needsReviewCount: number | null = null;
  type: 'flashcard' | 'worksheet' = 'flashcard';
  hasState          = false;

  get scorePercent(): number {
    return this.score !== null ? this.score : 0;
  }

  get formattedTime(): string {
    const m = Math.floor(this.timeTaken / 60);
    const s = this.timeTaken % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }

  get hasFlashcardBreakdown(): boolean {
    return this.correctCount !== null && this.needsReviewCount !== null;
  }

  get cardResultsWithContent(): Array<CardResult & { card?: FlashCard }> {
    return this.cardResults.map(r => ({
      ...r,
      card: this.cards.find(c => String((c as any)._id ?? '') === r.cardId),
    }));
  }

  get wrongCards(): Array<CardResult & { card?: FlashCard }> {
    return this.cardResultsWithContent.filter(r => !r.known);
  }

  get hasPerCardBreakdown(): boolean {
    return this.cardResults.length > 0 && this.cards.length > 0;
  }

  get canRetryWrong(): boolean {
    return this.wrongCards.length > 0 && !!this.flashcardSetId;
  }

  ngOnInit(): void {
    const nav   = this.router.getCurrentNavigation();
    const state = (
      nav?.extras?.state ?? (typeof history !== 'undefined' ? history.state : {})
    ) as Partial<ResultState>;

    if (state && (state.total ?? 0) > 0) {
      this.score           = state.score           ?? null;
      this.total           = state.total           ?? 0;
      this.timeTaken       = state.timeTaken       ?? 0;
      this.setTitle        = state.setTitle        ?? '';
      this.classId         = state.classId         ?? '';
      this.assignmentId    = state.assignmentId    ?? '';
      this.flashcardSetId  = state.flashcardSetId  ?? '';
      this.template        = state.template        ?? 'term-def';
      this.cardResults     = state.cardResults     ?? [];
      this.cards           = state.cards           ?? [];
      this.correctCount    = state.correctCount    ?? null;
      this.needsReviewCount = state.needsReviewCount ?? null;
      this.type            = state.type            ?? 'flashcard';
      this.hasState        = true;
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }

  goToClasses(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }

  studyAgain(): void {
    this.router.navigate(['/student/flashcard-player', this.flashcardSetId], {
      queryParams: {
        assignmentId: this.assignmentId || undefined,
        classId:      this.classId      || undefined,
      },
    });
  }

  retryWrongCards(): void {
    this.router.navigate(['/student/flashcard-player', this.flashcardSetId], {
      queryParams: {
        assignmentId: this.assignmentId || undefined,
        classId:      this.classId      || undefined,
      },
      state: { retryCardIds: this.wrongCards.map(r => r.cardId) },
    });
  }
}
