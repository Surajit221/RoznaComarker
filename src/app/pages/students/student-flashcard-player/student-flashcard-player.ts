/**
 * Changed: Template-aware study modes (term-def / qa / concept), per-card result
 *          tracking with studentAnswer + isCorrect, Q&A reveal flow, retry-mode
 *          card filtering from router state, and full submission payload.
 * Why: Parts 1-3 and Part 6 of flashcard template system.
 * Template awareness: reads template from loaded FlashcardSet; branches grade
 *   logic so term-def/concept use flip→grade while qa uses reveal→self-grade.
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
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AssignmentApiService, type BackendAssignment } from '../../../api/assignment-api.service';
import { AssignmentStateService } from '../../../services/assignment-state.service';
import type { FlashCard, FlashcardSet, CardResult } from '../../../models/flashcard-set.model';

@Component({
  selector: 'app-student-flashcard-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-flashcard-player.html',
  styleUrl: './student-flashcard-player.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentFlashcardPlayer implements OnInit, OnDestroy {
  private readonly router          = inject(Router);
  private readonly route           = inject(ActivatedRoute);
  private readonly flashcardApi    = inject(FlashcardApiService);
  private readonly assignmentApi   = inject(AssignmentApiService);
  private readonly assignmentState = inject(AssignmentStateService);
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly destroy$        = new Subject<void>();

  set: FlashcardSet | null = null;
  cards: FlashCard[]       = [];
  currentIndex             = 0;
  cardResults: CardResult[] = [];
  studentAnswer            = '';
  template                 = 'term-def';
  isFlipped                = false;
  isGrading                = false;
  gradeResult: 'correct' | 'wrong' | null = null;
  isSliding                = false;
  slideOutClass            = '';
  slideInClass             = '';
  startTime                = new Date();
  isLoading                = true;
  hasError                 = false;
  errorMessage             = 'Could not load this flashcard set.';

  private assignmentId           = '';
  classId                        = '';
  private resolvedFlashcardSetId = '';
  private retryCardIds: string[] = [];

  private get flashcardSetId(): string {
    return this.route.snapshot.paramMap.get('flashcardSetId') ?? '';
  }

  get currentCard(): FlashCard | null { return this.cards[this.currentIndex] ?? null; }
  get answeredCount(): number { return this.cardResults.length; }
  get knownCount(): number { return this.cardResults.filter(r => r.known).length; }
  get learningCount(): number { return this.cardResults.filter(r => !r.known).length; }
  get progress(): number {
    return this.cards.length ? (this.answeredCount / this.cards.length) * 100 : 0;
  }
  get isComplete(): boolean {
    return this.cards.length > 0 && this.answeredCount === this.cards.length;
  }

  ngOnInit(): void {
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId') ?? '';
    this.classId      = this.route.snapshot.queryParamMap.get('classId') ?? '';
    this.startTime    = new Date();

    const navState = typeof history !== 'undefined' ? (history.state ?? {}) : {};
    if (Array.isArray(navState.retryCardIds) && navState.retryCardIds.length > 0) {
      this.retryCardIds = navState.retryCardIds;
    }

    if (this.assignmentId) {
      this.isLoading = true;
      this.cdr.markForCheck();
      this.assignmentApi.getMyFlashcardSubmission(this.assignmentId).then((sub) => {
        if (sub && !this.retryCardIds.length) {
          const resolvedSetId = (sub as any).flashcardSetId ?? '';
          this.router.navigate(['/student/results'], {
            state: {
              score:           sub.score,
              total:           sub.totalCards ?? 100,
              timeTaken:       sub.timeTaken,
              setTitle:        '',
              classId:         this.classId,
              assignmentId:    this.assignmentId,
              flashcardSetId:  resolvedSetId,
              template:        sub.template ?? 'term-def',
              cardResults:     sub.cardResults ?? [],
              cards:           sub.cards ?? [],
              correctCount:    null,
              needsReviewCount: null,
              alreadySubmitted: true,
              type:            'flashcard',
            },
          });
          return;
        }
        this.loadSet();
      }).catch(() => this.loadSet());
    } else {
      this.loadSet();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.speechSynthesis.cancel();
  }

  goBackToClass(): void {
    if (this.classId) {
      this.router.navigate(['/student/classroom', this.classId]);
    } else {
      this.router.navigate(['/student/my-classes']);
    }
  }

  retry(): void {
    this.hasError = false;
    this.errorMessage = 'Could not load this flashcard set.';
    this.loadSet();
  }

  flipCard(): void {
    if (this.isSliding || this.template === 'qa') return;
    this.isFlipped = !this.isFlipped;
    this.cdr.markForCheck();
  }

  speak(): void {
    if (!this.currentCard) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(this.currentCard.back));
  }

  onAnswerInput(event: Event): void {
    this.studentAnswer = (event.target as HTMLTextAreaElement).value;
  }

  /** Q&A mode: send answer to AI for grading, then flip to reveal result */
  checkAnswer(): void {
    if (!this.currentCard || this.isGrading) return;
    this.isGrading = true;
    this.cdr.markForCheck();

    this.flashcardApi
      .gradeAnswer(
        this.currentCard.front,
        this.currentCard.back,
        this.studentAnswer,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.gradeResult = result.isCorrect ? 'correct' : 'wrong';
          this.isFlipped   = true;
          this.isGrading   = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isGrading = false;
          this.isFlipped = true;
          this.cdr.markForCheck();
        },
      });
  }

  /** Q&A mode: advance after AI has graded (gradeResult is already set) */
  advanceAfterGrade(): void {
    if (!this.currentCard) return;
    const known = this.gradeResult === 'correct';
    this.cardResults.push({
      cardId:        String((this.currentCard as any)._id ?? ''),
      known,
      studentAnswer: this.studentAnswer || undefined,
      isCorrect:     known,
    });
    this.gradeResult = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markCorrect(): void {
    if (!this.currentCard) return;
    this.cardResults.push({
      cardId: String((this.currentCard as any)._id ?? ''),
      known: true,
      studentAnswer: this.studentAnswer || undefined,
      isCorrect: true,
    });
    this.gradeResult = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markWrong(): void {
    if (!this.currentCard) return;
    this.cardResults.push({
      cardId: String((this.currentCard as any)._id ?? ''),
      known: false,
      studentAnswer: this.studentAnswer || undefined,
      isCorrect: false,
    });
    this.gradeResult = null;
    this.advance();
  }

  markKnown(): void {
    if (this.isSliding || !this.currentCard || !this.isFlipped) return;
    this.cardResults.push({
      cardId: String((this.currentCard as any)._id ?? ''),
      known: true,
    });
    this.advance();
  }

  markLearning(): void {
    if (this.isSliding || !this.currentCard || !this.isFlipped) return;
    this.cardResults.push({
      cardId: String((this.currentCard as any)._id ?? ''),
      known: false,
    });
    this.advance();
  }

  private advance(): void {
    if (this.isComplete) {
      this.onComplete();
      return;
    }

    this.isFlipped     = false;
    this.studentAnswer = '';
    this.gradeResult   = null;
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

  private onComplete(): void {
    const elapsed = Math.round((Date.now() - this.startTime.getTime()) / 1000);
    const total   = this.cards.length;
    const score   = total > 0 ? Math.round((this.knownCount / total) * 100) : 0;
    const resolvedSetId = this.resolvedFlashcardSetId || this.flashcardSetId;

    if (this.assignmentId) {
      const submitPayload = {
        score,
        timeTaken:   elapsed,
        template:    this.template,
        totalCards:  total,
        cardResults: this.cardResults.map(r => ({
          cardId:        r.cardId,
          known:         r.known,
          studentAnswer: r.studentAnswer ?? null,
          isCorrect:     r.isCorrect ?? null,
        })),
        results: this.cardResults.map(r => ({
          cardId: r.cardId,
          status: r.known ? 'know' : 'learning',
        })),
      };
      this.assignmentApi
        .submitFlashcardAssignment(this.assignmentId, submitPayload)
        .then(() => this.assignmentState.markCompleted(this.assignmentId))
        .catch(() => { /* non-blocking */ });
    }

    this.router.navigate(['/student/results'], {
      state: {
        score,
        total,
        timeTaken:        elapsed,
        setTitle:         this.set?.title ?? '',
        classId:          this.classId,
        assignmentId:     this.assignmentId,
        flashcardSetId:   resolvedSetId,
        template:         this.template,
        cardResults:      this.cardResults,
        cards:            this.cards,
        correctCount:     this.knownCount,
        needsReviewCount: this.learningCount,
        type:             'flashcard',
      },
    });
  }

  private loadSet(): void {
    this.isLoading = true;
    this.hasError  = false;
    this.errorMessage = 'Could not load this flashcard set.';
    this.cdr.markForCheck();

    if (this.assignmentId) {
      this.assignmentApi.getAssignmentById(this.assignmentId)
        .then((assignment) => this.loadResolvedSet(assignment))
        .catch(() => {
          this.setLoadError('This flashcard assignment is no longer available.');
        });
      return;
    }

    this.loadFlashcardSet(this.flashcardSetId);
  }

  private loadResolvedSet(assignment: BackendAssignment): void {
    if (assignment.resourceType !== 'flashcard' || !assignment.resourceId) {
      this.setLoadError('This flashcard assignment is no longer available.');
      return;
    }

    this.resolvedFlashcardSetId = assignment.resourceId;
    this.loadFlashcardSet(this.resolvedFlashcardSetId);
  }

  private loadFlashcardSet(setId: string): void {
    if (!setId) {
      this.setLoadError('This flashcard assignment is missing its flashcard set.');
      return;
    }

    this.flashcardApi
      .getSetById(setId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.set      = data;
          this.template = (data as any).template ?? 'term-def';
          let allCards  = [...(data.cards ?? [])];

          if (this.retryCardIds.length > 0) {
            allCards = allCards.filter(c =>
              this.retryCardIds.includes(String((c as any)._id ?? ''))
            );
          }

          this.cards     = allCards;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            this.setLoadError('This flashcard set is no longer available. Your teacher may have removed it.');
            return;
          }
          if (err.status === 403) {
            this.setLoadError('You do not have access to this flashcard set.');
            return;
          }
          this.setLoadError('Could not load this flashcard set.');
        },
      });
  }

  private setLoadError(message: string): void {
    this.isLoading = false;
    this.hasError  = true;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }
}
