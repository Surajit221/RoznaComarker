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
import { Subject, takeUntil, retry, catchError, of } from 'rxjs';
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

  /** Progress tracking */
  cardsViewed: number[]    = [];
  cardResultsMap: Map<number, 'knew' | 'didnt_know'> = new Map();
  saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  private readonly SAVE_RETRY_ATTEMPTS = 3;

  /** Resume modal */
  showResumeModal          = false;
  savedProgress: any         = null;
  isResuming               = false;
  localStorageKey          = '';

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
  get incompleteCount(): number { return Math.max(0, this.cards.length - this.answeredCount); }
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
    const cardId = String((this.currentCard as any)._id ?? '');
    const existingIndex = this.cardResults.findIndex(r => r.cardId === cardId);
    if (existingIndex >= 0) {
      this.cardResults[existingIndex] = {
        cardId,
        known,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: known,
      };
    } else {
      this.cardResults.push({
        cardId,
        known,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: known,
      });
    }
    this.gradeResult = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markCorrect(): void {
    if (!this.currentCard) return;
    const cardId = String((this.currentCard as any)._id ?? '');
    const existingIndex = this.cardResults.findIndex(r => r.cardId === cardId);
    if (existingIndex >= 0) {
      this.cardResults[existingIndex] = {
        cardId,
        known: true,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: true,
      };
    } else {
      this.cardResults.push({
        cardId,
        known: true,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: true,
      });
    }
    this.gradeResult = null;
    this.advance();
  }

  /** Fallback manual grade used when AI call fails */
  markWrong(): void {
    if (!this.currentCard) return;
    const cardId = String((this.currentCard as any)._id ?? '');
    const existingIndex = this.cardResults.findIndex(r => r.cardId === cardId);
    if (existingIndex >= 0) {
      this.cardResults[existingIndex] = {
        cardId,
        known: false,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: false,
      };
    } else {
      this.cardResults.push({
        cardId,
        known: false,
        studentAnswer: this.studentAnswer || undefined,
        isCorrect: false,
      });
    }
    this.gradeResult = null;
    this.advance();
  }

  markKnown(): void {
    if (this.isSliding || !this.currentCard || !this.isFlipped) return;
    const cardId = String((this.currentCard as any)._id ?? '');
    const existingIndex = this.cardResults.findIndex(r => r.cardId === cardId);
    if (existingIndex >= 0) {
      this.cardResults[existingIndex].known = true;
    } else {
      this.cardResults.push({
        cardId,
        known: true,
      });
    }
    // Track by index for progress
    this.cardResultsMap.set(this.currentIndex, 'knew');
    this.advance();
  }

  markLearning(): void {
    if (this.isSliding || !this.currentCard || !this.isFlipped) return;
    const cardId = String((this.currentCard as any)._id ?? '');
    const existingIndex = this.cardResults.findIndex(r => r.cardId === cardId);
    if (existingIndex >= 0) {
      this.cardResults[existingIndex].known = false;
    } else {
      this.cardResults.push({
        cardId,
        known: false,
      });
    }
    // Track by index for progress
    this.cardResultsMap.set(this.currentIndex, 'didnt_know');
    this.advance();
  }

  private advance(): void {
    // Record current card as viewed before advancing
    if (!this.cardsViewed.includes(this.currentIndex)) {
      this.cardsViewed.push(this.currentIndex);
    }

    // Determine the next card index before animation
    const nextIndex = this.currentIndex + 1;

    // Check if this advance will complete the set
    const willComplete = nextIndex >= this.cards.length;

    if (willComplete) {
      // Save final progress (current index is the last card)
      this.saveProgress();
      this.onComplete();
      return;
    }

    // Save progress with the NEXT index (where student will be after animation)
    // This ensures resume puts them on the correct card
    this.saveProgressWithNextIndex(nextIndex);

    this.isFlipped     = false;
    this.studentAnswer = '';
    this.gradeResult   = null;
    this.isSliding     = true;
    this.slideOutClass = 'slide-out-left';
    this.cdr.markForCheck();

    setTimeout(() => {
      this.currentIndex = nextIndex;
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

  /**
   * Save initial progress when starting a fresh study session
   * This marks the assignment as "in_progress" for the teacher report
   */
  private saveInitialProgress(): void {
    if (!this.cards.length) return;

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    const progressPayload = {
      lastCardIndex: 0,  // Starting at card 0
      cardsViewed: [],   // No cards completed yet
      cardResults: {},
      assignmentId: this.assignmentId || undefined,
      template: this.template,
      totalCards: this.cards.length
    };

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);

    // Save to server (silent - don't show loading indicator for initial save)
    this.flashcardApi.saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: 1000 }),
        catchError(() => of(null))
      )
      .subscribe(() => {
        // Silent success - clear localStorage after successful save
        this.clearLocalStorage();
      });
  }

  /**
   * Save progress with a specific next index (for use during navigation)
   * This ensures resume puts the student on the correct card
   */
  private saveProgressWithNextIndex(nextIndex: number): void {
    if (!this.cards.length) return;

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    this.saveState = 'saving';
    this.cdr.markForCheck();

    const cardResultsObj: Record<string, 'knew' | 'didnt_know'> = {};
    this.cardResultsMap.forEach((value, key) => {
      cardResultsObj[key] = value;
    });

    const progressPayload = {
      lastCardIndex: nextIndex,  // ← Save NEXT index (where student will be)
      cardsViewed: [...this.cardsViewed],
      cardResults: cardResultsObj,
      assignmentId: this.assignmentId || undefined,
      template: this.template,
      totalCards: this.cards.length
    };

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);

    // Save to server
    this.flashcardApi.saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: 1000 }),
        catchError((err) => {
          console.error('Failed to save progress:', err);
          this.saveState = 'error';
          this.cdr.markForCheck();
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.saveState = 'saved';
          // Clear localStorage after successful save
          this.clearLocalStorage();
        } else {
          this.saveState = 'error';
        }
        this.cdr.markForCheck();

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
        incompleteCount:  this.incompleteCount,
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

    // Generate localStorage key for progress backup
    const studentId = this.getStudentIdFromToken();
    this.localStorageKey = `flashcard_progress_${studentId}_${setId}_${this.assignmentId || 'no-assign'}`;

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

          // After loading cards, check for existing progress
          this.checkForExistingProgress(setId);

          // Also save initial progress for new sessions (so teacher sees "in_progress")
          // This runs after checkForExistingProgress completes (which sets isLoading = false)
          // We do this in a setTimeout to ensure it runs after the modal check
          setTimeout(() => {
            if (!this.showResumeModal && this.cards.length > 0) {
              // No existing progress - this is a fresh start
              // Save initial progress at card 0
              this.saveInitialProgress();
            }
          }, 0);
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

  /** Check for saved progress and show resume modal if needed */
  private checkForExistingProgress(setId: string): void {
    // First, try to get progress from API
    this.flashcardApi.getProgress(setId, this.assignmentId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          // Show resume modal if in_progress AND lastCardIndex > 0 (not at start)
          // lastCardIndex represents the card the student is CURRENTLY viewing
          if (progress.status === 'in_progress' && progress.lastCardIndex > 0) {
            // Show resume modal
            this.savedProgress = progress;
            this.showResumeModal = true;
            this.isLoading = false;
            this.cdr.markForCheck();
          } else if (progress.status === 'completed') {
            // If completed, redirect to results or allow re-study
            this.isLoading = false;
            this.cdr.markForCheck();
          } else {
            // Check localStorage as fallback
            this.checkLocalStorageProgress(setId);
          }
        },
        error: () => {
          // If API fails, check localStorage
          this.checkLocalStorageProgress(setId);
        }
      });
  }

  /** Check localStorage for backup progress */
  private checkLocalStorageProgress(setId: string): void {
    try {
      const saved = localStorage.getItem(this.localStorageKey);
      if (saved) {
        const localProgress = JSON.parse(saved);
        // Show resume modal if in_progress AND lastCardIndex > 0 (not at start)
        if (localProgress.status === 'in_progress' && localProgress.lastCardIndex > 0) {
          this.savedProgress = localProgress;
          this.showResumeModal = true;
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

    // Restore progress state
    this.currentIndex = this.savedProgress.lastCardIndex || 0;
    this.cardsViewed = [...(this.savedProgress.cardsViewed || [])];

    // Restore card results if available
    if (this.savedProgress.cardResults) {
      Object.entries(this.savedProgress.cardResults).forEach(([index, result]) => {
        this.cardResultsMap.set(parseInt(index, 10), result as 'knew' | 'didnt_know');
      });
    }

    // Restore cardResults array for completed cards
    this.cardsViewed.forEach((cardIdx) => {
      const card = this.cards[cardIdx];
      if (card) {
        const cardId = String((card as any)._id ?? '');
        const result = this.cardResultsMap.get(cardIdx);
        if (result) {
          this.cardResults.push({
            cardId,
            known: result === 'knew',
          });
        }
      }
    });

    this.isResuming = false;
    this.cdr.markForCheck();
  }

  /** Start over - reset progress */
  startOver(): void {
    this.showResumeModal = false;

    // Reset local state
    this.currentIndex = 0;
    this.cardsViewed = [];
    this.cardResultsMap.clear();
    this.cardResults = [];

    // Clear server progress
    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    this.flashcardApi.resetProgress(setId, this.assignmentId || undefined)
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

    const setId = this.resolvedFlashcardSetId || this.flashcardSetId;
    if (!setId) return;

    this.saveState = 'saving';
    this.cdr.markForCheck();

    const cardResultsObj: Record<string, 'knew' | 'didnt_know'> = {};
    this.cardResultsMap.forEach((value, key) => {
      cardResultsObj[key] = value;
    });

    const progressPayload = {
      lastCardIndex: this.currentIndex,
      cardsViewed: [...this.cardsViewed],
      cardResults: cardResultsObj,
      assignmentId: this.assignmentId || undefined,
      template: this.template,
      totalCards: this.cards.length
    };

    // Save to localStorage as backup
    this.saveToLocalStorage(progressPayload);

    // Save to server
    this.flashcardApi.saveProgress(setId, progressPayload)
      .pipe(
        takeUntil(this.destroy$),
        retry({ count: this.SAVE_RETRY_ATTEMPTS, delay: 1000 }),
        catchError((err) => {
          console.error('Failed to save progress:', err);
          this.saveState = 'error';
          this.cdr.markForCheck();
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.saveState = 'saved';
          // Clear localStorage after successful save
          this.clearLocalStorage();
        } else {
          this.saveState = 'error';
        }
        this.cdr.markForCheck();

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
        status: this.cardsViewed.length >= this.cards.length ? 'completed' : 'in_progress',
        savedAt: new Date().toISOString()
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
    this.hasError  = true;
    this.errorMessage = message;
    this.cdr.markForCheck();
  }
}
