/**
 * WorksheetPdfTemplate
 *
 * Off-screen renderer used solely for client-side PDF export via
 * html2canvas + jsPDF. Mirrors the live worksheet UI 1:1 by reusing the same
 * `wv-*` CSS classes (imported from worksheet-viewer.css) so the PDF matches
 * the real on-screen layout, colors, and feedback states.
 *
 * Usage (call site):
 *   1. createOffscreenHost() → div
 *   2. ApplicationRef.bootstrap a WorksheetPdfTemplateComponent into the host
 *      OR Render it via createComponent() with environmentInjector.
 *   3. Pass inputs.
 *   4. await downloadPdfFromElement(host, { fileName }).
 *   5. destroyOffscreenHost(host).
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Worksheet } from '../../api/worksheet-api.service';

export interface WorksheetPdfInput {
  worksheet: Worksheet;
  studentName: string;
  date: string;
  /** Activity 1 — student-side only (live signals). null/undefined for teacher view. */
  a1Slots?: Array<any | null>;
  a1Checked?: boolean;
  /** Activity 2 — student-side only. */
  a2Answers?: Record<string, string>;
  a2Revealed?: Record<string, boolean>;
  /** Activity 3 — reconstructable from submission.answers (sectionId === 'activity3'). */
  a3Answers: Record<string, string>;
  /** Activity 4 — reconstructable from submission.answers (sectionId === 'activity4'). */
  a4Blanks: Record<string, string>;
  a4Checked?: boolean;
  /** Score summary. */
  totalPointsEarned: number;
  totalPointsPossible: number;
  percentage: number;
  timeTaken?: number;
  submittedAt?: string;
}

