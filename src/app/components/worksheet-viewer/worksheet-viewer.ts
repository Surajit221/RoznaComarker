import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  WorksheetApiService,
  type Worksheet,
} from '../../api/worksheet-api.service';
import { AlertService } from '../../services/alert.service';
import { WorksheetPdfRenderService } from '../worksheet-pdf-template/worksheet-pdf-render.service';

@Component({
  selector: 'app-worksheet-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './worksheet-viewer.html',
  styleUrl: './worksheet-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetViewerComponent implements OnInit {
  @Input({ required: true }) worksheetId!: string;
  @Input() assignmentId: string | null = null;
  @Input() mode: 'preview' | 'student' = 'student';
  @Input() classId: string | null = null;
  /** Read-only review mode: render full worksheet UI with submitted answers highlighted, no interactivity. */
  @Input() reviewMode = false;
  /** Flat AnswerResult[] from a WorksheetSubmission — only used when reviewMode is true. */
  @Input() submittedAnswers: Array<{ questionId: string; sectionId: string; studentAnswer: string; isCorrect?: boolean }> | null = null;
  /** Optional metadata used in review mode header + score banner. */
  @Input() reviewMeta: {
    studentName?: string;
    date?: string;
    totalPointsEarned?: number;
    totalPointsPossible?: number;
    percentage?: number;
    timeTaken?: number;
  } | null = null;
  @Output() closed = new EventEmitter<void>();

  private readonly api          = inject(WorksheetApiService);
  private readonly alert        = inject(AlertService);
  private readonly pdfRenderer  = inject(WorksheetPdfRenderService);

  readonly OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  worksheet    = signal<Worksheet | null>(null);
  isLoading    = signal(true);
  loadError    = signal<string | null>(null);
  isSubmitting = signal(false);
  isSubmitted  = signal(false);
  submittedSubmissionId = signal<string | null>(null);
  isPdfDownloading = signal(false);

  get scoreTier(): 'high' | 'mid' | 'low' {
    const p = this.reviewMeta?.percentage ?? 0;
    if (p >= 70) return 'high';
    if (p >= 40) return 'mid';
    return 'low';
  }

  get reviewFormattedTime(): string {
    const t = this.reviewMeta?.timeTaken ?? 0;
    if (t <= 0) return '';
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  }

  studentNameValue = '';
  worksheetDate = new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
  });

  private startTime = Date.now();

  /* ── Activity 1 ─────────────────────────── */
  a1Slots     = signal<(any | null)[]>([]);
  a1Available = signal<any[]>([]);
  a1ActiveSlot = signal<number | null>(null);
  a1Checked   = signal(false);

  /* ── Activity 2 ─────────────────────────── */
  a2Answers  = signal<Record<string, string>>({});
  a2Revealed = signal<Record<string, boolean>>({});

  /* ── Activity 3 ─────────────────────────── */
  a3Answers = signal<Record<string, string>>({});

  /* ── Activity 4 ─────────────────────────── */
  a4Blanks        = signal<Record<string, string>>({});
  a4SelectedBlank = signal<string | null>(null);
  a4Checked       = signal(false);

  /* ── Computed scores ─────────────────────── */
  a1Total = computed(() => this.worksheet()?.activity1?.items?.length ?? 0);
  a1Score = computed(() => {
    if (!this.a1Checked()) return 0;
    return this.a1Slots().filter((s, i) => s?.correctOrder === i + 1).length;
  });

  a2Total = computed(() => this.worksheet()?.activity2?.items?.length ?? 0);
  a2Score = computed(() => {
    const items = this.worksheet()?.activity2?.items ?? [];
    return items.filter(
      (item: any) => this.a2Revealed()[item.id] && this.a2Answers()[item.id] === item.correctCategory
    ).length;
  });

  a3Total = computed(() => this.worksheet()?.activity3?.questions?.length ?? 0);
  a3Score = computed(() => {
    const qs = this.worksheet()?.activity3?.questions ?? [];
    return qs.filter((q: any) => this.a3Answers()[q.id] === q.correctAnswer).length;
  });

  a4Total = computed(() => this.worksheet()?.activity4?.sentences?.length ?? 0);
  a4Score = computed(() => {
    if (!this.a4Checked()) return 0;
    const sentences = this.worksheet()?.activity4?.sentences ?? [];
    return sentences.filter((s: any) =>
      s.parts
        .filter((p: any) => p.type === 'blank')
        .every(
          (p: any) =>
            (this.a4Blanks()[p.blankId] ?? '').toLowerCase() ===
            (p.correctAnswer ?? '').toLowerCase()
        )
    ).length;
  });

  totalScore    = computed(() => this.a1Score() + this.a2Score() + this.a3Score() + this.a4Score());
  totalPossible = computed(() => this.a1Total() + this.a2Total() + this.a3Total() + this.a4Total());

  completedActivities = computed(() => {
    let n = 0;
    if (this.a1Checked()) n++;
    if (Object.keys(this.a2Revealed()).length > 0 && Object.keys(this.a2Revealed()).length >= this.a2Total()) n++;
    if (Object.keys(this.a3Answers()).length >= this.a3Total() && this.a3Total() > 0) n++;
    if (this.a4Checked()) n++;
    return n;
  });

  progressPercent = computed(() =>
    this.totalPossible() > 0
      ? Math.round((this.totalScore() / this.totalPossible()) * 100)
      : 0
  );

  /* ── Lifecycle ───────────────────────────── */
  ngOnInit(): void {
    this.api.getById(this.worksheetId).subscribe({
      next: (res: any) => {
        const ws: Worksheet = res?.data ?? res;
        this.worksheet.set(ws);
        const items = [...(ws.activity1?.items ?? [])];
        this.a1Available.set(this.shuffle(items));
        this.a1Slots.set(new Array(items.length).fill(null));
        if (this.reviewMode) this.hydrateFromSubmission(ws);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load worksheet. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  /** Populate signals from a graded submission so review mode renders highlights. */
  private hydrateFromSubmission(ws: Worksheet): void {
    const a3: Record<string, string> = {};
    const a4: Record<string, string> = {};
    for (const a of this.submittedAnswers ?? []) {
      if (!a) continue;
      if (a.sectionId === 'activity3') a3[a.questionId] = a.studentAnswer ?? '';
      else if (a.sectionId === 'activity4') a4[a.questionId] = a.studentAnswer ?? '';
    }
    this.a3Answers.set(a3);
    this.a4Blanks.set(a4);
    this.a4Checked.set(true);

    // Activity 1: show items in their correct order (answer key) since
    // student drag-and-drop state isn't stored in the submission.
    const a1Items = ws.activity1?.items ?? [];
    if (a1Items.length > 0) {
      const sorted = [...a1Items].sort((a: any, b: any) => (a.correctOrder ?? 0) - (b.correctOrder ?? 0));
      this.a1Slots.set(sorted);
      this.a1Available.set([]);
      this.a1Checked.set(true);
    }

    // Activity 2: show correct classifications (answer key) since
    // student classification state isn't stored in the submission.
    const a2Items = ws.activity2?.items ?? [];
    if (a2Items.length > 0) {
      const answers: Record<string, string> = {};
      const revealed: Record<string, boolean> = {};
      for (const item of a2Items) {
        answers[(item as any).id] = (item as any).correctCategory ?? '';
        revealed[(item as any).id] = true;
      }
      this.a2Answers.set(answers);
      this.a2Revealed.set(revealed);
    }

    if (this.reviewMeta?.studentName) this.studentNameValue = this.reviewMeta.studentName;
    if (this.reviewMeta?.date) this.worksheetDate = this.reviewMeta.date;
  }

  /* ── Activity 1 methods ──────────────────── */
  selectSlot(i: number): void {
    if (this.reviewMode) return;
    this.a1ActiveSlot.set(i);
  }

  placeItemInSlot(item: any): void {
    if (this.reviewMode) return;
    const idx = this.a1ActiveSlot();
    if (idx === null) return;
    const current = this.a1Slots()[idx];
    if (current) this.a1Available.update(av => [...av, current]);
    this.a1Slots.update(s => { const n = [...s]; n[idx] = item; return n; });
    this.a1Available.update(av => av.filter((a: any) => a.id !== item.id));
    this.a1ActiveSlot.set(null);
  }

  removeFromSlot(i: number): void {
    if (this.reviewMode) return;
    const item = this.a1Slots()[i];
    if (!item) return;
    this.a1Slots.update(s => { const n = [...s]; n[i] = null; return n; });
    this.a1Available.update(av => [...av, item]);
  }

  checkActivity1(): void {
    if (this.reviewMode) return;
    this.a1Checked.set(true);
  }

  /* ── Activity 2 methods ──────────────────── */
  classifyItem(itemId: string, category: string): void {
    if (this.reviewMode) return;
    if (this.a2Revealed()[itemId]) return;
    this.a2Answers.update(a => ({ ...a, [itemId]: category }));
    this.a2Revealed.update(r => ({ ...r, [itemId]: true }));
  }

  getA2ButtonClass(item: any, category: string): string {
    if (!this.a2Revealed()[item.id]) return '';
    if (category === item.correctCategory) return 'correct';
    if (this.a2Answers()[item.id] === category) return 'wrong';
    return '';
  }

  /* ── Activity 3 methods ──────────────────── */
  selectMCQ(questionId: string, answer: string): void {
    if (this.reviewMode) return;
    if (this.a3Answers()[questionId]) return;
    this.a3Answers.update(a => ({ ...a, [questionId]: answer }));
  }

  getA3OptionClass(question: any, option: string): string {
    const selected = this.a3Answers()[question.id];
    if (!selected) return '';
    if (option === question.correctAnswer) return 'correct';
    if (selected === option) return 'wrong';
    return '';
  }

  /* ── Activity 4 methods ──────────────────── */
  selectBlank(blankId: string): void {
    if (this.reviewMode) return;
    this.a4SelectedBlank.set(this.a4SelectedBlank() === blankId ? null : blankId);
  }

  placeWord(word: string): void {
    if (this.reviewMode) return;
    const blankId = this.a4SelectedBlank();
    if (!blankId) return;
    this.a4Blanks.update(b => ({ ...b, [blankId]: word }));
    this.a4SelectedBlank.set(null);
  }

  isWordUsed(word: string): boolean {
    return Object.values(this.a4Blanks()).includes(word);
  }

  getBlankDisplay(blankId: string): string {
    return this.a4Blanks()[blankId] || 'choose a word';
  }

  checkActivity4(): void {
    if (this.reviewMode) return;
    this.a4Checked.set(true);
  }

  resetActivity4(): void {
    if (this.reviewMode) return;
    this.a4Blanks.set({});
    this.a4Checked.set(false);
    this.a4SelectedBlank.set(null);
  }

  /** Helper for review mode: returns the correct fill-in-blank answer for a given part. */
  a4PartCorrect(part: any): string {
    return part?.correctAnswer ?? '';
  }

  /** Returns true when the student's blank answer is wrong (review mode display). */
  a4PartWrong(part: any): boolean {
    if (!part?.blankId || !part?.correctAnswer) return false;
    const given = (this.a4Blanks()[part.blankId] ?? '').toLowerCase();
    return given !== '' && given !== (part.correctAnswer ?? '').toLowerCase();
  }

  /* ── Submit / Done ───────────────────────── */
  async onDone(): Promise<void> {
    if (this.reviewMode) { this.closed.emit(); return; }
    if (this.mode === 'preview') { this.closed.emit(); return; }
    if (!this.assignmentId) { this.closed.emit(); return; }

    this.isSubmitting.set(true);
    const ws = this.worksheet();
    const answers: any[] = [];

    (ws?.activity3?.questions ?? []).forEach((q: any) => {
      answers.push({
        questionId: q.id, sectionId: 'activity3',
        studentAnswer: this.a3Answers()[q.id] || '',
        isCorrect: this.a3Answers()[q.id] === q.correctAnswer,
      });
    });

    (ws?.activity4?.sentences ?? []).forEach((s: any) => {
      s.parts.filter((p: any) => p.type === 'blank').forEach((p: any) => {
        answers.push({
          questionId: p.blankId, sectionId: 'activity4',
          studentAnswer: this.a4Blanks()[p.blankId] || '',
          isCorrect: (this.a4Blanks()[p.blankId] ?? '').toLowerCase() === (p.correctAnswer ?? '').toLowerCase(),
        });
      });
    });

    try {
      const result = await firstValueFrom(
        this.api.submit(this.worksheetId, {
          assignmentId: this.assignmentId,
          answers,
          totalPointsEarned: this.totalScore(),
          totalPointsPossible: this.totalPossible(),
          percentage: this.progressPercent(),
          timeTaken: Math.floor((Date.now() - this.startTime) / 1000),
        })
      );
      const submissionId: string | null = (result as any)?.submission?._id ?? null;
      this.submittedSubmissionId.set(submissionId);
      this.isSubmitted.set(true);
    } catch {
      this.closed.emit();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void { this.closed.emit(); }

  async downloadMyPdf(): Promise<void> {
    const ws = this.worksheet();
    if (!ws || this.isPdfDownloading()) return;
    this.isPdfDownloading.set(true);
    try {
      const title = (ws.title ?? 'worksheet').toLowerCase().replace(/\s+/g, '-');
      const safeName = (this.studentNameValue || 'student').toLowerCase().replace(/\s+/g, '-');
      await this.pdfRenderer.render(
        {
          worksheet: ws,
          studentName: this.studentNameValue || 'Student',
          date: this.worksheetDate,
          a1Slots: this.a1Slots(),
          a1Checked: this.a1Checked(),
          a2Answers: this.a2Answers(),
          a2Revealed: this.a2Revealed(),
          a3Answers: this.a3Answers(),
          a4Blanks: this.a4Blanks(),
          a4Checked: this.a4Checked(),
          totalPointsEarned: this.totalScore(),
          totalPointsPossible: this.totalPossible(),
          percentage: this.progressPercent(),
          timeTaken: undefined,
        },
        `MyWorksheet_${title}_${safeName}.pdf`,
      );
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message ?? err?.message ?? 'Please try again');
    } finally {
      this.isPdfDownloading.set(false);
    }
  }

  onRetry(): void {
    const items = this.worksheet()?.activity1?.items ?? [];
    this.a1Slots.set(new Array(items.length).fill(null));
    this.a1Available.set(this.shuffle(items));
    this.a1Checked.set(false);
    this.a2Answers.set({});
    this.a2Revealed.set({});
    this.a3Answers.set({});
    this.a4Blanks.set({});
    this.a4Checked.set(false);
    this.a4SelectedBlank.set(null);
  }

  trackByIndex(i: number): number { return i; }
  trackById(_: number, item: any): string { return item?.id ?? item; }
}
