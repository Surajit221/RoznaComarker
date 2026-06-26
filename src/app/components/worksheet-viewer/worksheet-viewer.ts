import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, debounceTime, Subject, takeUntil } from 'rxjs';
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetTheme,
} from '../../api/worksheet-api.service';
import { getPatternBackground } from '../../utils/worksheet-patterns.util';
import { AlertService } from '../../services/alert.service';
import { WorksheetPdfRenderService } from '../worksheet-pdf-template/worksheet-pdf-render.service';
import { AssignmentStateService } from '../../services/assignment-state.service';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';
import { OverlayPdfService } from '../../services/overlay-pdf.service';

@Component({
  selector: 'app-worksheet-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './worksheet-viewer.html',
  styleUrl: './worksheet-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetViewerComponent implements OnInit, OnDestroy {
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
    deadline?: string | Date; // Assignment deadline
  } | null = null;
  /** Preloaded activity9 data for review mode (from submission) */
  @Input() preloadedA9Answers?: Record<string, string>;
  @Input() preloadedA9Results?: Record<string, boolean | null>;
  @Input() preloadedA9Feedbacks?: Record<string, string>;
  @Output() closed = new EventEmitter<void>();

  private readonly api          = inject(WorksheetApiService);
  private readonly alert        = inject(AlertService);
  private readonly pdfRenderer  = inject(WorksheetPdfRenderService);
  private readonly cdr          = inject(ChangeDetectorRef);
  private readonly el           = inject(ElementRef<HTMLElement>);
  private readonly assignmentState = inject(AssignmentStateService);
  private readonly authService  = inject(AuthService);
  private readonly http         = inject(HttpClient);
  private readonly route        = inject(ActivatedRoute);
  private readonly overlayPdfService = inject(OverlayPdfService);

  readonly OPTION_LETTERS = ['A', 'B', 'C', 'D'];
  readonly Object = Object;

  worksheet    = signal<Worksheet | null>(null);
  isLoading    = signal(true);
  loadError    = signal<string | null>(null);
  isSubmitting = signal(false);
  isSubmitted  = signal(false);
  submittedSubmissionId = signal<string | null>(null);
  isPdfDownloading = signal(false);

  // Draft autosave
  isSavingDraft = signal(false);
  lastSavedAt = signal<Date | null>(null);
  private autosaveTrigger = new Subject<void>();
  private destroy$ = new Subject<void>();
  private autosaveInterval: any = null;
  protected readonly Math = Math;

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
  /** Plain arrays that CDK DragDrop mutates directly. Kept in sync with signals via syncA1SignalsFromArrays(). */
  a1Pool: any[] = [];
  a1SlotArrays: any[][] = [];

  /* ── Activity 2 ─────────────────────────── */
  a2Answers  = signal<Record<string, string>>({});
  a2Revealed = signal<Record<string, boolean>>({});

  /* ── Activity 3 ─────────────────────────── */
  a3Answers = signal<Record<string, string>>({});

  /* ── Activity 4 ─────────────────────────── */
  a4Blanks  = signal<Record<string, string>>({});
  a4Checked = signal(false);

  /* ── Activity 5: Match Pairs ─────────────────── */
  a5Matches = signal<Record<string, string>>({});
  a5Checked = signal(false);
  a5Bank: { id: string; text: string }[] = [];

  /* ── Activity 6: True/False ─────────────────── */
  a6Answers = signal<Record<string, boolean>>({});
  a6Checked = signal(false);

  /* ── Activity 7: Image Label ─────────────────── */
  a7Labels = signal<Record<string, string>>({});
  a7Checked = signal(false);

  /* ── Activity 8: Enhanced Sequencing ─────────── */
  a8Sequences = signal<Record<string, string[]>>({});
  a8Checked = signal(false);

  /* ── Activity 9: Overlay Worksheet ───────────── */
  a9Answers = signal<Record<string, string>>({});
  a9Results = signal<Record<string, boolean | null>>({});
  a9Feedbacks = signal<Record<string, string>>({});
  a9Checked = signal(false);
  isEvaluating = signal<boolean>(false);

  /* ── Computed scores ─────────────────────── */
  a1Total = computed(() => this.worksheet()?.activity1?.items?.length ?? 0);
  a1Score = computed(() => {
    return this.a1Slots().filter((s, i) => s?.correctOrder === i + 1).length;
  });

  a2Total = computed(() => this.worksheet()?.activity2?.items?.length ?? 0);
  a2Score = computed(() => {
    const items = this.worksheet()?.activity2?.items ?? [];
    return items.filter(
      (item: any) => this.a2Revealed()[item.id]
        && (this.a2Answers()[item.id] ?? '').trim().toLowerCase() === (item.correctCategory ?? '').trim().toLowerCase()
    ).length;
  });

  a3Total = computed(() => this.worksheet()?.activity3?.questions?.length ?? 0);
  a3Score = computed(() => {
    const qs = this.worksheet()?.activity3?.questions ?? [];
    return qs.filter((q: any) => this.a3Answers()[q.id] === q.correctAnswer).length;
  });

  a4Total = computed(() => {
    const sentences = this.worksheet()?.activity4?.sentences ?? [];
    return sentences.reduce(
      (sum: number, s: any) => sum + (s?.parts ?? []).filter((p: any) => p?.type === 'blank').length,
      0,
    );
  });
  a4Score = computed(() => {
    const sentences = this.worksheet()?.activity4?.sentences ?? [];
    let earned = 0;
    for (const s of sentences) {
      for (const p of s?.parts ?? []) {
        if (!p || p.type !== 'blank') continue;
        const blankId = p.blankId;
        if (!blankId) continue;
        const given = (this.a4Blanks()[blankId] ?? '').toLowerCase();
        const correct = (p.correctAnswer ?? '').toLowerCase();
        if (given && correct && given === correct) earned += 1;
      }
    }
    return earned;
  });

  a5Total = computed(() => this.worksheet()?.activity5?.pairs?.length ?? 0);
  a5Score = computed(() => {
    const pairs = this.worksheet()?.activity5?.pairs ?? [];
    return pairs.filter(pair => {
      const match = this.a5Matches()[pair.id];
      return match && match === pair.rightItem.text;
    }).length;
  });

  a6Total = computed(() => this.worksheet()?.activity6?.questions?.length ?? 0);
  a6Score = computed(() => {
    const questions = this.worksheet()?.activity6?.questions ?? [];
    return questions.filter(q => this.a6Answers()[q.id] === q.correctAnswer).length;
  });

  a7Total = computed(() => this.worksheet()?.activity7?.labels?.length ?? 0);
  a7Score = computed(() => {
    const labels = this.worksheet()?.activity7?.labels ?? [];
    return labels.filter(label => {
      const answer = this.a7Labels()[label.id];
      return answer && answer === label.text;
    }).length;
  });

  a8Total = computed(() => {
    const sequences = this.worksheet()?.activity8?.sequences ?? [];
    return sequences.reduce((total, seq) => total + seq.items.length, 0);
  });

  a9Score = computed(() =>
    Object.values(this.a9Results())
      .filter(v => v === true).length
  );

  a9Total = computed(() => {
    const fields = this.worksheet()?.activity9?.fields ?? [];
    // Only count fields that have expected answers
    if (this.worksheet()?.activity9?.hasAnswerKey) {
      return fields.filter(f => 
        f.expectedAnswer && f.expectedAnswer.trim() !== ''
      ).length;
    }
    return fields.length;
  });
  a8Score = computed(() => {
    const sequences = this.worksheet()?.activity8?.sequences ?? [];
    let earned = 0;
    for (const seq of sequences) {
      const userSequence = this.a8Sequences()[seq.id] ?? [];
      for (let i = 0; i < seq.items.length; i++) {
        const item = seq.items[i];
        const userItem = userSequence[i];
        if (userItem && item.correctOrder === i + 1) earned += 1;
      }
    }
    return earned;
  });

  totalScore    = computed(() => this.a1Score() + this.a2Score() + this.a3Score() + this.a4Score() + this.a5Score() + this.a6Score() + this.a7Score() + this.a8Score() + this.a9Score());
  totalPossible = computed(() => {
    return this.a1Total() + this.a2Total() + this.a3Total() + this.a4Total() + this.a5Total() + this.a6Total() + this.a7Total() + this.a8Total() + this.a9Total();
  });

  completedActivities = computed(() => {
    let n = 0;
    if (this.a1Checked()) n++;
    if (Object.keys(this.a2Revealed()).length > 0 && Object.keys(this.a2Revealed()).length >= this.a2Total()) n++;
    if (Object.keys(this.a3Answers()).length >= this.a3Total() && this.a3Total() > 0) n++;
    if (this.a4Checked()) n++;
    if (this.a5Checked()) n++;
    if (Object.keys(this.a6Answers()).length >= this.a6Total() && this.a6Total() > 0) n++;
    if (this.a7Checked()) n++;
    if (this.a8Checked()) n++;
    if (this.a9Checked()) n++;
    return n;
  });

  totalActivities = computed(() => {
    const ws = this.worksheet() as any;
    if (!ws) return 4;
    let n = 0;
    if (ws.activity1) n++;
    if (ws.activity2) n++;
    if (ws.activity3) n++;
    if (ws.activity4) n++;
    if (ws.activity5) n++;
    if (ws.activity6) n++;
    if (ws.activity7) n++;
    if (ws.activity8) n++;
    if (ws.activity9) n++;
    return n || 4;
  });

  progressPercent = computed(() =>
    this.totalPossible() > 0
      ? Math.round((this.totalScore() / this.totalPossible()) * 100)
      : 0
  );

  /* ── Overlay worksheet detection ───────────────────────────── */
  isOverlayWorksheet = computed(() => !!this.worksheet()?.activity9);

  /* ── Lifecycle ───────────────────────────── */

  /**
   * Bridge: maps the new extensible activities[] array to the legacy
   * activity1/activity2/… flat fields that the viewer template reads.
   *
   * New format:  activities[i] = { type, title, instructions, data: {...}, order }
   * Legacy slot: activity1     = { title, instructions, ...data }
   *
   * Type → slot mapping:
   *   ordering       → activity1
   *   classification → activity2
   *   multipleChoice → activity3
   *   fillBlanks     → activity4
   *   matching       → activity5
   *   trueFalse      → activity6
   *
   * If legacy fields already exist (old worksheets) the method is a no-op.
   */
  private normalizeActivitiesArrayToLegacy(ws: any): any {
    const acts: any[] = ws?.activities ?? [];
    if (!acts.length) return ws;

    // Legacy worksheets already populated — skip
    if (ws.activity1 || ws.activity2 || ws.activity3 || ws.activity4) return ws;

    const TYPE_TO_SLOT: Record<string, string> = {
      ordering:       'activity1',
      classification: 'activity2',
      multipleChoice: 'activity3',
      fillBlanks:     'activity4',
      matching:       'activity5',
      trueFalse:      'activity6',
      labeling:       'activity7',
      overlay:        'activity9',
    };

    const patch: any = {};
    for (const act of acts) {
      if (!act?.type) continue;
      const slot = TYPE_TO_SLOT[act.type];
      if (!slot || patch[slot]) continue;  // skip unknown types or already mapped
      patch[slot] = {
        title:        act.title        ?? '',
        instructions: act.instructions ?? '',
        ...(act.data ?? {}),
      };
      console.log(`[NORMALIZE] ${act.type} → ${slot}`, patch[slot]);
    }

    return { ...ws, ...patch };
  }

  /**
   * Ensures every blank part in activity4 has a globally unique blankId.
   * The AI sometimes generates duplicate blankId values across sentences
   * (e.g. blanks 1,3,4,5 all share "blank_1"), causing all those inputs to
   * read/write the same slot in a4Blanks.  Any duplicate or missing blankId
   * is replaced with a deterministic position-based key `s{si}_b{pi}`.
   */
  private sanitizeActivity4BlankIds(ws: any): any {
    if (!ws?.activity4?.sentences?.length) return ws;
    const seen = new Set<string>();
    const sentences = (ws.activity4.sentences as any[]).map((s: any, si: number) => ({
      ...s,
      parts: (s.parts ?? []).map((p: any, pi: number) => {
        if (p.type !== 'blank') return p;
        let id: string = p.blankId;
        if (!id || seen.has(id)) {
          id = `s${si}_b${pi}`;
        }
        seen.add(id);
        return { ...p, blankId: id };
      }),
    }));
    return { ...ws, activity4: { ...ws.activity4, sentences } };
  }

  private applyTheme(theme: WorksheetTheme | undefined): void {
    if (!theme) return;
    const el: HTMLElement = this.el.nativeElement;
    const defaultGradient = 'linear-gradient(135deg, #0d3a4c 0%, #134e63 60%, #1a6070 100%)';
    const primary = theme.primaryColor || '#0f766e';
    const accent = theme.accentColor || '#e0f7f7';

    // Set base colors
    el.style.setProperty('--wv-primary', primary);
    el.style.setProperty('--wv-accent-light', accent);
    el.style.setProperty('--wv-bg', theme.backgroundColor || '#f1f5f9');
    el.style.setProperty('--wv-header-gradient', theme.headerGradient || defaultGradient);

    // Pre-compute alpha variants for themed backgrounds
    el.style.setProperty('--wv-primary-05', this.hexToRgba(primary, 0.05));
    el.style.setProperty('--wv-primary-08', this.hexToRgba(primary, 0.08));
    el.style.setProperty('--wv-primary-10', this.hexToRgba(primary, 0.10));
    el.style.setProperty('--wv-primary-12', this.hexToRgba(primary, 0.12));
    el.style.setProperty('--wv-primary-15', this.hexToRgba(primary, 0.15));
    el.style.setProperty('--wv-primary-20', this.hexToRgba(primary, 0.20));
    el.style.setProperty('--wv-primary-30', this.hexToRgba(primary, 0.30));
    el.style.setProperty('--wv-primary-70', this.hexToRgba(primary, 0.70));
    el.style.setProperty('--wv-accent-bg', this.hexToRgba(accent, 0.40));

    if (theme.colorPalette?.correct) {
      el.style.setProperty('--wv-correct', theme.colorPalette.correct);
    }
    if (theme.colorPalette?.wrong) {
      el.style.setProperty('--wv-wrong', theme.colorPalette.wrong);
    }
    const pattern = getPatternBackground(theme.patternType, theme.primaryColor);
    el.style.setProperty('--wv-pattern-image', pattern);
  }

  private hexToRgba(hex: string, alpha: number): string {
    // Handle hex with or without # prefix
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  ngOnInit(): void {
    // Auto-populate student name from auth service
    if (!this.reviewMeta?.studentName && this.mode === 'student') {
      this.authService.getMeProfile().then((user) => {
        if (user) {
          this.studentNameValue = user.displayName || user.email || 'Student';
          this.cdr.markForCheck();
        }
      }).catch(() => {
        // Fallback if auth fails
        this.studentNameValue = 'Student';
      });
    }

    // Setup autosave with debouncing (saves 30 seconds after last change)
    this.autosaveTrigger.pipe(
      debounceTime(30000),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.saveDraft();
    });

    // Also autosave every 60 seconds regardless of changes
    this.autosaveInterval = setInterval(() => {
      if (!this.isSubmitting() && !this.isSubmitted() && !this.reviewMode) {
        this.saveDraft();
      }
    }, 60000);

    this.api.getById(this.worksheetId).subscribe({
      next: (res: any) => {
        const ws: Worksheet = this.sanitizeActivity4BlankIds(
          this.normalizeActivitiesArrayToLegacy(res?.data ?? res)
        ) as Worksheet;
        console.log('[WORKSHEET DATA]', ws);
        console.log('[ACTIVITIES]', (ws as any).activities);
        console.log('[ACTIVITIES COUNT]', (ws as any).activities?.length);
        console.log('[activity1]', (ws as any).activity1, '[activity2]', (ws as any).activity2,
                    '[activity3]', (ws as any).activity3, '[activity4]', (ws as any).activity4);
        this.worksheet.set(ws);
        if (ws.theme) this.applyTheme(ws.theme);
        const items = [...(ws.activity1?.items ?? [])];
        const shuffled = this.shuffle(items);
        this.a1Pool = [...shuffled];
        this.a1SlotArrays = new Array(items.length).fill(null).map(() => []);
        this.a1Available.set(shuffled);
        this.a1Slots.set(new Array(items.length).fill(null));
        this.a5Bank = (ws.activity5?.pairs ?? []).map((p: any) => ({ id: p.id, text: p.rightItem?.text ?? '' }));
        if (this.reviewMode) {
          this.hydrateFromSubmission(ws);
        } else if (this.assignmentId && this.mode === 'student') {
          // Restore draft if exists
          this.loadDraft();
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load worksheet. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }
  }

  private async loadDraft(): Promise<void> {
    if (!this.assignmentId) return;
    try {
      const res = await firstValueFrom(this.api.getDraft(this.worksheetId, this.assignmentId));
      const draft = res?.data;
      if (draft) {
        // Restore activity answers from draft
        if (draft.activity1Answers) {
          const a1Map = draft.activity1Answers as Record<string, string>;
          const ws = this.worksheet();
          const items = ws?.activity1?.items ?? [];
          const restored = new Array(items.length).fill(null);
          for (let i = 0; i < items.length; i++) {
            const itemId = a1Map[`slot_${i}`];
            if (itemId) {
              restored[i] = items.find((it: any) => it.id === itemId) ?? null;
            }
          }
          this.a1Slots.set(restored);
          this.a1Available.set([]);
          this.a1Checked.set(false);
          this.a1SlotArrays = restored.map(item => item ? [item] : []);
          this.a1Pool = [];
        }
        if (draft.activity2Answers) this.a2Answers.set(draft.activity2Answers);
        if (draft.activity2Revealed) this.a2Revealed.set(draft.activity2Revealed);
        if (draft.activity3Answers) this.a3Answers.set(draft.activity3Answers);
        if (draft.activity4Blanks) this.a4Blanks.set(draft.activity4Blanks);
        this.lastSavedAt.set(new Date(draft.lastSavedAt || draft.updatedAt));
      }
    } catch (err: any) {
      // 404 is expected if no draft exists
      if (err?.status !== 404) {
        console.warn('[LOAD DRAFT] Failed to load draft:', err);
      }
    }
  }

  private async saveDraft(): Promise<void> {
    if (!this.assignmentId || this.reviewMode || this.isSubmitted()) return;
    this.isSavingDraft.set(true);
    try {
      // Convert a1Slots to activity1Answers map
      const a1Answers: Record<string, string> = {};
      this.a1Slots().forEach((slot: any, idx: number) => {
        a1Answers[`slot_${idx}`] = slot?.id || '';
      });

      await firstValueFrom(this.api.saveDraft(this.worksheetId, {
        assignmentId: this.assignmentId,
        activity1Answers: a1Answers,
        activity2Answers: this.a2Answers(),
        activity2Revealed: this.a2Revealed(),
        activity3Answers: this.a3Answers(),
        activity4Blanks: this.a4Blanks(),
        progressPercentage: this.progressPercent(),
        timeSpent: Math.floor((Date.now() - this.startTime) / 1000),
      }));
      this.lastSavedAt.set(new Date());
    } catch (err: any) {
      console.warn('[SAVE DRAFT] Failed to save draft:', err);
    } finally {
      this.isSavingDraft.set(false);
    }
  }

  private triggerAutosave(): void {
    if (!this.assignmentId || this.reviewMode || this.isSubmitted()) return;
    this.autosaveTrigger.next();
  }

  shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  /** Populate signals from a graded submission so review mode renders highlights. */
  private hydrateFromSubmission(ws: Worksheet): void {
    const a3: Record<string, string> = {};
    const a4: Record<string, string> = {};
    const a1StudentSlots: Record<number, string> = {};
    const a2: Record<string, string> = {};
    for (const a of this.submittedAnswers ?? []) {
      if (!a) continue;
      if (a.sectionId === 'activity3') a3[a.questionId] = a.studentAnswer ?? '';
      else if (a.sectionId === 'activity2') a2[a.questionId] = a.studentAnswer ?? '';
      else if (a.sectionId === 'activity1') {
        const idx = parseInt(a.questionId.replace('slot_', ''), 10);
        if (!isNaN(idx)) a1StudentSlots[idx] = a.studentAnswer ?? '';
      }
    }
    // Activity 4: positional match so sanitized blankIds map correctly to
    // submitted answers regardless of whether blankIds were originally duplicated.
    const a4Submitted = (this.submittedAnswers ?? []).filter((a: any) => a?.sectionId === 'activity4');
    let blankIdx = 0;
    (ws.activity4?.sentences ?? []).forEach((s: any) => {
      (s.parts ?? []).forEach((p: any) => {
        if (p.type !== 'blank') return;
        if (a4Submitted[blankIdx]) {
          a4[p.blankId] = a4Submitted[blankIdx].studentAnswer ?? '';
        }
        blankIdx++;
      });
    });
    this.a3Answers.set(a3);
    this.a4Blanks.set(a4);
    this.a4Checked.set(true);

    // Activity 1: reconstruct student's placed order from submission if available,
    // otherwise fall back to the answer key (correct order).
    const a1Items: any[] = ws.activity1?.items ?? [];
    if (a1Items.length > 0) {
      const hasStudentData = Object.keys(a1StudentSlots).length > 0;
      let resolved: (any | null)[];
      if (hasStudentData) {
        resolved = new Array(a1Items.length).fill(null);
        for (let i = 0; i < a1Items.length; i++) {
          const placedId = a1StudentSlots[i];
          if (placedId) resolved[i] = a1Items.find((it: any) => it.id === placedId) ?? null;
        }
      } else {
        resolved = [...a1Items].sort((a: any, b: any) => (a.correctOrder ?? 0) - (b.correctOrder ?? 0));
      }
      this.a1Slots.set(resolved);
      this.a1Available.set([]);
      this.a1Checked.set(true);
      this.a1SlotArrays = resolved.map(item => item ? [item] : []);
      this.a1Pool = [];
    }

    // Activity 2: render student's saved classifications.
    const a2Items = ws.activity2?.items ?? [];
    if (a2Items.length > 0) {
      const revealed: Record<string, boolean> = {};
      for (const item of a2Items) {
        const id = String((item as any).id ?? '');
        if (!id) continue;
        if (typeof a2[id] !== 'undefined') revealed[id] = true;
      }
      this.a2Answers.set(a2);
      this.a2Revealed.set(revealed);
    }

    // Activity 5: restore matching pairs from submission.
    const a5: Record<string, string> = {};
    for (const a of this.submittedAnswers ?? []) {
      if (!a) continue;
      if (a.sectionId === 'activity5' && a.questionId && a.studentAnswer) {
        a5[a.questionId] = a.studentAnswer;
      }
    }
    if (Object.keys(a5).length > 0 || (ws.activity5?.pairs?.length ?? 0) > 0) {
      this.a5Matches.set(a5);
      this.a5Checked.set(true);
    }

    // Activity 6: restore true/false answers from submission.
    // studentAnswer was serialised as String(boolean): 'true' | 'false' | ''
    const a6: Record<string, boolean> = {};
    for (const a of this.submittedAnswers ?? []) {
      if (!a) continue;
      if (a.sectionId === 'activity6' && a.questionId && a.studentAnswer !== '') {
        a6[a.questionId] = a.studentAnswer === 'true';
      }
    }
    if (Object.keys(a6).length > 0 || (ws.activity6?.questions?.length ?? 0) > 0) {
      this.a6Answers.set(a6);
      this.a6Checked.set(true);
    }

    // Activity 9: restore overlay worksheet data from preloaded inputs or submission
    if (this.preloadedA9Answers) {
      this.a9Answers.set(this.preloadedA9Answers);
      console.log('[HYDRATE A9] Restored answers:', this.preloadedA9Answers);
    }
    if (this.preloadedA9Results) {
      this.a9Results.set(this.preloadedA9Results);
      this.a9Checked.set(true);
      console.log('[HYDRATE A9] Restored results:', this.preloadedA9Results);
      console.log('[HYDRATE A9] Computed score after restore:', this.a9Score(), '/', this.a9Total());
    }
    if (this.preloadedA9Feedbacks) {
      this.a9Feedbacks.set(this.preloadedA9Feedbacks);
      console.log('[HYDRATE A9] Restored feedbacks:', this.preloadedA9Feedbacks);
    }

    if (this.reviewMeta?.studentName) this.studentNameValue = this.reviewMeta.studentName;
    if (this.reviewMeta?.date) this.worksheetDate = this.reviewMeta.date;
  }

  /* ── Activity 1 methods ──────────────────── */

  /** Keep signals in sync after CDK mutates the plain arrays. */
  private syncA1SignalsFromArrays(): void {
    this.a1Slots.set(this.a1SlotArrays.map(arr => arr[0] ?? null));
    this.a1Available.set([...this.a1Pool]);
  }

  /** CDK drop handler for individual slot targets. */
  onA1DropToSlot(event: CdkDragDrop<any[]>, slotIdx: number): void {
    if (this.reviewMode) return;
    if (event.previousContainer === event.container) return;

    const targetArr = this.a1SlotArrays[slotIdx];
    const sourceArr = event.previousContainer.data;
    const draggedItem = sourceArr[event.previousIndex];

    // If the target slot already holds an item, evict it back to pool.
    if (targetArr.length > 0) {
      const evicted = targetArr.splice(0, 1)[0];
      this.a1Pool.push(evicted);
    }
    // Move dragged item from its source into the slot.
    sourceArr.splice(event.previousIndex, 1);
    targetArr.push(draggedItem);

    this.syncA1SignalsFromArrays();
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  /** CDK drop handler for the pool (return-to-pool). */
  onA1DropToPool(event: CdkDragDrop<any[]>): void {
    if (this.reviewMode) return;
    if (event.previousContainer === event.container) {
      moveItemInArray(this.a1Pool, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        this.a1Pool,
        event.previousIndex,
        event.currentIndex,
      );
    }
    this.syncA1SignalsFromArrays();
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  /** Returns the unique cdkDropList id for a given slot index. */
  getA1SlotId(i: number): string { return `a1-slot-${i}`; }

  /** Returns all slot drop-list IDs (used by pool's [cdkDropListConnectedTo]). */
  getA1AllSlotIds(): string[] {
    return this.a1SlotArrays.map((_, i) => this.getA1SlotId(i));
  }

  /** Returns IDs of all lists a slot should be connected to (other slots + pool). */
  getA1ConnectedLists(excludeIdx: number): string[] {
    const slotIds = this.a1SlotArrays
      .map((_, i) => `a1-slot-${i}`)
      .filter((_, i) => i !== excludeIdx);
    return ['a1-pool', ...slotIds];
  }

  /* ── Activity 5: Match Pairs Methods ─────────────────── */
  onMatchPairDrop(event: CdkDragDrop<any>, pairId: string): void {
    if (this.reviewMode) return;
    if (event.previousContainer === event.container) return;

    const draggedData = event.previousContainer.data;
    const draggedItem = Array.isArray(draggedData) ? draggedData[event.previousIndex] : draggedData;
    
    if (draggedItem && draggedItem.text) {
      this.a5Matches.update(m => ({ ...m, [pairId]: draggedItem.text }));
      this.cdr.markForCheck();
      this.triggerAutosave();
    }
  }

  resetActivity5(): void {
    this.a5Matches.set({});
    this.a5Checked.set(false);
    this.a5Bank = (this.worksheet()?.activity5?.pairs ?? []).map((p: any) => ({ id: p.id, text: p.rightItem?.text ?? '' }));
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  checkActivity5(): void {
    this.a5Checked.set(true);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  getA5DropId(pairId: string): string {
    return 'a5-drop-' + String(pairId).replace(/[^a-zA-Z0-9]/g, '-');
  }

  getA5AllDropIds(): string[] {
    return (this.worksheet()?.activity5?.pairs ?? []).map((p: any) => this.getA5DropId(p.id));
  }

  /* ── Activity 6: True/False Methods ──────────────────── */
  selectTrueFalse(questionId: string, answer: boolean): void {
    if (this.reviewMode || this.a6Checked()) return;
    this.a6Answers.update(a => ({ ...a, [questionId]: answer }));
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  resetActivity6(): void {
    this.a6Answers.set({});
    this.a6Checked.set(false);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  checkActivity6(): void {
    this.a6Checked.set(true);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  /* ── Activity 7: Image Label Methods ─────────────────── */
  selectImageLabel(labelId: string, labelText: string): void {
    if (this.reviewMode || this.a7Checked()) return;
    const currentLabels = this.a7Labels();
    currentLabels[labelId] = labelText;
    this.a7Labels.set(currentLabels);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  resetActivity7(): void {
    this.a7Labels.set({});
    this.a7Checked.set(false);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  checkActivity7(): void {
    this.a7Checked.set(true);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  /* ── Activity 8: Enhanced Sequencing Methods ─────────── */
  getSequenceItem(sequenceId: string, slotIndex: number): any {
    const sequence = this.a8Sequences()[sequenceId];
    return sequence?.[slotIndex];
  }

  getUnplacedSequenceItems(sequenceId: string): any[] {
    const worksheet = this.worksheet();
    if (!worksheet?.activity8) return [];
    
    const sequence = worksheet.activity8.sequences.find(s => s.id === sequenceId);
    if (!sequence) return [];
    
    const placedItems = this.a8Sequences()[sequenceId] || [];
    const placedIds = placedItems.map((item: any) => item.id);
    
    return sequence.items.filter(item => !placedIds.includes(item.id));
  }

  getSequenceDropListIds(sequenceId: string): string[] {
    const worksheet = this.worksheet();
    if (!worksheet?.activity8) return [];
    
    const sequence = worksheet.activity8.sequences.find(s => s.id === sequenceId);
    if (!sequence) return [];
    
    return sequence.items.map((_, i) => `sequence-${sequenceId}-slot-${i}`);
  }

  onSequenceDrop(event: CdkDragDrop<any>, sequenceId: string, slotIndex: number): void {
    if (this.reviewMode) return;
    if (event.previousContainer === event.container) return;

    const draggedData = event.previousContainer.data;
    const draggedItem = Array.isArray(draggedData) ? draggedData[event.previousIndex] : draggedData;
    const currentSequences = this.a8Sequences();
    const currentSequence = currentSequences[sequenceId] || [];
    
    // Remove from previous position if it's from the same sequence
    if (draggedData?.sequenceId === sequenceId) {
      currentSequence.splice(event.previousIndex, 1);
    }
    
    // Insert at new position
    currentSequence.splice(slotIndex, 0, draggedItem);
    currentSequences[sequenceId] = currentSequence;
    
    this.a8Sequences.set(currentSequences);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  onSequencePoolDrop(event: CdkDragDrop<any[]>, sequenceId: string): void {
    if (this.reviewMode) return;
    if (event.previousContainer === event.container) return;

    const draggedItem = event.previousContainer.data[event.previousIndex];
    const currentSequences = this.a8Sequences();
    const currentSequence = currentSequences[sequenceId] || [];
    
    // Add to sequence
    currentSequence.push(draggedItem);
    currentSequences[sequenceId] = currentSequence;
    
    // Remove from pool
    event.previousContainer.data.splice(event.previousIndex, 1);
    
    this.a8Sequences.set(currentSequences);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  resetActivity8(): void {
    this.a8Sequences.set({});
    this.a8Checked.set(false);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  checkActivity8(): void {
    this.a8Checked.set(true);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  /* ── Activity 9: Overlay Worksheet Methods ─────────── */
  onA9Input(fieldId: string, value: string): void {
    console.log('[A9 INPUT]', fieldId, '=', value);
    this.a9Answers.update((answers) => ({ ...answers, [fieldId]: value }));
    console.log('[A9 ANSWERS]', this.a9Answers());
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  async checkActivity9(): Promise<void> {
    const fields = this.worksheet()?.activity9?.fields ?? [];
    const answers = this.a9Answers();

    console.log('[ACTIVITY9] Current answers:', answers);
    console.log('[ACTIVITY9] Answer count:', Object.keys(answers).length);
    console.log('[ACTIVITY9] Non-empty answers:', Object.values(answers).filter(a => a?.trim()).length);

    // Check if any answers were given
    const hasAnswers = Object.values(answers).some(a => a && a.trim() !== '');

    if (!hasAnswers) {
      // Show warning - no answers to check
      console.log('[ACTIVITY9] No answers to check');
      return;
    }

    // Check if we have expected answers for exact matching
    const hasAnswerKey = fields.some(f => f.expectedAnswer && f.expectedAnswer.trim());

    if (hasAnswerKey) {
      // Use exact matching for fields with answers
      this.runExactMatching(fields, answers);
      return;
    }

    // No answer key → use AI evaluation
    this.isEvaluating.set(true);
    this.a9Checked.set(false);

    try {
      const worksheetId = this.worksheet()?._id;

      const response = await this.http.post<any>(
        `${environment.apiUrl}/api/worksheets/${worksheetId}/evaluate-answers`,
        { answers }
      ).toPromise();

      if (response?.success) {
        this.a9Results.set(response.results || {});
        this.a9Feedbacks.set(response.feedbacks || {});
        this.a9Checked.set(true);

        console.log('[ACTIVITY9] AI evaluation complete:', response.score, '/', response.total);
        console.error('🟢 CHECK COMPLETE - answers stored:', JSON.stringify(this.a9Answers()));
        console.error('🟢 CHECK COMPLETE - results:', JSON.stringify(this.a9Results()));

        // Save activity9 data to draft for PDF download
        await this.saveA9DataToDraft();
      }

    } catch (error) {
      console.error('[ACTIVITY9] AI evaluation failed:', error);
      // Fall back to showing all as unscored
      const unscored: Record<string, null> = {};
      fields.forEach(f => { unscored[f.id] = null; });
      this.a9Results.set(unscored as any);
      this.a9Checked.set(true);
    } finally {
      this.isEvaluating.set(false);
      this.cdr.markForCheck();
      this.triggerAutosave();
    }
  }

  private async runExactMatching(fields: any[], answers: Record<string, string>): Promise<void> {
    const newResults: Record<string, boolean | null> = {};

    for (const field of fields) {
      const studentAnswer = (answers[field.id] || '').trim().toLowerCase();

      if (!studentAnswer) {
        newResults[field.id] = null;
        continue;
      }

      if (!field.expectedAnswer?.trim()) {
        newResults[field.id] = null;
        continue;
      }

      const correct = field.expectedAnswer.trim().toLowerCase();
      const exactMatch = studentAnswer === correct;
      const containsMatch = studentAnswer.includes(correct) || correct.includes(studentAnswer);

      newResults[field.id] = exactMatch || containsMatch;
    }

    this.a9Results.set(newResults);
    this.a9Checked.set(true);
    this.cdr.markForCheck();
    this.triggerAutosave();

    console.error('🟢 CHECK COMPLETE (exact match) - answers stored:', JSON.stringify(this.a9Answers()));
    console.error('🟢 CHECK COMPLETE (exact match) - results:', JSON.stringify(this.a9Results()));

    // Save activity9 data to draft for PDF download
    await this.saveA9DataToDraft();
  }

  resetActivity9(): void {
    this.a9Answers.set({});
    this.a9Results.set({});
    this.a9Checked.set(false);
    this.cdr.markForCheck();
    this.triggerAutosave();
  }

  onOverlayImageLoad(): void {
    // Placeholder for any image load handling if needed
  }

  private async saveA9DataToDraft(): Promise<void> {
    const ws = this.worksheet();
    if (!ws?.activity9) return;

    const worksheetId = ws._id;
    const assignmentId = this.assignmentId || this.route.snapshot.queryParams['assignmentId'];

    if (!assignmentId) {
      console.warn('[DRAFT SAVE] No assignmentId available, skipping draft save');
      return;
    }

    const activity9Data = {
      answers: this.a9Answers(),
      results: this.a9Results(),
      feedbacks: this.a9Feedbacks(),
      score: this.a9Score(),
      total: this.a9Total(),
      percentage: this.a9Total() > 0 ? Math.round((this.a9Score() / this.a9Total()) * 100) : 0,
      checked: this.a9Checked()
    };

    console.log('[DRAFT SAVE] Saving activity9Data:', {
      answerCount: Object.keys(activity9Data.answers).length,
      resultCount: Object.keys(activity9Data.results).length,
      score: activity9Data.score,
      total: activity9Data.total,
      checked: activity9Data.checked
    });

    const draftPayload = {
      assignmentId,
      activity9Answers: activity9Data.answers,
      activity9Results: activity9Data.results,
      activity9Score: activity9Data.score,
      activity9Total: activity9Data.total,
    };

    try {
      await this.http.post(
        `${environment.apiUrl}/api/worksheets/${worksheetId}/draft`,
        draftPayload
      ).toPromise();
      console.log('[DRAFT SAVE] Activity9 data saved to draft');
    } catch(e) {
      console.error('[DRAFT SAVE] Failed:', e);
    }
  }

  async downloadOverlayPdf(): Promise<void> {
    const ws = this.worksheet();
    if (!ws?.activity9) return;

    const worksheetId = ws._id;

    // Use current signal values (if available)
    let answers = this.a9Answers();
    let results = this.a9Results();
    let score = this.a9Score();
    let total = this.a9Total();

    console.log('[DOWNLOAD] Current answers:', Object.keys(answers).length);

    // Get student name
    const studentName = document.querySelector<HTMLInputElement>(
      'input[placeholder*="student name" i], input[placeholder*="Student name" i]'
    )?.value || this.studentNameValue || 'Student';

    try {
      await this.overlayPdfService.downloadOverlayPdf({
        worksheetId,
        assignmentId: this.assignmentId || this.route.snapshot.queryParams['assignmentId'],
        answers,
        results,
        score,
        total,
        studentName,
        subject: (ws as any)?.meta?.subject || (ws as any)?.subject || '',
        grade: (ws as any)?.meta?.gradeLevel || (ws as any)?.gradeLevel || '',
        className: '',
        assignmentTitle: '',
        dueDate: '',
      });
    } catch (error) {
      console.error('[DOWNLOAD OVERLAY PDF] Error:', error);
    }
  }

  /** Legacy click-based helpers — kept for backward compat; no longer wired to UI. */
  selectSlot(i: number): void {
    if (this.reviewMode) return;
    this.a1ActiveSlot.set(i);
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
    this.triggerAutosave();
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
    this.triggerAutosave();
  }

  getA3OptionClass(question: any, option: string): string {
    const selected = this.a3Answers()[question.id];
    if (!selected) return '';
    if (option === question.correctAnswer) return 'correct';
    if (selected === option) return 'wrong';
    return '';
  }

  /* ── Activity 4 methods ──────────────────── */
  /** Called on every keystroke inside a blank input. */
  onA4Input(blankId: string, event: Event): void {
    if (this.reviewMode || this.a4Checked()) return;
    const value = (event.target as HTMLInputElement).value;
    this.a4Blanks.update(b => ({ ...b, [blankId]: value }));
    this.triggerAutosave();
  }

  checkActivity4(): void {
    if (this.reviewMode) return;
    this.a4Checked.set(true);
  }

  resetActivity4(): void {
    if (this.reviewMode) return;
    this.a4Blanks.set({});
    this.a4Checked.set(false);
  }

  /** Helper for review mode: returns the correct fill-in-blank answer for a given part. */
  a4PartCorrect(part: any): string {
    return part?.correctAnswer ?? '';
  }

  /** Returns true when the student's blank answer is wrong (review mode display). */
  a4PartWrong(part: any): boolean {
    const blankId = part?.blankId;
    if (!blankId || !part?.correctAnswer) return false;
    const given = (this.a4Blanks()[blankId] ?? '').toLowerCase();
    return given !== '' && given !== (part.correctAnswer ?? '').toLowerCase();
  }

  /* ── Submit / Done ───────────────────────── */
  async onDone(): Promise<void> {
    if (this.reviewMode) { this.closed.emit(); return; }
    if (this.mode === 'preview') { this.closed.emit(); return; }
    if (!this.assignmentId) { this.closed.emit(); return; }

    // Auto-check activity9 answers before submitting if not yet checked
    const ws = this.worksheet();
    if (ws?.activity9 && !this.a9Checked()) {
      console.log('[SUBMIT] Auto-checking activity9 answers before submission');
      await this.checkActivity9();
      // Wait for AI evaluation to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.isSubmitting.set(true);
    const answers: any[] = [];

    // Activity 1 — slot placements (server will re-grade)
    this.a1Slots().forEach((slot: any, idx: number) => {
      answers.push({
        questionId: `slot_${idx}`,
        sectionId: 'activity1',
        studentAnswer: slot?.id || '',
        isCorrect: !!(slot && slot.correctOrder === idx + 1),
      });
    });

    // Activity 2 — classification selections
    (ws?.activity2?.items ?? []).forEach((item: any) => {
      answers.push({
        questionId: item.id,
        sectionId: 'activity2',
        studentAnswer: this.a2Answers()[item.id] || '',
        isCorrect: this.a2Answers()[item.id] === item.correctCategory,
      });
    });

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

    // Activity 5 — matching pairs
    (ws?.activity5?.pairs ?? []).forEach((pair: any) => {
      const match = this.a5Matches()[pair.id];
      answers.push({
        questionId: pair.id,
        sectionId: 'activity5',
        studentAnswer: match || '',
        isCorrect: !!match && match === pair.rightItem?.text,
      });
    });

    // Activity 6 — true/false
    (ws?.activity6?.questions ?? []).forEach((q: any) => {
      const ans = this.a6Answers()[q.id];
      answers.push({
        questionId: q.id,
        sectionId: 'activity6',
        studentAnswer: ans === undefined ? '' : String(ans),
        isCorrect: ans === q.correctAnswer,
      });
    });

    // For overlay worksheets (activity9), use AI evaluation score
    // For regular worksheets, use computed score from activities 1-6
    const isOverlay = !!ws?.activity9;
    const finalScore = isOverlay ? this.a9Score() : this.totalScore();
    const finalTotal = isOverlay ? this.a9Total() : this.totalPossible();
    const finalPercentage = finalTotal > 0 ? Math.round((finalScore / finalTotal) * 100) : 0;

    console.error('🔵 SUBMIT CALLED - a9Answers:', JSON.stringify(this.a9Answers()));
    console.error('🔵 SUBMIT CALLED - a9Score:', this.a9Score());

    try {
      const result = await firstValueFrom(
        this.api.submit(this.worksheetId, {
          assignmentId: this.assignmentId,
          answers,
          totalPointsEarned: finalScore,
          totalPointsPossible: finalTotal,
          percentage: finalPercentage,
          timeTaken: Math.floor((Date.now() - this.startTime) / 1000),
          // Activity 9 overlay worksheet data
          activity9Answers: this.a9Answers(),
          activity9Results: this.a9Results(),
          activity9Feedbacks: this.a9Feedbacks(),
        })
      );
      const submissionId: string | null = result?.submission?._id ?? null;
      this.submittedSubmissionId.set(submissionId);
      this.isSubmitted.set(true);
      // Emit completion event to update teacher dashboard counters instantly
      if (this.assignmentId) {
        this.assignmentState.markCompleted(this.assignmentId);
      }
    } catch (err: any) {
      this.alert.showError(
        'Submission failed',
        err?.error?.message ?? err?.message ?? 'Please try again',
      );
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
    const shuffled = this.shuffle(items);
    this.a1Pool = [...shuffled];
    this.a1SlotArrays = new Array(items.length).fill(null).map(() => []);
    this.syncA1SignalsFromArrays();
    this.a1Checked.set(false);
    this.a2Answers.set({});
    this.a2Revealed.set({});
    this.a3Answers.set({});
    this.a4Blanks.set({});
    this.a4Checked.set(false);
  }

  trackByIndex(i: number): number { return i; }
  trackById(_: number, item: any): string { return item?.id ?? item; }

  /* ── Difficulty helpers ───────────────────── */
  isDifficultyEasy(): boolean {
    const diff = this.worksheet()?.difficulty?.toLowerCase();
    return diff === 'easy' || diff === 'beginner';
  }

  isDifficultyMedium(): boolean {
    const diff = this.worksheet()?.difficulty?.toLowerCase();
    return diff === 'medium' || diff === 'intermediate';
  }

  isDifficultyHard(): boolean {
    const diff = this.worksheet()?.difficulty?.toLowerCase();
    return diff === 'hard' || diff === 'advanced';
  }

  formatDifficulty(difficulty: string | null | undefined): string {
    if (!difficulty) return '';
    const diff = difficulty.toLowerCase();
    if (diff === 'easy' || diff === 'beginner') return 'Beginner';
    if (diff === 'medium' || diff === 'intermediate') return 'Intermediate';
    if (diff === 'hard' || diff === 'advanced') return 'Advanced';
    return difficulty;
  }

  /* ── Deadline helpers ─────────────────────── */
  assignmentDeadline = computed(() => {
    const deadline = this.reviewMeta?.deadline;
    if (!deadline) return null;
    return typeof deadline === 'string' ? new Date(deadline) : deadline;
  });

  isDeadlinePast(): boolean {
    const deadline = this.assignmentDeadline();
    if (!deadline) return false;
    return new Date() > deadline;
  }

  formatDeadline(deadline: Date | null): string {
    if (!deadline) return '';
    return deadline.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
