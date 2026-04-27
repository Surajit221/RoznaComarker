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
  selector: 'app-study-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './study-results.html',
  styleUrl: './study-results.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyResults implements OnInit, OnDestroy {
  private readonly router       = inject(Router);
  private readonly route        = inject(ActivatedRoute);
  private readonly flashcardApi = inject(FlashcardApiService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly destroy$     = new Subject<void>();

  set: FlashcardSet | null = null;
  knownCards: FlashCard[]    = [];
  learningCards: FlashCard[] = [];
  timeTaken                  = 0;
  correctOpen                = true;
  learningOpen               = false;

  private get setId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  /** First letter of owner's first + last name */
  get ownerInitials(): string {
    const name = this.set?.ownerName ?? '';
    if (!name.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  ngOnInit(): void {
    const nav   = this.router.getCurrentNavigation();
    const state = (nav?.extras?.state ?? (typeof history !== 'undefined' ? history.state : {})) as {
      known?: FlashCard[];
      learning?: FlashCard[];
      timeTaken?: number;
    };
    this.knownCards    = state?.known    ?? [];
    this.learningCards = state?.learning ?? [];
    this.timeTaken     = state?.timeTaken ?? 0;

    this.loadSet();
    this.submitSession();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSet(): void {
    this.flashcardApi.getSetById(this.setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.set = data;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  /** Submit results to the backend silently (first-submission-only enforced server-side) */
  private submitSession(): void {
    const total = this.knownCards.length + this.learningCards.length;
    if (total === 0) return;

    const results = [
      ...this.knownCards.map((c) => ({ cardId: c._id ?? '', status: 'know' as const })),
      ...this.learningCards.map((c) => ({ cardId: c._id ?? '', status: 'learning' as const })),
    ];
    const score = Math.round((this.knownCards.length / total) * 100);

    this.flashcardApi
      .submitStudySession(this.setId, {
        flashcardSetId: this.setId,
        results,
        score,
        timeTaken: this.timeTaken,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {},
        error: (err) => console.error('Submission error (silent):', err),
      });
  }

  toggleCorrect():  void { this.correctOpen  = !this.correctOpen;  this.cdr.markForCheck(); }
  toggleLearning(): void { this.learningOpen = !this.learningOpen; this.cdr.markForCheck(); }

  /** Navigate back to the flashcard detail page. Falls back to library if setId is absent. */
  goBackToDeck(): void {
    if (this.setId) {
      this.router.navigate(['/flashcards', this.setId]);
    } else {
      this.router.navigate(['/flashcards']);
    }
  }

  restart(): void {
    this.router.navigate(['/flashcards', this.setId, 'study']);
  }

  trackById(_: number, card: FlashCard): string {
    return card._id ?? String(_);
  }
}