@Component({
  selector: 'app-worksheet-pdf-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './worksheet-pdf-template.html',
  styleUrls: [
    '../worksheet-viewer/worksheet-viewer.css',
    './worksheet-pdf-template.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetPdfTemplateComponent {
  @Input({ required: true }) data!: WorksheetPdfInput;

  readonly OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  /* ── Convenience getters ─────────────────────────── */
  get worksheet(): Worksheet { return this.data.worksheet; }
  get studentName(): string { return this.data.studentName || 'Student'; }

  get formattedTime(): string {
    const t = this.data.timeTaken ?? 0;
    if (t <= 0) return '—';
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  get formattedDate(): string {
    if (this.data.date) return this.data.date;
    if (this.data.submittedAt) {
      try { return new Date(this.data.submittedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }); } catch { /* ignore */ }
    }
    return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  /** Color tier for the score band. */
  get scoreTier(): 'high' | 'mid' | 'low' {
    const p = this.data.percentage ?? 0;
    if (p >= 70) return 'high';
    if (p >= 40) return 'mid';
    return 'low';
  }

  /* ── Activity 1 helpers ──────────────────────────── */
  get hasA1(): boolean {
    return !!(this.worksheet.activity1 && (this.worksheet.activity1.items?.length ?? 0) > 0);
  }

  /** Resolve slots: use student data if available, otherwise show correct order (answer key). */
  get a1ResolvedSlots(): Array<any | null> {
    if (this.data.a1Slots && this.data.a1Slots.length > 0) return this.data.a1Slots;
    const items = this.worksheet.activity1?.items ?? [];
    return [...items].sort((a: any, b: any) => (a.correctOrder ?? 0) - (b.correctOrder ?? 0));
  }

  get a1IsChecked(): boolean {
    return this.data.a1Checked ?? (this.a1ResolvedSlots.length > 0);
  }

  a1SlotClass(slot: any | null, i: number): string {
    if (!slot) return '';
    if (!this.a1IsChecked) return 'filled';
    return slot.correctOrder === i + 1 ? 'filled correct' : 'filled wrong';
  }

  get a1Score(): number {
    if (!this.a1IsChecked) return 0;
    return this.a1ResolvedSlots.filter((s, i) => s?.correctOrder === i + 1).length;
  }

  get a1Total(): number {
    return this.worksheet.activity1?.items?.length ?? 0;
  }

  /* ── Activity 2 helpers ──────────────────────────── */
  get hasA2(): boolean {
    return !!(this.worksheet.activity2 && (this.worksheet.activity2.items?.length ?? 0) > 0);
  }

  /** Resolve answers: use student data if available, otherwise show correct categories (answer key). */
  get a2ResolvedAnswers(): Record<string, string> {
    if (this.data.a2Answers && Object.keys(this.data.a2Answers).length > 0) return this.data.a2Answers;
    const answers: Record<string, string> = {};
    for (const item of (this.worksheet.activity2?.items ?? []) as any[]) {
      answers[item.id] = item.correctCategory ?? '';
    }
    return answers;
  }

  get a2ResolvedRevealed(): Record<string, boolean> {
    if (this.data.a2Revealed && Object.keys(this.data.a2Revealed).length > 0) return this.data.a2Revealed;
    const revealed: Record<string, boolean> = {};
    for (const item of (this.worksheet.activity2?.items ?? []) as any[]) {
      revealed[item.id] = true;
    }
    return revealed;
  }

  a2BtnClass(item: any, category: string): string {
    if (!this.a2ResolvedRevealed[item.id]) return '';
    if (category === item.correctCategory) return 'correct';
    if (this.a2ResolvedAnswers[item.id] === category) return 'wrong';
    return '';
  }

  get a2Score(): number {
    const items = this.worksheet.activity2?.items ?? [];
    return items.filter(
      (item: any) =>
        this.a2ResolvedRevealed[item.id] &&
        this.a2ResolvedAnswers[item.id] === item.correctCategory
    ).length;
  }

  get a2Total(): number { return this.worksheet.activity2?.items?.length ?? 0; }

  /* ── Activity 3 helpers ──────────────────────────── */
  get hasA3(): boolean {
    return !!(this.worksheet.activity3 && (this.worksheet.activity3.questions?.length ?? 0) > 0);
  }

  a3OptClass(question: any, option: string): string {
    const selected = this.data.a3Answers?.[question.id];
    if (!selected) return '';
    if (option === question.correctAnswer) return 'correct';
    if (selected === option) return 'wrong';
    return '';
  }

  get a3Score(): number {
    const qs = this.worksheet.activity3?.questions ?? [];
    return qs.filter((q: any) => this.data.a3Answers?.[q.id] === q.correctAnswer).length;
  }

  get a3Total(): number { return this.worksheet.activity3?.questions?.length ?? 0; }

  /* ── Activity 4 helpers ──────────────────────────── */
  get hasA4(): boolean {
    return !!(this.worksheet.activity4 && (this.worksheet.activity4.sentences?.length ?? 0) > 0);
  }

  a4BlankClass(part: any): string {
    const filled = !!this.data.a4Blanks?.[part.blankId];
    if (!filled) return '';
    if (!this.data.a4Checked) return 'filled';
    const ok =
      (this.data.a4Blanks?.[part.blankId] ?? '').toLowerCase() ===
      (part.correctAnswer ?? '').toLowerCase();
    return ok ? 'filled correct' : 'filled wrong';
  }

  a4BlankDisplay(part: any): string {
    return this.data.a4Blanks?.[part.blankId] || '_____';
  }

  /** Returns true if the word is placed in any blank (for greying it out in the PDF word bank). */
  isWordUsedInPdf(word: string): boolean {
    return Object.values(this.data.a4Blanks ?? {}).includes(word);
  }

  get a4Score(): number {
    if (!this.data.a4Checked) return 0;
    const sentences = this.worksheet.activity4?.sentences ?? [];
    return sentences.filter((s: any) =>
      s.parts
        .filter((p: any) => p.type === 'blank')
        .every(
          (p: any) =>
            (this.data.a4Blanks?.[p.blankId] ?? '').toLowerCase() ===
            (p.correctAnswer ?? '').toLowerCase()
        )
    ).length;
  }

  get a4Total(): number { return this.worksheet.activity4?.sentences?.length ?? 0; }

  trackByIndex(i: number): number { return i; }
}
