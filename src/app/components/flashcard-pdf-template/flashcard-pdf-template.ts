/**
 * FlashcardPdfTemplate
 *
 * Off-screen renderer for client-side flashcard PDF export. Mirrors the
 * student-results-page (srp-* classes) so the PDF matches the live UI.
 *
 * Used by:
 *   - student-results-page.ts ("Download My Results" after a session)
 *   - flashcard-report.ts (teacher per-student PDF on participant row click)
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { CardResult, FlashCard } from '../../models/flashcard-set.model';

export interface FlashcardPdfInput {
  setTitle: string;
  studentName: string;
  /** Date string (e.g. "12 Apr 2026"). */
  date: string;
  score: number;
  total: number;
  timeTaken: number;
  template: 'term-def' | 'qa' | 'concept' | string;
  correctCount: number;
  needsReviewCount: number;
  /** Full card list — needed to resolve cardResult.cardId → front/back. */
  cards: FlashCard[];
  /** Per-card outcome from the session. */
  cardResults: CardResult[];
}

@Component({
  selector: 'app-flashcard-pdf-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './flashcard-pdf-template.html',
  styleUrls: [
    '../../pages/students/student-results-page/student-results-page.css',
    './flashcard-pdf-template.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardPdfTemplateComponent {
  @Input({ required: true }) data!: FlashcardPdfInput;

  get formattedTime(): string {
    const t = this.data.timeTaken ?? 0;
    if (t <= 0) return '—';
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  get scoreTier(): 'high' | 'mid' | 'low' {
    const p = this.data.score ?? 0;
    if (p >= 70) return 'high';
    if (p >= 40) return 'mid';
    return 'low';
  }

  get scoreLabel(): string {
    const p = this.data.score ?? 0;
    if (p >= 90) return 'Excellent!';
    if (p >= 70) return 'Good job!';
    if (p >= 50) return 'Keep practising';
    return 'You can do it!';
  }

  /** Pair every CardResult with its source FlashCard for rendering. */
  get cardResultsWithContent(): Array<CardResult & { card?: FlashCard }> {
    return (this.data.cardResults ?? []).map((r) => ({
      ...r,
      card: (this.data.cards ?? []).find(
        (c) => String((c as any)._id ?? '') === r.cardId,
      ),
    }));
  }

  get cardsNeedingReview(): Array<CardResult & { card?: FlashCard }> {
    return this.cardResultsWithContent.filter((r) => !r.known);
  }

  get correctCards(): Array<CardResult & { card?: FlashCard }> {
    return this.cardResultsWithContent.filter((r) => r.known);
  }

  get hasPerCardBreakdown(): boolean {
    return (
      (this.data.cardResults?.length ?? 0) > 0 &&
      (this.data.cards?.length ?? 0) > 0
    );
  }

  get isQa(): boolean {
    return this.data.template === 'qa';
  }
}
