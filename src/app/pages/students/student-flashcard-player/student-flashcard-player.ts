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
import { Subject, takeUntil, retry, catchError, of, debounceTime, timer } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { AssignmentApiService, type BackendAssignment } from '../../../api/assignment-api.service';
import { AssignmentStateService } from '../../../services/assignment-state.service';
import type { FlashCard, FlashcardSet, CardResult, RuntimeCardProgress } from '../../../models/flashcard-set.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-student-flashcard-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-flashcard-player.html',
  styleUrl: './student-flashcard-player.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentFlashcardPlayer implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly assignmentApi = inject(AssignmentApiService);
  private readonly assignmentState = inject(AssignmentStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly answerSave$ = new Subject<void>();

  set: FlashcardSet | null = null;
  cards: FlashCard[] = [];
  currentIndex = 0;
  /** Derived compatibility view. runtimeByCardId is the only runtime truth. */
  cardResults: CardResult[] = [];
  studentAnswer = '';
  template = 'term-def';
  isFlipped = false;
  isGrading = false;
  gradeResult: 'correct' | 'wrong' | null = null;
  gradeExplanation = '';
  gradingError = '';
  private authoritativeGrade: CardResult | null = null;
  isSliding = false;
  slideOutClass = '';
  slideInClass = '';
  startTime = new Date();
  isLoading = true;
  isCompleting = false;
  hasError = false;
  errorMessage = 'Could not load this flashcard set.';

  /** Progress tracking */
  cardsViewed: number[] = [];
  cardResultsMap: Map<number, 'knew' | 'didnt_know'> = new Map();
  saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  private readonly SAVE_RETRY_ATTEMPTS = 3;
  private readonly progressRetryDelay = (error: HttpErrorResponse) => {
    if (![0, 502, 503, 504].includes(error.status)) throw error;
    return timer(1000);
  };

  /** Resume modal */
  showResumeModal = false;
  savedProgress: any = null;
  isResuming = false;
  localStorageKey = '';

  private assignmentId = '';
  classId = '';
  private resolvedFlashcardSetId = '';
  private retryCardIds: string[] = [];
  private previousCardResults: CardResult[] = [];
  private originalTotalCards = 0;
  private progressRevision = 0;
  private progressSaveInFlight = false;
  private pendingNextIndex: number | null = null;
  private pendingProgressSave = false;
  private pendingExit = false;
  private pendingCompletion = false;
  private completionStarted = false;
  private runtimeByCardId = new Map<string, RuntimeCardProgress>();
  resumedMessage = '';
  finalizationFailed = false;

  private getCanonicalCardId(card: FlashCard | null | undefined): string {
    return String((card as any)?._id ?? (card as any)?.id ?? (card as any)?.cardId ?? '');
  }

  private debugProgress(event: 'FLASHCARD_PROGRESS_SAVE' | 'FLASHCARD_PROGRESS_LOAD' | 'FLASHCARD_RESUME_STATE', data: any): void {
    if (!environment.production) console.debug(event, data);
  }

  private get flashcardSetId(): string {
    return this.route.snapshot.paramMap.get('flashcardSetId') ?? '';
  }

  get currentCard(): FlashCard | null {
    return this.cards[this.currentIndex] ?? null;
  }
  get displayCardNumber(): number {
    return this.cards.length ? Math.min(Math.max(this.currentIndex, 0) + 1, this.cards.length) : 0;
  }
  get answeredCount(): number {
    return this.completedRuntime().length;
  }
  get knownCount(): number {
    return this.completedRuntime().filter((r) => this.template === 'qa' ? r.isCorrect === true : r.known === true).length;
  }
  get learningCount(): number {
    return this.completedRuntime().filter((r) => this.template === 'qa' ? r.isCorrect === false : r.known === false).length;
  }
  get incompleteCount(): number {
    return Math.max(0, this.cards.length - this.answeredCount);
  }
  get progress(): number {
    return this.cards.length ? (this.answeredCount / this.cards.length) * 100 : 0;
  }
  get isComplete(): boolean {
    return this.isSessionComplete(this.runtimeByCardId, this.cards, this.template);
  }

  private isSessionComplete(
    runtimeProgress: Map<string, RuntimeCardProgress>,
    cards: FlashCard[],
    template: string,
  ): boolean {
    if (!cards.length) return false;
    return cards.every((card) => {
      const entry = runtimeProgress.get(this.getCanonicalCardId(card));
      return template === 'qa'
        ? entry?.completed === true && typeof entry.isCorrect === 'boolean'
        : entry?.completed === true && typeof entry.known === 'boolean';
    });
  }

  private completedRuntime(): RuntimeCardProgress[] {
    return this.cards.map((card) => this.runtimeByCardId.get(this.getCanonicalCardId(card)))
      .filter((entry): entry is RuntimeCardProgress => entry?.completed === true);
  }

  private initializeRuntimeCards(): void {
    this.runtimeByCardId = new Map(this.cards.map((card) => {
      const cardId = this.getCanonicalCardId(card);
      return [cardId, { cardId, completed: false } as RuntimeCardProgress] as const;
    }).filter(([cardId]) => Boolean(cardId)));
    this.syncCompatibilityViews();
  }

  private upsertRuntime(cardId: string, update: Partial<RuntimeCardProgress>): void {
    if (!cardId) return;
    if (!this.runtimeByCardId.has(cardId)) {
      if (!this.cards.some((card) => this.getCanonicalCardId(card) === cardId)) return;
      this.runtimeByCardId.set(cardId, { cardId, completed: false });
    }
    this.runtimeByCardId.set(cardId, { ...this.runtimeByCardId.get(cardId)!, ...update, cardId });
    this.syncCompatibilityViews();
  }

  private syncCompatibilityViews(): void {
    this.cardResults = this.completedRuntime().map((entry) => ({
      cardId: entry.cardId,
      known: this.template === 'qa' ? entry.isCorrect === true : entry.known === true,
      studentAnswer: entry.studentAnswer,
      isCorrect: entry.isCorrect,
      correctAnswer: entry.correctAnswer,
      gradingMethod: entry.gradingMethod,
      confidence: entry.confidence,
      explanation: entry.explanation,
      checkedAt: entry.checkedAt,
    }));
    this.cardsViewed = [];
    this.cardResultsMap.clear();
    this.cards.forEach((card, index) => {
      const entry = this.runtimeByCardId.get(this.getCanonicalCardId(card));
      if (!entry?.completed) return;
      this.cardsViewed.push(index);
      if (this.template !== 'qa' && typeof entry.known === 'boolean') {
        this.cardResultsMap.set(index, entry.known ? 'knew' : 'didnt_know');
      }
    });
  }

  private isCardCompleted(cardId: string): boolean {
    return this.runtimeByCardId.get(cardId)?.completed === true;
  }

  private getFirstIncompleteCardIndex(): number {
    return this.cards.findIndex((card) => !this.isCardCompleted(this.getCanonicalCardId(card)));
  }

  ngOnInit(): void {
    this.answerSave$.pipe(debounceTime(750), takeUntil(this.destroy$)).subscribe(() => {
      if (!this.isFlipped && !this.isGrading) this.saveProgress();
    });
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId') ?? '';
    this.classId = this.route.snapshot.queryParamMap.get('classId') ?? '';
    this.startTime = new Date();

    const navState = typeof history !== 'undefined' ? (history.state ?? {}) : {};
    if (Array.isArray(navState.retryCardIds) && navState.retryCardIds.length > 0) {
      this.retryCardIds = navState.retryCardIds;
    }
    if (
      Array.isArray(navState['previousCardResults']) &&
      navState['previousCardResults'].length > 0
    ) {
      this.previousCardResults = navState['previousCardResults'] as CardResult[];
    }
    if (typeof navState['originalTotalCards'] === 'number' && navState['originalTotalCards'] > 0) {
      this.originalTotalCards = navState['originalTotalCards'];
    }

    if (this.assignmentId) {
      this.isLoading = true;
      this.cdr.markForCheck();
      this.assignmentApi
        .getMyFlashcardSubmission(this.assignmentId)
        .then((sub) => {
          if (sub && !this.retryCardIds.length) {
            const resolvedSetId = (sub as any).flashcardSetId ?? '';
            this.router.navigate(['/student/results'], {
              state: {
                score: sub.score,
                total: sub.totalCards ?? 100,
                timeTaken: sub.timeTaken,
                setTitle: '',
                classId: this.classId,
                assignmentId: this.assignmentId,
                flashcardSetId: resolvedSetId,
                template: sub.template ?? 'term-def',
                cardResults: sub.cardResults ?? [],
                cards: sub.cards ?? [],
                correctCount: null,
                needsReviewCount: null,
                alreadySubmitted: true,
                type: 'flashcard',
              },
            });
            return;
          }
          this.loadSet();
        })
        .catch(() => this.loadSet());
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
    if (this.cards.length && (this.resolvedFlashcardSetId || this.flashcardSetId)) {
      this.pendingExit = true;
      this.saveProgress();
      this.cdr.markForCheck();
      return;
    }
    this.navigateBackToClass();
  }

  private navigateBackToClass(): void {
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
    if (this.template === 'qa') {
      this.upsertRuntime(this.getCanonicalCardId(this.currentCard), { studentAnswer: this.studentAnswer });
      this.answerSave$.next();
    }
  }

  /** Q&A mode: send answer to AI for grading, then flip to reveal result */
  checkAnswer(): void {
    if (!this.currentCard || this.isGrading || this.isFlipped || !this.studentAnswer.trim()) return;
    this.isGrading = true;
    this.gradingError = '';
    this.cdr.markForCheck();
    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    const cardId = this.getCanonicalCardId(this.currentCard);
    this.flashcardApi
      .gradeAnswer(setId, cardId, this.studentAnswer, this.assignmentId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.gradeResult = result.isCorrect ? 'correct' : 'wrong';
          this.gradeExplanation = result.explanation || '';
          this.authoritativeGrade = { cardId, known: result.isCorrect,
            studentAnswer: result.studentAnswer, isCorrect: result.isCorrect,
            correctAnswer: result.correctAnswer, gradingMethod: result.gradingMethod,
            confidence: result.confidence, explanation: result.explanation, checkedAt: result.checkedAt };
          this.upsertRuntime(cardId, { completed: true, known: result.isCorrect,
            studentAnswer: result.studentAnswer, isCorrect: result.isCorrect,
            correctAnswer: result.correctAnswer, gradingMethod: result.gradingMethod,
            confidence: result.confidence, explanation: result.explanation,
            checkedAt: result.checkedAt, completedAt: result.checkedAt });
          this.saveProgress();
          this.isFlipped = true;
          this.isGrading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isGrading = false;
          this.gradingError = "We couldn't check this answer right now. Please try again.";
          this.cdr.markForCheck();
        },
      });
  }

  /** Q&A mode: advance after AI has graded (gradeResult is already set) */
  advanceAfterGrade(): void {
    if (!this.currentCard || !this.authoritativeGrade || !this.gradeResult) return;
    this.gradeResult = null;
    this.gradeExplanation = '';
    this.gradingError = '';
    this.authoritativeGrade = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markCorrect(): void {
    if (!this.currentCard || this.template === 'qa') return;
    const cardId = this.getCanonicalCardId(this.currentCard);
    this.upsertRuntime(cardId, { completed: true, known: true,
      studentAnswer: this.studentAnswer || undefined, isCorrect: true,
      completedAt: new Date().toISOString() });
    this.gradeResult = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markWrong(): void {
    if (!this.currentCard || this.template === 'qa') return;
    const cardId = this.getCanonicalCardId(this.currentCard);
    this.upsertRuntime(cardId, { completed: true, known: false,
      studentAnswer: this.studentAnswer || undefined, isCorrect: false,
      completedAt: new Date().toISOString() });
    this.gradeResult = null;
    this.advance();
  }

  markKnown(): void {
    if (this.isSliding || this.saveState === 'saving' || this.pendingCompletion || !this.currentCard || !this.isFlipped) return;
    const cardId = this.getCanonicalCardId(this.currentCard);
    this.upsertRuntime(cardId, { completed: true, known: true, completedAt: new Date().toISOString() });
    this.advance();
  }

  markLearning(): void {
    if (this.isSliding || this.saveState === 'saving' || this.pendingCompletion || !this.currentCard || !this.isFlipped) return;
    const cardId = this.getCanonicalCardId(this.currentCard);
    this.upsertRuntime(cardId, { completed: true, known: false, completedAt: new Date().toISOString() });
    this.advance();
  }

  private advance(): void {
    this.syncCompatibilityViews();
    const nextIndex = this.getFirstIncompleteCardIndex();
    const willComplete = this.isSessionComplete(this.runtimeByCardId, this.cards, this.template);

    if (willComplete) {
      // Keep the component alive until the final canonical snapshot is saved.
      // Navigating immediately would cancel the PATCH via takeUntil(destroy$).
      if (this.retryCardIds.length) this.onComplete();
      else {
        this.pendingCompletion = true;
        this.saveProgress();
      }
      return;
    }

    if (nextIndex >= this.cards.length) return;

    // Move the authoritative in-memory cursor immediately. Persistence is asynchronous
    // and must never make the visible player wait on, or reconcile from, a save response.
    this.currentIndex = nextIndex;

    // Save progress with the NEXT index (where student is now)
    // This ensures resume puts them on the correct card
    this.saveProgressWithNextIndex(nextIndex);

    this.isFlipped = false;
    this.studentAnswer = '';
    this.gradeResult = null;
    this.isSliding = true;
    this.slideOutClass = 'slide-out-left';
    this.cdr.markForCheck();

    setTimeout(() => {
      this.slideOutClass = '';
      this.slideInClass = 'slide-in-right';
      this.cdr.markForCheck();

      setTimeout(() => {
        this.slideInClass = '';
        this.isSliding = false;
        this.cdr.markForCheck();
      }, 300);
    }, 300);
  }

  private buildProgressSnapshot(targetIndex: number | null): any {
    this.syncCompatibilityViews();
    const completed = this.completedRuntime();
    const cardResults: Record<string, 'knew' | 'didnt_know'> = {};
    if (this.template !== 'qa') {
      for (const entry of completed) cardResults[entry.cardId] = entry.known ? 'knew' : 'didnt_know';
    }
    const cardProgress = [...this.runtimeByCardId.values()]
      .filter((entry) => entry.completed || Boolean(entry.studentAnswer))
      .map((entry) => ({
        cardId: entry.cardId,
        studentAnswer: entry.studentAnswer,
        ...(this.template !== 'qa' && entry.completed
          ? { selfRating: entry.known ? 'knew' as const : 'didnt_know' as const }
          : {}),
        completedAt: entry.completedAt || entry.checkedAt || null,
      }));
    const maxIndex = Math.max(this.cards.length - 1, 0);
    const safeIndex = Math.min(Math.max(targetIndex ?? this.currentIndex, 0), maxIndex);
    const sessionComplete = this.isSessionComplete(this.runtimeByCardId, this.cards, this.template);
    return {
      status: sessionComplete ? 'completed' : (completed.length > 0 || cardProgress.length > 0 ? 'in_progress' : 'not_started'),
      lastCardIndex: safeIndex,
      cardsViewed: [...this.cardsViewed],
      cardResults,
      assignmentId: this.assignmentId || undefined,
      template: this.template,
      totalCards: this.cards.length,
      currentCardId: sessionComplete ? null : (this.getCanonicalCardId(this.cards[safeIndex]) || null),
      cardProgress,
      expectedRevision: this.progressRevision,
    };
  }

  private debugSavePayload(setId: string, payload: any): void {
    this.debugProgress('FLASHCARD_PROGRESS_SAVE', {
      setId,
      assignmentId: payload.assignmentId ?? null,
      currentCardId: payload.currentCardId ?? null,
      revision: payload.expectedRevision ?? 0,
      cardProgress: (payload.cardProgress || []).map((item: any) => {
        const runtime = this.runtimeByCardId.get(String(item.cardId));
        return { cardId: String(item.cardId), isChecked: this.template === 'qa' && runtime?.completed === true,
          isCorrect: typeof runtime?.isCorrect === 'boolean' ? runtime.isCorrect : null,
          selfRating: item.selfRating ?? null };
      }),
    });
  }

  private finishDeferredAction(response: any): void {
    if (!response || this.progressSaveInFlight || this.pendingNextIndex !== null || this.pendingProgressSave) return;
    if (this.pendingCompletion) {
      this.pendingCompletion = false;
      if (response.status === 'completed') this.onComplete();
      else {
        this.saveState = 'error';
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.pendingExit) {
      this.pendingExit = false;
      this.navigateBackToClass();
    }
  }

  private failDeferredAction(): void {
    this.pendingExit = false;
    this.pendingCompletion = false;
  }

  /**
   * Save initial progress when starting a fresh study session
   * This marks the assignment as "in_progress" for the teacher report
   */
  private saveInitialProgress(): void {
    if (!this.cards.length) return;

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    const progressPayload = this.buildProgressSnapshot(0);

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);
    this.debugSavePayload(setId, progressPayload);
    this.progressSaveInFlight = true;

    // Save to server (silent - don't show loading indicator for initial save)
    this.flashcardApi
      .saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: this.progressRetryDelay }),
        catchError((err) => {
          console.error('Failed to save progress:', err);
          this.saveState = 'error';
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.progressSaveInFlight = false;
        if (response?.revision !== undefined) {
          this.progressRevision = response.revision;
          this.clearLocalStorage();
        }
        if (response && this.pendingNextIndex !== null) {
          const queuedIndex = this.pendingNextIndex;
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.saveProgressWithNextIndex(queuedIndex);
        } else if (response && this.pendingProgressSave) {
          this.pendingProgressSave = false;
          this.saveProgress();
        } else if (!response) {
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.failDeferredAction();
        }
        this.finishDeferredAction(response);
      });
  }

  /**
   * Save progress with a specific next index (for use during navigation)
   * This ensures resume puts the student on the correct card
   */
  private saveProgressWithNextIndex(nextIndex: number): void {
    if (!this.cards.length) return;
    if (this.retryCardIds.length) return;

    if (this.progressSaveInFlight) {
      this.pendingNextIndex = nextIndex;
      this.pendingProgressSave = false;
      return;
    }

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    this.saveState = 'saving';
    this.progressSaveInFlight = true;
    this.cdr.markForCheck();

    const progressPayload = this.buildProgressSnapshot(nextIndex);

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);
    this.debugSavePayload(setId, progressPayload);

    // Save to server
    this.flashcardApi
      .saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: this.progressRetryDelay }),
        catchError((err) => {
          console.error('Failed to save progress:', err);
          this.saveState = 'error';
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.progressSaveInFlight = false;
        if (response) {
          this.progressRevision = response.revision ?? this.progressRevision;
          this.saveState = 'saved';
          // Clear localStorage after successful save
          this.clearLocalStorage();
        } else {
          this.saveState = 'error';
        }
        this.cdr.markForCheck();
        if (response && this.pendingNextIndex !== null) {
          const queuedIndex = this.pendingNextIndex;
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.saveProgressWithNextIndex(queuedIndex);
        } else if (response && this.pendingProgressSave) {
          this.pendingProgressSave = false;
          this.saveProgress();
        } else if (!response) {
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.failDeferredAction();
        }
        this.finishDeferredAction(response);

        // Reset to idle after a delay
        setTimeout(() => {
          if (this.saveState === 'saved' || this.saveState === 'error') {
            this.saveState = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      });
  }

  private onComplete(): void {
    if (this.completionStarted) return;
    this.completionStarted = true;
    this.isCompleting = true;
    this.finalizationFailed = false;
    this.cdr.markForCheck();
    const elapsed = Math.round((Date.now() - this.startTime.getTime()) / 1000);

    // Merge previous-round results with current-round results.
    // Current round wins (overwrites status) for any card reviewed again.
    const mergedMap = new Map<string, CardResult>();
    for (const r of this.previousCardResults) {
      mergedMap.set(r.cardId, r);
    }
    for (const r of this.cardResults) {
      mergedMap.set(r.cardId, r);
    }
    const mergedCardResults = Array.from(mergedMap.values());

    // Full card list — use set.cards (all cards) so the PDF can resolve every card.
    const allCards = this.set?.cards ?? this.cards;

    // Totals are always based on the original full deck, not just the retry subset.
    const total = this.originalTotalCards > 0 ? this.originalTotalCards : allCards.length;
    const checkedResults = this.template === 'qa'
      ? mergedCardResults.filter((r) => typeof r.isCorrect === 'boolean')
      : mergedCardResults;
    const correctCount = checkedResults.filter((r) => this.template === 'qa' ? r.isCorrect === true : r.known).length;
    const needsReviewCount = checkedResults.filter((r) => this.template === 'qa' ? r.isCorrect === false : !r.known).length;
    const incompleteCount = Math.max(0, total - mergedCardResults.length);
    const scoreDenominator = this.template === 'qa' ? checkedResults.length : total;
    const score = scoreDenominator > 0 ? Math.round((correctCount / scoreDenominator) * 100) : 0;

    const resolvedSetId = this.resolvedFlashcardSetId || this.flashcardSetId;

    if (this.assignmentId) {
      const submitPayload = {
        score,
        timeTaken: elapsed,
        template: this.template,
        totalCards: total,
        cardResults: mergedCardResults.map((r) => ({
          cardId: r.cardId,
          known: this.template === 'qa' ? r.isCorrect === true : r.known,
          studentAnswer: r.studentAnswer ?? null,
          isCorrect: r.isCorrect ?? null,
        })),
        results: mergedCardResults.map((r) => ({
          cardId: r.cardId,
          status: (this.template === 'qa' ? r.isCorrect === true : r.known) ? 'know' : 'learning',
        })),
      };
      this.assignmentApi
        .submitFlashcardAssignment(this.assignmentId, submitPayload)
        .then(() => {
          this.assignmentState.markCompleted(this.assignmentId);
          this.navigateToResults(score, total, elapsed, resolvedSetId, mergedCardResults,
            allCards, correctCount, needsReviewCount, incompleteCount);
        })
        .catch(() => {
          this.completionStarted = false;
          this.isCompleting = false;
          this.finalizationFailed = true;
          this.saveState = 'error';
          this.cdr.markForCheck();
        });
      return;
    }

    this.navigateToResults(score, total, elapsed, resolvedSetId, mergedCardResults,
      allCards, correctCount, needsReviewCount, incompleteCount);
  }

  retryFinalSubmission(): void {
    if (!this.assignmentId || this.isCompleting) return;
    this.onComplete();
  }

  private navigateToResults(
    score: number,
    total: number,
    elapsed: number,
    resolvedSetId: string,
    mergedCardResults: CardResult[],
    allCards: FlashCard[],
    correctCount: number,
    needsReviewCount: number,
    incompleteCount: number,
  ): void {
    this.router.navigate(['/student/results'], {
      state: {
        score,
        total,
        timeTaken: elapsed,
        setTitle: this.set?.title ?? '',
        classId: this.classId,
        assignmentId: this.assignmentId,
        flashcardSetId: resolvedSetId,
        template: this.template,
        cardResults: mergedCardResults,
        cards: allCards,
        correctCount,
        needsReviewCount,
        incompleteCount,
        type: 'flashcard' as const,
      },
    });
  }

  private loadSet(): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = 'Could not load this flashcard set.';
    this.cdr.markForCheck();

    if (this.assignmentId) {
      this.assignmentApi
        .getAssignmentById(this.assignmentId)
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

    // Generate localStorage key for progress backup
    const studentId = this.getStudentIdFromToken();
    this.localStorageKey = `flashcard_progress_${studentId}_${setId}_${this.assignmentId || 'no-assign'}`;

    this.flashcardApi
      .getSetById(setId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.set = data;
          this.template = (data as any).template ?? 'term-def';
          let allCards = [...(data.cards ?? [])];

          if (this.retryCardIds.length > 0) {
            allCards = allCards.filter((c) =>
              this.retryCardIds.includes(String((c as any)._id ?? '')),
            );
          }

          this.cards = allCards;
          this.currentIndex = 0;
          this.initializeRuntimeCards();

          if (this.retryCardIds.length) {
            this.isLoading = false;
            this.cdr.markForCheck();
            return;
          }

          // Progress lookup owns the fresh-start decision. This prevents an
          // asynchronous existing-progress response racing an initial card-0 save.
          this.checkForExistingProgress(setId);
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            this.setLoadError(
              'This flashcard set is no longer available. Your teacher may have removed it.',
            );
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

  /** Check for saved progress and show resume modal if needed */
  private checkForExistingProgress(setId: string): void {
    // First, try to get progress from API
    this.flashcardApi
      .getProgress(setId, this.assignmentId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          this.debugProgress('FLASHCARD_PROGRESS_LOAD', {
            setId,
            assignmentId: this.assignmentId || null,
            currentCardId: progress.currentCardId ?? null,
            revision: progress.revision ?? 0,
            cardProgress: (progress.cardProgress || []).map((item) => ({ cardId: String(item.cardId),
              isChecked: item.isChecked === true,
              isCorrect: typeof item.isCorrect === 'boolean' ? item.isCorrect : null })),
          });
          // Show resume modal if in_progress AND lastCardIndex > 0 (not at start)
          // lastCardIndex represents the card the student is CURRENTLY viewing
          if (progress.status === 'in_progress' && (progress.completedCards > 0 || (progress.cardProgress?.length ?? 0) > 0)) {
            this.savedProgress = progress;
            this.isLoading = false;
            this.resumeProgress();
          } else if (progress.status === 'completed') {
            this.savedProgress = progress;
            this.isLoading = false;
            this.resumeProgress();
          } else {
            // Check localStorage as fallback
            this.checkLocalStorageProgress(setId);
            if (!localStorage.getItem(this.localStorageKey) && this.cards.length > 0) this.saveInitialProgress();
          }
        },
        error: () => {
          // If API fails, check localStorage
          this.checkLocalStorageProgress(setId);
        },
      });
  }

  /** Check localStorage for backup progress */
  private checkLocalStorageProgress(setId: string): void {
    try {
      const saved = localStorage.getItem(this.localStorageKey);
      if (saved) {
        const localProgress = JSON.parse(saved);
        const hasPerCardState = (localProgress.cardProgress?.length ?? 0) > 0
          || Object.keys(localProgress.cardResults || {}).length > 0;
        if (localProgress.status === 'in_progress' && hasPerCardState) {
          this.savedProgress = localProgress;
          this.resumeProgress();
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  /** Resume from saved position */
  resumeProgress(): void {
    if (!this.savedProgress) return;

    this.isResuming = true;
    this.showResumeModal = false;

    const loadedRevision = Number(this.savedProgress.revision);
    this.progressRevision = Number.isInteger(loadedRevision) && loadedRevision >= 0 ? loadedRevision : 0;
    this.initializeRuntimeCards();
    const savedById = new Map<string, any>((this.savedProgress.cardProgress || [])
      .map((item: any) => [String(item.cardId ?? item._id ?? item.id ?? ''), item]));

    if (this.template === 'qa') {
      for (const [cardId, saved] of savedById) {
        if (!this.runtimeByCardId.has(cardId)) continue;
        this.upsertRuntime(cardId, { completed: saved?.isChecked === true,
          studentAnswer: saved?.studentAnswer || '', isCorrect: saved?.isChecked === true ? saved?.isCorrect : undefined,
          known: saved?.isChecked === true ? saved?.isCorrect === true : undefined,
          gradingMethod: saved?.gradingMethod, checkedAt: saved?.checkedAt,
          completedAt: saved?.completedAt });
      }
    } else {
      for (const [cardId, saved] of savedById) {
        if (!this.runtimeByCardId.has(cardId)) continue;
        if (saved?.studentAnswer) this.upsertRuntime(cardId, { studentAnswer: saved.studentAnswer });
        const rating = saved?.selfRating;
        if (rating === 'knew' || rating === 'didnt_know') {
          this.upsertRuntime(cardId, { completed: true, known: rating === 'knew',
            completedAt: saved?.completedAt });
        }
      }
      // Backward compatibility: legacy Maps use array-index keys. New Maps
      // use canonical card-ID keys.
      for (const [key, value] of Object.entries(this.savedProgress.cardResults || {})) {
        if (value !== 'knew' && value !== 'didnt_know') continue;
        const cardId = this.runtimeByCardId.has(String(key)) ? String(key)
          : this.getCanonicalCardId(this.cards[Number(key)]);
        if (cardId) this.upsertRuntime(cardId, { completed: true, known: value === 'knew' });
      }
    }

    this.syncCompatibilityViews();
    const completedIds = new Set(this.completedRuntime().map((entry) => entry.cardId));
    const firstIncomplete = this.getFirstIncompleteCardIndex();
    const savedCurrentId = String(this.savedProgress.currentCardId ?? '');
    const savedCurrentIndex = this.cards.findIndex((card) => this.getCanonicalCardId(card) === savedCurrentId);
    if (savedCurrentIndex >= 0 && !this.isCardCompleted(savedCurrentId)) this.currentIndex = savedCurrentIndex;
    else if (firstIncomplete >= 0) this.currentIndex = firstIncomplete;
    else this.currentIndex = Math.min(Math.max(this.currentIndex, 0), Math.max(this.cards.length - 1, 0));

    const currentRuntime = this.runtimeByCardId.get(this.getCanonicalCardId(this.currentCard));
    this.studentAnswer = currentRuntime?.studentAnswer || '';
    this.isFlipped = false;
    this.gradeResult = null;
    this.authoritativeGrade = null;
    this.resumedMessage = firstIncomplete >= 0 && completedIds.size > 0
      ? 'Welcome back — continuing where you left off.' : '';

    this.debugProgress('FLASHCARD_RESUME_STATE', {
      loadedCardIds: this.cards.map((card) => this.getCanonicalCardId(card)),
      savedCardIds: [...savedById.keys()],
      checkedCardIds: [...completedIds],
      currentCardId: savedCurrentId || null,
      resolvedCurrentIndex: this.currentIndex,
      correctCount: this.knownCount,
      incorrectCount: this.learningCount,
      incompleteCount: this.incompleteCount,
    });

    this.isResuming = false;
    this.cdr.markForCheck();
    if ((this.savedProgress.status === 'completed'
      || this.isSessionComplete(this.runtimeByCardId, this.cards, this.template)) && this.cards.length > 0) {
      this.resumedMessage = '';
      this.onComplete();
    }
  }

  /** Start over - reset progress */
  startOver(): void {
    this.showResumeModal = false;

    // Reset local state
    this.currentIndex = 0;
    this.completionStarted = false;
    this.isCompleting = false;
    this.initializeRuntimeCards();

    // Clear server progress
    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    this.flashcardApi
      .resetProgress(setId, this.assignmentId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    // Clear localStorage
    try {
      localStorage.removeItem(this.localStorageKey);
    } catch {
      // Ignore localStorage errors
    }

    this.cdr.markForCheck();
  }

  /** Save progress to server and localStorage */
  private saveProgress(): void {
    if (!this.cards.length) return;
    if (this.retryCardIds.length) {
      if (this.pendingCompletion) {
        this.pendingCompletion = false;
        this.onComplete();
      } else if (this.pendingExit) {
        this.pendingExit = false;
        this.navigateBackToClass();
      }
      return;
    }

    if (this.progressSaveInFlight) {
      this.pendingProgressSave = true;
      return;
    }

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    this.saveState = 'saving';
    this.progressSaveInFlight = true;
    this.cdr.markForCheck();

    const progressPayload = this.buildProgressSnapshot(this.isComplete ? null : this.currentIndex);

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);
    this.debugSavePayload(setId, progressPayload);

    // Save to server
    this.flashcardApi
      .saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: this.progressRetryDelay }),
        catchError((err) => {
          console.error('Failed to save progress:', err);
          this.saveState = 'error';
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.progressSaveInFlight = false;
        if (response) {
          this.progressRevision = response.revision ?? this.progressRevision;
          this.saveState = 'saved';
          // Clear localStorage after successful save
          this.clearLocalStorage();
        } else {
          this.saveState = 'error';
        }
        this.cdr.markForCheck();
        if (response && this.pendingNextIndex !== null) {
          const queuedIndex = this.pendingNextIndex;
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.saveProgressWithNextIndex(queuedIndex);
        } else if (response && this.pendingProgressSave) {
          this.pendingProgressSave = false;
          this.saveProgress();
        } else if (!response) {
          this.pendingNextIndex = null;
          this.pendingProgressSave = false;
          this.failDeferredAction();
        }
        this.finishDeferredAction(response);

        // Reset to idle after a delay
        setTimeout(() => {
          if (this.saveState === 'saved' || this.saveState === 'error') {
            this.saveState = 'idle';
            this.cdr.markForCheck();
          }
        }, 3000);
      });
  }

  /** Save progress to localStorage as backup */
  private saveToLocalStorage(payload: any): void {
    try {
      const data = {
        ...payload,
        status: this.isSessionComplete(this.runtimeByCardId, this.cards, this.template) ? 'completed' : 'in_progress',
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.localStorageKey, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save progress to localStorage:', err);
    }
  }

  /** Clear localStorage after successful server save */
  private clearLocalStorage(): void {
    try {
      localStorage.removeItem(this.localStorageKey);
    } catch {
      // Ignore localStorage errors
    }
  }

  /** Extract student ID from JWT token */
  private getStudentIdFromToken(): string {
    try {
      const token = localStorage.getItem('token');
      if (!token) return 'unknown';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload._id || payload.userId || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private setLoadError(message: string): void {
    this.isLoading = false;
    this.hasError = true;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }
}
