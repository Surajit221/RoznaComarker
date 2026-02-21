import { Component, EventEmitter, inject, Output } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';

import { DeviceService } from '../../../../../services/device.service';

import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';

import { CommonModule } from '@angular/common';

import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

import { HttpClient } from '@angular/common/http';

import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';

import { FeedbackApiService, type BackendFeedback } from '../../../../../api/feedback-api.service';

import { PdfApiService } from '../../../../../api/pdf-api.service';

import { AlertService } from '../../../../../services/alert.service';

import { ClassApiService } from '../../../../../api/class-api.service';

import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../../../environments/environment';

import { WritingCorrectionsApiService, type WritingCorrectionIssue } from '../../../../../api/writing-corrections-api.service';

import type { CorrectionLegend } from '../../../../../models/correction-legend.model';

import { buildWritingCorrectionsHtml } from '../../../../../utils/writing-corrections-highlight.util';

import { applyLegendToIssues } from '../../../../../utils/correction-legend-mapping.util';

import { buildLegendAlignedFeedback, type LegendAlignedFeedback } from '../../../../../utils/legend-aligned-feedback.util';

import { ImageAnnotationOverlayComponent } from '../../../../../components/image-annotation-overlay/image-annotation-overlay';

import { TokenizedTranscript } from '../../../../../components/submission-details/tokenized-transcript/tokenized-transcript';

import { TeacherDashboardStateService } from '../../../../../services/teacher-dashboard-state.service';

import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';

import type { OcrWord } from '../../../../../models/ocr-token.model';

import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';

import { DialogViewSubmissions } from '../dialog-view-submissions/dialog-view-submissions';

import { rubricScoresToFeedbackItems, type RubricFeedbackItem } from '../../../../../utils/dynamic-ai-feedback.util';

import type { RubricDesigner, SubmissionFeedback, RubricItem } from '../../../../../models/submission-feedback.model';



@Component({

  selector: 'app-student-submission-pages',

  imports: [

    CommonModule,

    FormsModule,

    ReactiveFormsModule,

    AppBarBackButton,

    ImageAnnotationOverlayComponent,

    TokenizedTranscript,

    ModalDialog,

    DialogViewSubmissions

  ],

  templateUrl: './student-submission-pages.html',

  styleUrl: './student-submission-pages.css',

})

export class StudentSubmissionPages {



  showDialog = false;

  openSheetSubmission = false;

  @Output() closed = new EventEmitter<void>();

  isUploadedFile = true;

  device = inject(DeviceService);

  activeTab = 'uploaded-file';



  private route = inject(ActivatedRoute);

  private submissionApi = inject(SubmissionApiService);

  private feedbackApi = inject(FeedbackApiService);

  private pdfApi = inject(PdfApiService);

  private alert = inject(AlertService);

  private classApi = inject(ClassApiService);

  private http = inject(HttpClient);

  private sanitizer = inject(DomSanitizer);

  private writingCorrectionsApi = inject(WritingCorrectionsApiService);

  private teacherDashboardState = inject(TeacherDashboardStateService);



  private readonly defaultCorrectionLegend: any = {

    version: '1.0',

    description: 'Academic correction legend for AI-assisted writing feedback',

    groups: [

      {

        key: 'CONTENT',

        label: 'Content (Ideas & Relevance)',

        color: '#FFD6A5',

        symbols: [

          { symbol: 'REL', label: 'Relevance', description: 'The idea is not related to the topic or task.' },

          { symbol: 'DEV', label: 'Idea Development', description: 'The point is too general or lacks details or examples.' },

          { symbol: 'TA', label: 'Task Achievement', description: 'The response does not fully answer the prompt or question.' },

          { symbol: 'CL', label: 'Clarity of Ideas', description: 'The message is unclear or confusing.' },

          { symbol: 'SD', label: 'Supporting Details', description: 'Examples or explanations are missing to support the main idea.' }

        ]

      },

      {

        key: 'ORGANIZATION',

        label: 'Organization (Structure & Flow)',

        color: '#CDE7F0',

        symbols: [

          { symbol: 'COH', label: 'Coherence', description: 'Ideas are not logically connected.' },

          { symbol: 'CO', label: 'Cohesion', description: 'Linking words or transitions are missing or misused.' },

          { symbol: 'PU', label: 'Paragraph Unity', description: 'The paragraph contains unrelated ideas.' },

          { symbol: 'TS', label: 'Topic Sentence', description: 'The topic sentence is missing or unclear.' },

          { symbol: 'CONC', label: 'Conclusion', description: 'The conclusion is weak or missing.' }

        ]

      },

      {

        key: 'GRAMMAR',

        label: 'Grammar (Sentence & Structure)',

        color: '#B7E4C7',

        symbols: [

          { symbol: 'T', label: 'Tense', description: 'Incorrect verb tense.' },

          { symbol: 'VF', label: 'Verb Form', description: 'Incorrect verb form.' },

          { symbol: 'AGR', label: 'Subject–Verb Agreement', description: 'The verb does not agree with the subject.' },

          { symbol: 'FRAG', label: 'Sentence Fragment', description: 'Incomplete sentence missing a subject or verb.' },

          { symbol: 'RO', label: 'Run-on Sentence', description: 'Two or more sentences are joined incorrectly.' },

          { symbol: 'WO', label: 'Word Order', description: 'The order of words in the sentence is incorrect.' },

          { symbol: 'ART', label: 'Article Use', description: 'Missing or incorrect article (a, an, the).' },

          { symbol: 'PREP', label: 'Preposition', description: 'Incorrect or missing preposition.' }

        ]

      },

      {

        key: 'VOCABULARY',

        label: 'Vocabulary (Word Use & Form)',

        color: '#E4C1F9',

        symbols: [

          { symbol: 'WC', label: 'Word Choice', description: 'A more suitable word could be used.' },

          { symbol: 'WF', label: 'Word Form', description: 'Incorrect form of the word.' },

          { symbol: 'REP', label: 'Repetition', description: 'The same word or phrase is repeated too often.' },

          { symbol: 'FORM', label: 'Formal / Inappropriate Word', description: 'The word is too informal or not suitable for academic context.' },

          { symbol: 'COL', label: 'Collocation', description: 'Words do not naturally go together.' }

        ]

      },

      {

        key: 'MECHANICS',

        label: 'Mechanics (Spelling & Punctuation)',

        color: '#FFF3BF',

        symbols: [

          { symbol: 'SP', label: 'Spelling', description: 'The word is spelled incorrectly.' },

          { symbol: 'P', label: 'Punctuation', description: 'Punctuation mark is missing, extra, or incorrect.' },

          { symbol: 'CAP', label: 'Capitalization', description: 'Incorrect use of capital or lowercase letters.' },

          { symbol: 'SPC', label: 'Spacing', description: 'Missing or extra space between words or sentences.' },

          { symbol: 'FMT', label: 'Formatting', description: 'Inconsistent formatting, alignment, or spacing.' }

        ]

      }



    ]

  };



  private hydrateRubricDesignerFromFeedback() {

    const d = this.currentFeedback?.rubricDesigner;

    if (!d) {

      this.resetRubricDesigner();

      return;

    }



    const levelsRaw = Array.isArray(d.levels) ? d.levels : [];

    const criteriaRaw = Array.isArray(d.criteria) ? d.criteria : [];

    const hasAnyLevelTitle = levelsRaw.some((l: any) => String(l?.title || '').trim().length);

    const hasAnyCriteriaTitle = criteriaRaw.some((c: any) => String(c?.title || '').trim().length);

    const hasAnyCellText = criteriaRaw.some((c: any) => Array.isArray(c?.cells) && c.cells.some((x: any) => String(x || '').trim().length));



    // If rubricDesigner exists but is effectively empty (common case), seed it from

    // the fixed AI rubric content so the modal inputs match the AI Feedback cards.

    if (!hasAnyLevelTitle && !hasAnyCriteriaTitle && !hasAnyCellText) {

      this.ensureFixedRubricScoresAndComments();

      const seeded = this.buildDefaultRubricDesignerFromFeedback(this.currentFeedback as SubmissionFeedback);

      (this.currentFeedback as any).rubricDesigner = seeded;

    }



    this.rubricDesignerTitle = typeof d.title === 'string' ? d.title : `Rubric: ${this.submissionTitle}`;



    const d2 = (this.currentFeedback as any)?.rubricDesigner || d;

    const levels = Array.isArray(d2.levels) ? d2.levels : [];

    const criteria = Array.isArray(d2.criteria) ? d2.criteria : [];



    this.rubricLevels = levels.length

      ? levels.map((l: any) => ({ title: String((l as any)?.title || ''), maxPoints: this.coercePointsInput((l as any)?.maxPoints) ?? 0 }))

      : Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: 10 }));



    this.rubricCriteriaRows = criteria.length

      ? criteria.map((c: any) => ({

          title: String(c?.title || ''),

          cells: this.rubricLevels.map((_, i) => String(Array.isArray(c?.cells) ? (c.cells[i] || '') : ''))

        }))

      : [{ title: '', cells: this.rubricLevels.map(() => '') }];

  }



  private buildDefaultRubricDesignerFromFeedback(fb: SubmissionFeedback): RubricDesigner {

    const title = `Rubric: ${this.submissionTitle}`;

    const levels = [

      { title: 'Excellent', maxPoints: 10 },

      { title: 'Good', maxPoints: 8 },

      { title: 'Fair', maxPoints: 6 },

      { title: 'Needs Improvement', maxPoints: 4 }

    ];



    const rs: any = (fb as any)?.rubricScores || {};

    const criteriaSeed = [

      { category: 'Grammar & Mechanics', message: typeof rs?.GRAMMAR?.comment === 'string' ? rs.GRAMMAR.comment : '' },

      { category: 'Structure & Organization', message: typeof rs?.ORGANIZATION?.comment === 'string' ? rs.ORGANIZATION.comment : '' },

      { category: 'Content Relevance', message: typeof rs?.CONTENT?.comment === 'string' ? rs.CONTENT.comment : '' },

      { category: 'Overall Rubric Score', message: typeof rs?.MECHANICS?.comment === 'string' ? rs.MECHANICS.comment : '' }

    ];



    const criteria = criteriaSeed.map((x: any) => {

      const cat = typeof x?.category === 'string' ? x.category : 'Criteria';

      const msg = typeof x?.message === 'string' ? x.message : '';

      return {

        title: cat,

        cells: levels.map((_, i) => (i === 0 ? msg : ''))

      };

    });



    return { title, levels, criteria };

  }



  private syncRubricDesignerStateFromRubricScores(): void {

    const fb: any = this.currentFeedback;

    if (!fb) return;



    this.ensureFixedRubricScoresAndComments();

    const rs: any = fb.rubricScores || {};



    const desired: Array<{ title: string; key: 'GRAMMAR' | 'ORGANIZATION' | 'CONTENT' | 'MECHANICS' }> = [

      { title: 'Grammar & Mechanics', key: 'GRAMMAR' },

      { title: 'Structure & Organization', key: 'ORGANIZATION' },

      { title: 'Content Relevance', key: 'CONTENT' },

      { title: 'Overall Rubric Score', key: 'MECHANICS' }

    ];



    const normalize = (s: any) => String(s || '').trim().toUpperCase().replace(/\s+/g, '_');

    const byTitle: Record<string, number> = {};

    for (let i = 0; i < (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).length; i++) {

      const t = normalize((this.rubricCriteriaRows[i] as any)?.title);

      if (!t) continue;

      byTitle[t] = i;

    }



    const ensureCellCount = (row: { title: string; cells: string[] }) => {

      const want = (Array.isArray(this.rubricLevels) ? this.rubricLevels : []).length;

      const have = Array.isArray(row.cells) ? row.cells.length : 0;

      if (have === want) return row;

      const next = Array.isArray(row.cells) ? [...row.cells] : [];

      while (next.length < want) next.push('');

      if (next.length > want) next.length = want;

      return { ...row, cells: next };

    };



    const rows = Array.isArray(this.rubricCriteriaRows) ? [...this.rubricCriteriaRows] : [];



    for (const d of desired) {

      const idx = byTitle[normalize(d.title)];

      const msg = typeof rs?.[d.key]?.comment === 'string' ? String(rs[d.key].comment || '') : '';



      if (Number.isFinite(idx)) {

        const existing = ensureCellCount(rows[idx]);

        const cells = [...existing.cells];

        cells[0] = msg;

        rows[idx] = { ...existing, title: d.title, cells };

      } else {

        const row = ensureCellCount({ title: d.title, cells: [] });

        const cells = [...row.cells];

        cells[0] = msg;

        rows.unshift({ ...row, cells });

      }

    }



    this.rubricCriteriaRows = rows;

  }



  assignmentId: string | null = null;

  submissionId: string | null = null;

  studentId: string | null = null;



  classTitle: string = '';



  selectedAssignmentId: string | null = null;



  isLoading = false;



  isPdfDownloading = false;

  isRubricSaving = false;



  submissions: BackendSubmission[] = [];

  currentSubmission: BackendSubmission | null = null;

  currentFeedback: SubmissionFeedback | null = null;



  private autoAiGeneratedFor = new Set<string>();



  get submissionTitle(): string {

    const a: any = this.currentSubmission && (this.currentSubmission as any).assignment;

    const title = a && typeof a === 'object' ? (a.title || a.name) : '';

    return typeof title === 'string' && title.trim().length ? title : 'Submission';

  }



  get submissionAuthor(): string {

    const a: any = this.currentSubmission && (this.currentSubmission as any).assignment;

    const teacher: any = a && typeof a === 'object' ? (a.teacher || a.createdBy) : null;

    const teacherEmail = teacher && typeof teacher === 'object' ? (teacher.email || teacher.userEmail) : '';

    if (typeof teacherEmail === 'string' && teacherEmail.trim().length) return teacherEmail.trim();



    const s: any = this.currentSubmission && (this.currentSubmission as any).student;

    if (!s) return '';

    if (typeof s === 'string') return '';

    return s.displayName || s.email || '';

  }



  get submissionDateText(): string {

    const a: any = this.currentSubmission && (this.currentSubmission as any).assignment;

    const assignmentDateRaw: any = a && typeof a === 'object' ? (a.publishedAt || a.createdAt) : null;



    const raw: any = assignmentDateRaw || (this.currentSubmission && (this.currentSubmission as any).submittedAt);

    const d = raw ? new Date(raw) : null;

    if (!d || Number.isNaN(d.getTime())) return '';

    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  }



  rubricFeedbackItems: RubricFeedbackItem[] = [];



  writingCorrectionsLegend: CorrectionLegend | null = null;

  writingCorrectionsIssues: WritingCorrectionIssue[] = [];

  writingCorrectionsHtml: SafeHtml | null = null;

  writingCorrectionsError: string | null = null;

  isWritingCorrectionsLoading = false;

  private lastWritingCorrectionsText: string | null = null;



  private legendAligned: LegendAlignedFeedback | null = null;



  ocrWords: OcrWord[] = [];

  annotations: FeedbackAnnotation[] = [];

  correctionsError: string | null = null;

  isCorrectionsLoading = false;



  private defaultRubricItem(): RubricItem {

    return { score: 0, maxScore: 5, comment: '' };

  }



  private buildEmptyFeedback(submissionId: string): SubmissionFeedback {

    return {

      submissionId,

      rubricScores: {

        CONTENT: this.defaultRubricItem(),

        ORGANIZATION: this.defaultRubricItem(),

        GRAMMAR: this.defaultRubricItem(),

        VOCABULARY: this.defaultRubricItem(),

        MECHANICS: this.defaultRubricItem()

      },

      overallScore: 0,

      grade: 'F',

      correctionStats: {

        content: 0,

        grammar: 0,

        organization: 0,

        vocabulary: 0,

        mechanics: 0

      },

      detailedFeedback: {

        strengths: [],

        areasForImprovement: [],

        actionSteps: []

      },

      aiFeedback: {

        perCategory: [],

        overallComments: ''

      },

      overriddenByTeacher: false

    };

  }



  private toRubricItemVm(category: string, item: RubricItem): RubricFeedbackItem {

    const labelMap: Record<string, string> = {

      CONTENT: 'Content Relevance',

      ORGANIZATION: 'Structure & Organization',

      GRAMMAR: 'Grammar',

      VOCABULARY: 'Vocabulary',

      MECHANICS: 'Mechanics'

    };



    return {

      category: labelMap[category] || category,

      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 0,

      maxScore: 5,

      description: typeof item?.comment === 'string' ? item.comment : ''

    };

  }



  get overallScoreText(): string {

    const score = Number(this.currentFeedback?.overallScore ?? this.legendAligned?.overallScore100);

    if (!Number.isFinite(score)) return '0/100';

    return `${Math.round(score * 10) / 10}/100`;

  }



  get gradeLabel(): string {

    const g = typeof this.currentFeedback?.grade === 'string'
      ? this.currentFeedback.grade
      : (typeof this.legendAligned?.grade === 'string' ? this.legendAligned.grade : '');

    return g || 'F';

  }



  get issueStats() {

    return { spelling: 0, grammar: 0, typography: 0, style: 0, other: 0, total: 0 };

  }



  get contentIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.CONTENT ?? this.currentFeedback?.correctionStats?.content);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get grammarIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.GRAMMAR ?? this.currentFeedback?.correctionStats?.grammar);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get organizationIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.ORGANIZATION ?? this.currentFeedback?.correctionStats?.organization);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get vocabularyIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.VOCABULARY ?? this.currentFeedback?.correctionStats?.vocabulary);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get mechanicsIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.MECHANICS ?? this.currentFeedback?.correctionStats?.mechanics);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get correctionStatsTotalForBars(): number {

    const total =

      this.contentIssuesCount +

      this.grammarIssuesCount +

      this.organizationIssuesCount +

      this.vocabularyIssuesCount +

      this.mechanicsIssuesCount;

    return total > 0 ? total : 1;

  }



  private barPct(count: number): number {

    return Math.max(0, Math.min(100, Math.round((count / this.correctionStatsTotalForBars) * 100)));

  }



  get contentIssuesBarWidth(): string {

    return `${this.barPct(this.contentIssuesCount)}%`;

  }



  get grammarIssuesBarWidth(): string {

    return `${this.barPct(this.grammarIssuesCount)}%`;

  }



  get organizationIssuesBarWidth(): string {

    return `${this.barPct(this.organizationIssuesCount)}%`;

  }



  get vocabularyIssuesBarWidth(): string {

    return `${this.barPct(this.vocabularyIssuesCount)}%`;

  }



  get mechanicsIssuesBarWidth(): string {

    return `${this.barPct(this.mechanicsIssuesCount)}%`;

  }



  get overallScorePct(): number {

    const score100 = Number(this.currentFeedback?.overallScore ?? this.legendAligned?.overallScore100);

    if (!Number.isFinite(score100)) return 0;

    return Math.max(0, Math.min(100, score100));

  }



  get progressRingCircumference(): number {

    return 326.56;

  }



  get progressRingOffset(): number {

    return this.progressRingCircumference - (this.overallScorePct / 100) * this.progressRingCircumference;

  }



  get actionSteps(): string[] {

    const computed = Array.isArray(this.legendAligned?.actionSteps) ? this.legendAligned!.actionSteps : [];

    if (computed.length) return computed.slice(0, 5);

    const arr = Array.isArray(this.currentFeedback?.detailedFeedback?.actionSteps)

      ? this.currentFeedback?.detailedFeedback?.actionSteps

      : [];

    return arr.length ? arr.slice(0, 5) : [''];

  }



  get areasForImprovement(): Array<{ title: string; description: string; borderClass: string }> {

    const computed = Array.isArray(this.legendAligned?.areasForImprovement) ? this.legendAligned!.areasForImprovement : [];

    const arr = computed.length

      ? computed

      : (Array.isArray(this.currentFeedback?.detailedFeedback?.areasForImprovement)

          ? this.currentFeedback?.detailedFeedback?.areasForImprovement

          : []);

    const top = arr.slice(0, 3);

    return top.map((t) => ({ title: t, description: '', borderClass: 'border-blue-400' }));

  }



  get strengths(): Array<{ title: string; description: string }> {

    const computed = Array.isArray(this.legendAligned?.strengths) ? this.legendAligned!.strengths : [];

    const arr = computed.length

      ? computed

      : (Array.isArray(this.currentFeedback?.detailedFeedback?.strengths)

          ? this.currentFeedback?.detailedFeedback?.strengths

          : []);

    const top = arr.slice(0, 3);

    return top.map((t) => ({ title: t, description: '' }));

  }



  essayImageUrl: string | null = null;

  private objectUrls: string[] = [];



  private async loadOcrCorrections(submissionId: string): Promise<boolean> {

    if (this.isCorrectionsLoading) return false;

    this.isCorrectionsLoading = true;

    this.correctionsError = null;



    try {

      const apiBaseUrl = `${environment.apiUrl}/api`;

      const resp = await firstValueFrom(

        this.http.post<any>(`${apiBaseUrl}/submissions/${encodeURIComponent(submissionId)}/ocr-corrections`, {})

      );



      const success = Boolean(resp && (resp as any).success);

      const data = resp && typeof resp === 'object' ? (resp as any).data : null;

      if (!success || !data) {

        this.ocrWords = [];

        this.annotations = [];

        return false;

      }



      const corrections: any[] = Array.isArray((data as any).corrections) ? (data as any).corrections : [];

      const ocrPages: any[] = Array.isArray((data as any).ocr) ? (data as any).ocr : [];



      const words: OcrWord[] = [];

      for (const p of ocrPages) {

        const pageWords = p && Array.isArray(p.words) ? p.words : [];

        for (const w of pageWords) {

          const id = typeof w?.id === 'string' ? w.id : '';

          const text = typeof w?.text === 'string' ? w.text : '';

          const bbox = w?.bbox && typeof w.bbox === 'object'

            ? { x: Number(w.bbox.x), y: Number(w.bbox.y), w: Number(w.bbox.w), h: Number(w.bbox.h) }

            : null;

          if (!id || !text) continue;

          if (bbox && ![bbox.x, bbox.y, bbox.w, bbox.h].every((v) => Number.isFinite(v))) {

            words.push({ id, text, bbox: null });

          } else {

            words.push({ id, text, bbox });

          }

        }

      }



      this.ocrWords = words;

      this.annotations = corrections.map((c: any) => ({

        _id: c && c.id ? String(c.id) : '',

        submissionId,

        page: typeof c?.page === 'number' && Number.isFinite(c.page) ? c.page : 1,

        wordIds: Array.isArray(c?.wordIds) ? c.wordIds : [],

        bboxList: Array.isArray(c?.bboxList) ? c.bboxList : [],

        group: typeof c?.category === 'string' ? c.category : (typeof c?.group === 'string' ? c.group : ''),

        symbol: typeof c?.symbol === 'string' ? c.symbol : '',

        color: typeof c?.color === 'string' ? c.color : '#FF0000',

        message: typeof c?.message === 'string' ? c.message : '',

        suggestedText: typeof c?.suggestedText === 'string' ? c.suggestedText : '',

        startChar: typeof c?.startChar === 'number' ? c.startChar : undefined,

        endChar: typeof c?.endChar === 'number' ? c.endChar : undefined,

        source: 'AI' as const,

        editable: Boolean(c?.editable)

      }));



      this.recomputeLegendAligned();



      return true;

    } catch (err: any) {

      this.ocrWords = [];

      this.annotations = [];

      this.correctionsError = err?.error?.message || err?.message || 'Failed to load AI corrections';

      return false;

    } finally {

      this.isCorrectionsLoading = false;

    }

  }



  get studentName(): string {

    const s: any = this.currentSubmission && (this.currentSubmission as any).student;

    if (!s) return '';

    if (typeof s === 'string') return '';

    return s.displayName || s.email || '';

  }



  async generateAiForCurrentSubmission() {

    const submission = this.currentSubmission;

    if (!submission) {

      this.alert.showWarning('No submission', 'Please select a submission first.');

      return;

    }



    if (this.isLoading) return;



    console.log('Generate AI clicked for', submission._id);

    console.log('Generating dynamic AI Feedback for submission', submission._id);

    this.isLoading = true;

    try {

      const updated = await this.feedbackApi.generateAiSubmissionFeedback(submission._id);

      this.currentFeedback = updated;

      console.log('TEACHER FEEDBACK LOADED:', updated);

      this.feedbackForm.patchValue({ message: updated?.aiFeedback?.overallComments || '' });

      this.hydrateRubricEditFormFromFeedback();

      this.ensureFixedRubricScoresAndComments();

      this.recomputeRubricFeedbackItems();



      if (!updated?.rubricDesigner) {

        const d = this.buildDefaultRubricDesignerFromFeedback(this.currentFeedback as SubmissionFeedback);

        this.currentFeedback = { ...updated, rubricDesigner: d };

      }



      // Persist the fixed rubric titles/scores/comments + rubric designer so students

      // see the exact same rubric content after AI generation.

      {

        const base = this.currentFeedback as SubmissionFeedback;

        const payload: SubmissionFeedback = {

          ...base,

          submissionId: submission._id,

          rubricDesigner: (base as any).rubricDesigner,

          rubricScores: (base as any).rubricScores,

          overriddenByTeacher: Boolean((base as any).overriddenByTeacher)

        };



        const saved = await this.feedbackApi.upsertSubmissionFeedback(submission._id, payload);

        this.currentFeedback = saved;

      }



      this.hydrateRubricDesignerFromFeedback();

      this.hydrateRubricEditFormFromFeedback();

      this.syncRubricDesignerStateFromRubricScores();

      this.recomputeRubricFeedbackItems();



      this.alert.showToast('AI feedback generated', 'success');

    } catch (err: any) {

      this.alert.showError('Generate AI Feedback failed', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isLoading = false;

    }

  }



  async downloadPdfForCurrentSubmission() {

    const submission = this.currentSubmission;

    if (!submission) {

      this.alert.showWarning('No submission', 'Please select a submission first.');

      return;

    }



    if (this.isPdfDownloading) return;

    this.isPdfDownloading = true;



    try {

      const blob = await this.pdfApi.downloadSubmissionPdf(submission._id);

      const objectUrl = URL.createObjectURL(blob);

      this.objectUrls.push(objectUrl);



      const a = document.createElement('a');

      a.href = objectUrl;

      a.download = 'submission-feedback.pdf';

      document.body.appendChild(a);

      a.click();

      a.remove();



      const ua = navigator.userAgent || '';

      const isIos = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

      if (isIos) {

        window.open(objectUrl, '_blank', 'noopener,noreferrer');

      }

    } catch (err: any) {

      this.alert.showError('Failed to generate PDF', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isPdfDownloading = false;

    }

  }



  get studentDisplayId(): string {

    const s: any = this.currentSubmission && (this.currentSubmission as any).student;

    const id = typeof s === 'string' ? s : s && (s._id || s.id);

    return id ? String(id) : '';

  }



  get extractedText(): string | null {

    const s = this.currentSubmission;

    if (!s) return null;

    const fromTranscript = (s as any).transcriptText && String((s as any).transcriptText).trim()

      ? String((s as any).transcriptText)

      : '';

    if (fromTranscript) return fromTranscript;

    const fromOcr = (s as any).ocrText && String((s as any).ocrText).trim()

      ? String((s as any).ocrText)

      : '';

    return fromOcr || null;

  }



  private safeWordCount(text: string | null): number {

    const t = typeof text === 'string' ? text.trim() : '';

    if (!t) return 0;

    return t.split(/\s+/).filter(Boolean).length;

  }



  private correctionStatsToCounts(): Record<string, number> {

    const cs: any = this.currentFeedback && (this.currentFeedback as any).correctionStats;

    return {

      CONTENT: Number(cs?.content) || 0,

      ORGANIZATION: Number(cs?.organization) || 0,

      GRAMMAR: Number(cs?.grammar) || 0,

      VOCABULARY: Number(cs?.vocabulary) || 0,

      MECHANICS: Number(cs?.mechanics) || 0

    };

  }



  get ocrSummaryText(): string {

    const wordCount = this.safeWordCount(this.extractedText);

    const counts = this.correctionStatsToCounts();

    const issuesDetected = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);

    const focusAreas = Object.entries(counts)

      .filter(([, v]) => (Number(v) || 0) > 0)

      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))

      .slice(0, 3)

      .map(([k]) => k);



    const focus = focusAreas.length ? focusAreas.join(', ') : 'N/A';

    return `wordCount: ${wordCount} • issuesDetected: ${issuesDetected} • focusAreas: ${focus}`;

  }



  private async ensureWritingCorrectionsLegendLoaded() {

    if (this.writingCorrectionsLegend) return;

    this.writingCorrectionsLegend = await this.writingCorrectionsApi.getLegend();

  }



  private async refreshWritingCorrections() {

    const text = this.extractedText || '';

    if (!text.trim()) {

      this.writingCorrectionsIssues = [];

      this.writingCorrectionsHtml = null;

      this.writingCorrectionsError = null;

      this.lastWritingCorrectionsText = null;

      this.recomputeRubricFeedbackItems();

      return;

    }



    if (this.lastWritingCorrectionsText === text) {

      return;

    }



    if (this.isWritingCorrectionsLoading) {

      return;

    }



    this.isWritingCorrectionsLoading = true;

    this.writingCorrectionsError = null;



    try {

      await this.ensureWritingCorrectionsLegendLoaded();

      const resp = await this.writingCorrectionsApi.check({ text, language: 'en-US' });

      const rawIssues = Array.isArray(resp?.issues) ? resp.issues : [];

      this.writingCorrectionsIssues = applyLegendToIssues(rawIssues, this.writingCorrectionsLegend);

      this.recomputeLegendAligned();

      const html = buildWritingCorrectionsHtml(text, this.writingCorrectionsIssues);

      this.writingCorrectionsHtml = this.sanitizer.bypassSecurityTrustHtml(html);

      this.lastWritingCorrectionsText = text;

      this.recomputeRubricFeedbackItems();

    } catch (err: any) {

      this.writingCorrectionsIssues = [];

      this.writingCorrectionsHtml = null;

      this.writingCorrectionsError = err?.error?.message || err?.message || 'Failed to check writing corrections';

      this.lastWritingCorrectionsText = null;

      this.recomputeRubricFeedbackItems();

    } finally {

      this.isWritingCorrectionsLoading = false;

    }

  }



  private recomputeLegendAligned(): void {

    this.legendAligned = buildLegendAlignedFeedback({

      legend: this.writingCorrectionsLegend,

      writingIssues: this.writingCorrectionsIssues,

      annotations: this.annotations

    });

  }



  feedbackForm: FormGroup;

  rubricEditForm: FormGroup;



  rubricDesignerTitle = '';

  rubricLevels: Array<{ title: string; maxPoints: number | null }> = [];

  rubricCriteriaRows: Array<{ title: string; cells: string[] }> = [];

  private rubricAttachInput: HTMLInputElement | null = null;



  private get rubricDesignerFromState(): RubricDesigner {

    const normalizeCriteriaTitle = (t: any): string => {

      const raw = String(t || '').trim();

      if (!raw) return '';

      const key = raw.toUpperCase().replace(/\s+/g, '_');

      const labelMap: Record<string, string> = {

        CONTENT: 'Content Relevance',

        ORGANIZATION: 'Structure & Organization',

        GRAMMAR: 'Grammar & Mechanics',

        VOCABULARY: 'Vocabulary',

        MECHANICS: 'Overall Rubric Score'

      };

      return labelMap[key] || raw;

    };



    return {

      title: this.rubricDesignerTitle,

      levels: this.rubricLevels.map((l) => ({

        title: String(l.title || ''),

        maxPoints: Number(l.maxPoints) || 0

      })),

      criteria: this.rubricCriteriaRows.map((r) => ({

        title: normalizeCriteriaTitle(r.title),

        cells: Array.isArray(r.cells) ? r.cells.map((x) => String(x || '')) : []

      }))

    };

  }



  private recomputeRubricFeedbackItems() {

    const fb = this.currentFeedback;

    if (!fb) {

      this.rubricFeedbackItems = [];

      return;

    }



    this.ensureFixedRubricScoresAndComments();

    this.rubricFeedbackItems = rubricScoresToFeedbackItems((fb as any).rubricScores);

  }



  private round1(n: number): number {

    return Math.round(n * 10) / 10;

  }



  private clamp(n: number, min: number, max: number): number {

    return Math.max(min, Math.min(max, n));

  }



  private ensureFixedRubricScoresAndComments(): void {

    const fb: any = this.currentFeedback;

    if (!fb) return;



    const la = this.legendAligned;

    const rs = fb.rubricScores || {};



    const scoreOf = (key: 'CONTENT' | 'ORGANIZATION' | 'GRAMMAR' | 'VOCABULARY' | 'MECHANICS'): number => {

      const fromFb = Number(rs?.[key]?.score);

      // Single source of truth: prefer the persisted backend rubric score, even if it is 0.
      if (Number.isFinite(fromFb)) return this.clamp(fromFb, 0, 5);

      // Backward-compat only: if older feedback is missing a score field entirely,
      // fall back to the precomputed legend-aligned score (do not overwrite valid persisted scores).
      const fromLa = Number(la?.perCategoryScores5?.[key]);

      if (Number.isFinite(fromLa)) return this.clamp(fromLa, 0, 5);

      return 0;

    };



    const grammarScore = this.round1(scoreOf('GRAMMAR'));

    const structureScore = this.round1(scoreOf('ORGANIZATION'));

    const contentScore = this.round1(scoreOf('CONTENT'));

    // IMPORTANT: do not recompute Overall Rubric Score from averages here.
    // Use the persisted MECHANICS rubric score as the single source of truth.
    const overallRubricScore = this.round1(scoreOf('MECHANICS'));



    const ensureItem = (k: string, score: number, comment: string) => {

      const existing = rs?.[k] || { score: 0, maxScore: 5, comment: '' };

      const existingScore = Number((existing as any).score);

      const existingComment = typeof (existing as any).comment === 'string' ? (existing as any).comment : '';

      rs[k] = {

        ...existing,

        // Never override a persisted score; only backfill if it is missing/invalid.
        score: Number.isFinite(existingScore) ? this.clamp(existingScore, 0, 5) : score,

        maxScore: 5,

        // Only backfill comment if it is empty.
        comment: existingComment.trim().length ? existingComment : comment

      };

    };



    const gmMsg = grammarScore >= 3.5

      ? 'Grammar and mechanics are strong with minimal issues detected.'

      : 'Grammar and mechanics need improvement; review sentence structure and correctness.';



    const soMsg = structureScore >= 3.5

      ? 'Structure and organization are clear with logical flow.'

      : 'Structure is hard to follow; consider using clear paragraphs.';



    const crMsg = contentScore >= 3.5

      ? 'Ideas are relevant and well supported.'

      : 'Some ideas appear unclear or off-target; focus on answering the prompt directly and completely.';



    const overallMsg = `Overall rubric reflects: Grammar & Mechanics ${grammarScore}/5, Structure & Organization ${structureScore}/5, Content Relevance ${contentScore}/5.`;



    ensureItem('GRAMMAR', grammarScore, gmMsg);

    ensureItem('ORGANIZATION', structureScore, soMsg);

    ensureItem('CONTENT', contentScore, crMsg);

    ensureItem('MECHANICS', overallRubricScore, overallMsg);



    fb.rubricScores = rs;

  }



  private isRubricDesignerStateEmpty(): boolean {

    const anyLevelTitle = (Array.isArray(this.rubricLevels) ? this.rubricLevels : []).some((l) => String(l?.title || '').trim().length);

    const anyCriteriaTitle = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => String(r?.title || '').trim().length);

    const anyCell = (Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []).some((r) => (Array.isArray(r?.cells) ? r.cells : []).some((c) => String(c || '').trim().length));

    return !anyLevelTitle && !anyCriteriaTitle && !anyCell;

  }



  constructor(private router: Router, fb: FormBuilder) {

    this.feedbackForm = fb.group({

      message: ['']

    });



    // Teachers can optionally override rubric scores and add an override reason.

    // These are persisted on the Feedback document and used by the backend evaluation engine.

    this.rubricEditForm = fb.group({

      grammarScore: [null],

      structureScore: [null],

      contentScore: [null],

      vocabularyScore: [null],

      taskAchievementScore: [null],

      overallScore: [null],

      overrideReason: [''],

      teacherComments: ['']

    });



    this.resetRubricDesigner();

  }



  private resetRubricDesigner() {

    this.rubricDesignerTitle = `Rubric: ${this.submissionTitle}`;



    this.rubricLevels = Array.from({ length: 4 }).map(() => ({

      title: '',

      maxPoints: 10

    }));



    this.rubricCriteriaRows = [

      {

        title: '',

        cells: this.rubricLevels.map(() => '')

      }

    ];

  }



  addRubricLevelColumn() {

    if (this.rubricLevels.length >= 5) return;

    this.rubricLevels = [...this.rubricLevels, { title: '', maxPoints: 10 }];

    this.rubricCriteriaRows = this.rubricCriteriaRows.map((r) => ({ ...r, cells: [...r.cells, ''] }));

  }



  addRubricCriteriaRow() {

    this.rubricCriteriaRows = [

      ...this.rubricCriteriaRows,

      {

        title: '',

        cells: this.rubricLevels.map(() => '')

      }

    ];

  }



  removeRubricCriteriaRow(index: number) {

    if (this.rubricCriteriaRows.length <= 1) return;

    this.rubricCriteriaRows = this.rubricCriteriaRows.filter((_, i) => i !== index);

  }



  get rubricCriteriaPreview(): Array<{ title: string; maxPoints: number }> {

    const d = this.currentFeedback?.rubricDesigner;

    const levels = d?.levels && Array.isArray(d.levels) && d.levels.length ? d.levels : null;

    const perRowMax = levels

      ? levels.reduce((acc, x: any) => acc + (Number(x?.maxPoints) || 0), 0)

      : this.rubricLevels.reduce((acc, x) => acc + (Number(x.maxPoints) || 0), 0);



    return this.rubricCriteriaRows

      .map((r) => ({ title: String(r.title || '').trim(), maxPoints: perRowMax }))

      .filter((r) => r.title.length > 0);

  }



  onRubricAttachRequested(inputEl: HTMLInputElement) {

    this.rubricAttachInput = inputEl;

    inputEl.click();

  }



  onRubricFileSelected(ev: Event) {

    const el = ev.target as HTMLInputElement | null;

    if (!el?.files?.length) return;

    // TODO: wire to backend when rubric file upload API is available.

    el.value = '';

  }



  coercePointsInput(value: any): number | null {

    if (value === '' || value == null) return null;

    const n = Number(value);

    if (!Number.isFinite(n)) return null;

    return Math.max(0, Math.floor(n));

  }



  async generateRubricUsingAi() {

    await this.generateAiForCurrentSubmission();

  }



  async attachRubricDesigner() {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;

    if (this.isRubricSaving) return;



    this.isRubricSaving = true;

    try {

      const base = this.currentFeedback || this.buildEmptyFeedback(submissionId);



      if (this.isRubricDesignerStateEmpty()) {

        this.ensureFixedRubricScoresAndComments();

        const seeded = this.buildDefaultRubricDesignerFromFeedback(base);

        this.rubricDesignerTitle = seeded.title;

        this.rubricLevels = seeded.levels.map((l) => ({ title: l.title, maxPoints: l.maxPoints }));

        this.rubricCriteriaRows = seeded.criteria.map((c) => ({ title: c.title, cells: [...c.cells] }));

      }



      // Keep AI Feedback cards and rubric modal consistent:

      // when teacher edits the rubric designer, sync the fixed 4 rubric descriptions

      // back into rubricScores comments.

      const fixedMap: Record<string, 'GRAMMAR' | 'ORGANIZATION' | 'CONTENT' | 'MECHANICS'> = {

        'GRAMMAR_&_MECHANICS': 'GRAMMAR',

        'STRUCTURE_&_ORGANIZATION': 'ORGANIZATION',

        'CONTENT_RELEVANCE': 'CONTENT',

        'OVERALL_RUBRIC_SCORE': 'MECHANICS'

      };



      const rs: any = (base as any).rubricScores || {};

      for (const row of Array.isArray(this.rubricCriteriaRows) ? this.rubricCriteriaRows : []) {

        const title = String((row as any)?.title || '').trim();

        if (!title) continue;

        const key = fixedMap[title.toUpperCase().replace(/\s+/g, '_')];

        if (!key) continue;



        const firstCell = Array.isArray((row as any).cells) ? String((row as any).cells[0] || '').trim() : '';

        if (!firstCell) continue;



        const existing = rs?.[key] || { score: 0, maxScore: 5, comment: '' };

        rs[key] = {

          ...existing,

          maxScore: 5,

          comment: firstCell

        };

      }



      this.currentFeedback = {

        ...(base as any),

        rubricScores: rs

      } as SubmissionFeedback;



      this.ensureFixedRubricScoresAndComments();



      const payload: SubmissionFeedback = {

        ...(this.currentFeedback as any),

        submissionId,

        rubricDesigner: this.rubricDesignerFromState,

        overriddenByTeacher: true

      };

      const updated = await this.feedbackApi.upsertSubmissionFeedback(submissionId, payload);

      this.currentFeedback = updated;

      this.hydrateRubricDesignerFromFeedback();

      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Rubric attached', 'success');

      this.showDialog = false;

    } catch (err: any) {

      this.alert.showError('Failed to attach rubric', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isRubricSaving = false;

    }

  }



  private hydrateRubricEditFormFromFeedback() {

    const fb = this.currentFeedback;

    if (!fb) return;



    this.rubricEditForm.patchValue({

      grammarScore: fb?.rubricScores?.GRAMMAR?.score ?? 0,

      structureScore: fb?.rubricScores?.ORGANIZATION?.score ?? 0,

      contentScore: fb?.rubricScores?.CONTENT?.score ?? 0,

      vocabularyScore: fb?.rubricScores?.VOCABULARY?.score ?? 0,

      taskAchievementScore: fb?.rubricScores?.MECHANICS?.score ?? 0,

      overallScore: fb?.overallScore ?? 0,

      overrideReason: '',

      teacherComments: typeof fb?.aiFeedback?.overallComments === 'string' ? fb.aiFeedback.overallComments : ''

    });



    if (!fb?.aiFeedback?.overallComments) {

      console.log('Teacher comment initialized as empty');

    }

  }



  private buildSubmissionFeedbackPayload(submissionId: string): SubmissionFeedback {

    const v: any = this.rubricEditForm.value || {};



    const base = this.currentFeedback || this.buildEmptyFeedback(submissionId);



    const teacherCommentsRaw = (this.rubricEditForm.value as any)?.teacherComments;

    const teacherComments = typeof teacherCommentsRaw === 'string' ? teacherCommentsRaw : (teacherCommentsRaw == null ? '' : String(teacherCommentsRaw));



    const overallCommentsRaw = (this.rubricEditForm.value as any)?.overrideReason;

    const overallComments = typeof overallCommentsRaw === 'string' ? overallCommentsRaw : (overallCommentsRaw == null ? '' : String(overallCommentsRaw));



    const coerceScore = (x: any) => {

      const n = Number(x);

      if (!Number.isFinite(n)) return 0;

      return Math.max(0, Math.min(5, n));

    };



    const coerceScore100 = (x: any) => {

      const n = Number(x);

      if (!Number.isFinite(n)) return 0;

      return Math.max(0, Math.min(100, n));

    };



    return {

      ...base,

      submissionId,

      rubricScores: {

        // Store the required rubric fields using existing schema keys.

        // GRAMMAR -> Grammar & Mechanics

        // ORGANIZATION -> Structure & Organization

        // CONTENT -> Content Relevance

        // MECHANICS -> Overall Rubric Score

        CONTENT: { ...base.rubricScores.CONTENT, score: coerceScore(v.contentScore), maxScore: 5 },

        ORGANIZATION: { ...base.rubricScores.ORGANIZATION, score: coerceScore(v.structureScore), maxScore: 5 },

        GRAMMAR: { ...base.rubricScores.GRAMMAR, score: coerceScore(v.grammarScore), maxScore: 5 },

        VOCABULARY: { ...base.rubricScores.VOCABULARY, score: coerceScore(v.vocabularyScore), maxScore: 5 },

        MECHANICS: { ...base.rubricScores.MECHANICS, score: coerceScore(v.taskAchievementScore), maxScore: 5 }

      },

      overallScore: coerceScore100(v.overallScore),

      detailedFeedback: {

        strengths: Array.isArray(base?.detailedFeedback?.strengths) ? base.detailedFeedback.strengths : [],

        areasForImprovement: Array.isArray(base?.detailedFeedback?.areasForImprovement)

          ? base.detailedFeedback.areasForImprovement

          : [],

        actionSteps: Array.isArray(base?.detailedFeedback?.actionSteps) ? base.detailedFeedback.actionSteps : []

      },

      aiFeedback: {

        perCategory: Array.isArray(base?.aiFeedback?.perCategory) ? base.aiFeedback.perCategory : [],

        overallComments: teacherComments

      },

      overriddenByTeacher: true

    };

  }



  async saveRubricOverrides() {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;



    if (this.isRubricSaving) return;

    this.isRubricSaving = true;

    try {

      const payload = this.buildSubmissionFeedbackPayload(submissionId);

      const updated = await this.feedbackApi.upsertSubmissionFeedback(submissionId, payload);

      this.currentFeedback = updated;

      this.feedbackForm.patchValue({ message: updated?.aiFeedback?.overallComments || '' });

      this.hydrateRubricEditFormFromFeedback();

      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Rubric updated', 'success');

      this.showDialog = false;

    } catch (err: any) {

      this.alert.showError('Failed to update rubric', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isRubricSaving = false;

    }

  }



  async ngOnInit() {

    this.studentId = this.route.snapshot.paramMap.get('studentId');

    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId');

    this.submissionId = this.route.snapshot.queryParamMap.get('submissionId');

    this.selectedAssignmentId = this.assignmentId;



    await this.loadClassTitle();



    await this.loadSubmissions();

    await this.loadFeedback();

    this.recomputeRubricFeedbackItems();

  }



  private async loadClassTitle() {

    const classId = this.route.snapshot.queryParamMap.get('classId');

    if (!classId) {

      this.classTitle = '';

      return;

    }



    try {

      const summary = await this.classApi.getClassSummary(classId);

      this.classTitle = summary?.name || '';

    } catch {

      this.classTitle = '';

    }

  }



  private isProbablyImageUrl(url: string | null | undefined): boolean {

    if (!url) return false;

    const lowered = url.toLowerCase();

    return lowered.endsWith('.png') || lowered.endsWith('.jpg') || lowered.endsWith('.jpeg');

  }



  private isProbablyPdfUrl(url: string | null | undefined): boolean {

    if (!url) return false;

    const lowered = url.toLowerCase().split('?')[0];

    return lowered.endsWith('.pdf');

  }



  private revokeObjectUrls() {

    for (const url of this.objectUrls) {

      try {

        URL.revokeObjectURL(url);

      } catch {

        // ignore

      }

    }

    this.objectUrls = [];

  }



  ngOnDestroy() {

    this.revokeObjectUrls();

  }



  private async fetchAsObjectUrl(url: string): Promise<string> {

    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));

    const objectUrl = URL.createObjectURL(blob);

    this.objectUrls.push(objectUrl);

    return objectUrl;

  }



  private async fetchAsEphemeralObjectUrl(url: string): Promise<string> {

    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));

    const objectUrl = URL.createObjectURL(blob);



    // Give new tab some time to load the PDF before revoking.

    setTimeout(() => {

      try {

        URL.revokeObjectURL(objectUrl);

      } catch {

        // ignore

      }

    }, 60000);



    return objectUrl;

  }



  private buildSubmissionPreviewUrl(submissionId: string): string {

    return `${environment.apiUrl}/api/pdf/download/${encodeURIComponent(submissionId)}`;

  }



  private async loadSubmissions() {

    const assignmentId = this.assignmentId;

    if (!assignmentId) return;

    if (this.isLoading) return;

    this.isLoading = true;



    try {

      const list = await this.submissionApi.getSubmissionsByAssignment(assignmentId);

      this.submissions = list || [];



      const submissionId = this.submissionId;



      const target = submissionId

        ? this.submissions.find((s) => s._id === submissionId) || null

        : this.submissions[0] || null;



      await this.applyCurrentSubmission(target, false);

    } catch (err: any) {

      this.alert.showError('Failed to load submissions', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isLoading = false;

    }

  }



  private get currentSubmissionIndex(): number {

    const id = this.currentSubmission?._id;

    if (!id) return -1;

    return this.submissions.findIndex((s) => s._id === id);

  }



  get canGoPrev(): boolean {

    return this.currentSubmissionIndex > 0;

  }



  get canGoNext(): boolean {

    const idx = this.currentSubmissionIndex;

    return idx >= 0 && idx < this.submissions.length - 1;

  }



  private async applyCurrentSubmission(submission: BackendSubmission | null, updateUrl: boolean) {

    this.currentSubmission = submission;

    this.submissionId = submission?._id || null;



    try {

      const a: any = submission && (submission as any).assignment;

      console.log('[SUBMISSION META] assignment.teacher', a && typeof a === 'object' ? (a.teacher || null) : null, 'assignment.createdAt', a && typeof a === 'object' ? a.createdAt : null);

    } catch {

      // ignore

    }



    const url = this.currentSubmission?.fileUrl || null;

    this.revokeObjectUrls();

    this.essayImageUrl = null;



    this.ocrWords = [];

    this.annotations = [];

    this.correctionsError = null;



    this.currentFeedback = null;

    this.feedbackForm.patchValue({ message: '' });

    this.recomputeRubricFeedbackItems();



    if (this.currentSubmission?._id && this.isProbablyPdfUrl(url)) {

      const previewUrl = this.buildSubmissionPreviewUrl(this.currentSubmission._id);

      this.essayImageUrl = await this.fetchAsObjectUrl(previewUrl);

    } else if (this.isProbablyImageUrl(url) && url) {

      this.essayImageUrl = await this.fetchAsObjectUrl(url);

    }



    if (this.currentSubmission?._id) {

      await this.loadOcrCorrections(this.currentSubmission._id);

    }



    await this.loadFeedback();

    this.recomputeRubricFeedbackItems();



    await this.ensureAiFeedbackGeneratedOnce();



    if (updateUrl && this.studentId) {

      const classId = this.route.snapshot.queryParamMap.get('classId');

      this.router.navigate(['/teacher/my-classes/detail/student-submissions', this.studentId], {

        queryParams: {

          classId: classId || undefined,

          assignmentId: this.assignmentId || undefined,

          submissionId: this.submissionId || undefined

        },

        replaceUrl: true

      });

    }

  }



  async onPrevSubmission() {

    if (this.isLoading) return;

    if (!this.canGoPrev) return;

    this.isLoading = true;

    try {

      const idx = this.currentSubmissionIndex;

      await this.applyCurrentSubmission(this.submissions[idx - 1] || null, true);

    } finally {

      this.isLoading = false;

    }

  }



  async onNextSubmission() {

    if (this.isLoading) return;

    if (!this.canGoNext) return;

    this.isLoading = true;

    try {

      const idx = this.currentSubmissionIndex;

      await this.applyCurrentSubmission(this.submissions[idx + 1] || null, true);

    } finally {

      this.isLoading = false;

    }

  }



  async onSubmissionSelected(submissionId: string) {

    const target = this.submissions.find((s) => s._id === submissionId) || null;

    if (!target) {

      this.alert.showWarning('Not found', 'Submission not found.');

      return;

    }



    if (this.isLoading) return;

    this.isLoading = true;

    try {

      await this.applyCurrentSubmission(target, true);

      this.openSheetSubmission = false;

    } finally {

      this.isLoading = false;

    }

  }



  private async loadFeedback() {

    const submissionId = this.currentSubmission && this.currentSubmission._id;

    if (!submissionId) return;



    try {

      const fb = await this.feedbackApi.getSubmissionFeedback(submissionId);

      this.currentFeedback = fb;

      console.log('TEACHER FEEDBACK LOADED:', fb);

      this.feedbackForm.patchValue({ message: fb?.aiFeedback?.overallComments || '' });

      this.hydrateRubricEditFormFromFeedback();



      // Normalize rubric titles/comments so AI Feedback section + rubric modal are consistent.

      this.ensureFixedRubricScoresAndComments();



      if (!(this.currentFeedback as any)?.rubricDesigner) {

        const d = this.buildDefaultRubricDesignerFromFeedback(this.currentFeedback as SubmissionFeedback);

        this.currentFeedback = { ...(this.currentFeedback as any), rubricDesigner: d } as SubmissionFeedback;



        // Persist rubric designer so the modal is never empty on reload.

        try {

          const saved = await this.feedbackApi.upsertSubmissionFeedback(submissionId, this.currentFeedback as SubmissionFeedback);

          this.currentFeedback = saved;

        } catch {

          // ignore persistence errors; UI still has seeded rubric designer in-memory

        }

      }



      this.hydrateRubricDesignerFromFeedback();

      this.recomputeRubricFeedbackItems();

    } catch (err: any) {

      const empty = this.buildEmptyFeedback(submissionId);

      this.currentFeedback = empty;

      console.log('TEACHER FEEDBACK LOADED:', empty);

      this.feedbackForm.patchValue({ message: '' });

      console.log('Teacher comment initialized as empty');

      this.hydrateRubricEditFormFromFeedback();

      this.hydrateRubricDesignerFromFeedback();

      this.recomputeRubricFeedbackItems();

    }

  }



  private hasAiRubricContent(fb: SubmissionFeedback | null): boolean {

    const rs: any = fb && (fb as any).rubricScores;

    if (!rs) return false;



    const keys: Array<'GRAMMAR' | 'ORGANIZATION' | 'CONTENT' | 'MECHANICS'> = ['GRAMMAR', 'ORGANIZATION', 'CONTENT', 'MECHANICS'];

    return keys.some((k) => {

      const s = Number(rs?.[k]?.score);

      const c = typeof rs?.[k]?.comment === 'string' ? rs[k].comment.trim() : '';

      return (Number.isFinite(s) && s > 0) || c.length > 0;

    });

  }



  private async ensureAiFeedbackGeneratedOnce(): Promise<void> {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;

    if (this.autoAiGeneratedFor.has(submissionId)) return;



    // Only auto-generate when we have text (OCR/transcript) to drive scoring.

    if (!this.extractedText || !String(this.extractedText).trim().length) return;



    // If feedback already contains rubric content, do nothing.

    if (this.hasAiRubricContent(this.currentFeedback)) {

      this.autoAiGeneratedFor.add(submissionId);

      return;

    }



    this.autoAiGeneratedFor.add(submissionId);

    try {

      await this.generateAiForCurrentSubmission();

    } catch {

      // ignore; user can still click Generate manually

    }

  }



  async submitFeedback() {

    const submission = this.currentSubmission;

    if (!submission) {

      this.alert.showWarning('No submission', 'Please select a submission first.');

      return;

    }



    const textFeedback = this.feedbackForm.value.message;

    const teacherComments = typeof textFeedback === 'string' ? textFeedback : (textFeedback == null ? '' : String(textFeedback));



    try {

      const base = this.currentFeedback || this.buildEmptyFeedback(submission._id);

      const payload: SubmissionFeedback = {

        ...base,

        submissionId: submission._id,

        aiFeedback: {

          perCategory: Array.isArray(base?.aiFeedback?.perCategory) ? base.aiFeedback.perCategory : [],

          overallComments: teacherComments

        },

        overriddenByTeacher: true

      };



      const updated = await this.feedbackApi.upsertSubmissionFeedback(submission._id, payload);

      this.currentFeedback = updated;

      // Reflect review instantly in dashboard pending list/count within the same session.
      try {
        this.teacherDashboardState.markReviewed(submission._id, updated);
      } catch {
        // ignore
      }

      console.log('[TEACHER FEEDBACK SAVED]', {

        submissionId: submission._id,

        overallComments: updated?.aiFeedback?.overallComments,

        length: typeof updated?.aiFeedback?.overallComments === 'string' ? updated.aiFeedback.overallComments.length : null,

        overriddenByTeacher: (updated as any)?.overriddenByTeacher

      });

      this.hydrateRubricEditFormFromFeedback();

      this.recomputeRubricFeedbackItems();



      this.alert.showToast('Feedback saved', 'success');

      // Ensure backend remains the source of truth if user later returns to dashboard.
      // (Marking reviewed above avoids flicker; refresh keeps state consistent.)
      this.teacherDashboardState.refresh();

    } catch (err: any) {

      this.alert.showError('Failed to save feedback', err?.error?.message || err?.message || 'Please try again');

    }

  }



  toBack() {

    const classId = this.route.snapshot.queryParamMap.get('classId');

    if (!this.studentId) {

      if (classId) {

        this.router.navigate(['/teacher/my-classes/detail', classId]);

        return;

      }

      this.router.navigate(['/teacher/my-classes']);

      return;

    }



    this.router.navigate(['/teacher/my-classes/detail/student-profile', this.studentId], {

      queryParams: {

        classId: classId || undefined

      }

    });

  }



  onEditRubric() {

    this.showDialog = true;

    this.ensureFixedRubricScoresAndComments();

    this.hydrateRubricDesignerFromFeedback();

    this.syncRubricDesignerStateFromRubricScores();

    this.hydrateRubricEditFormFromFeedback();

  }



  closeDialog() {

    this.showDialog = false;

  }



  onTabSelected(param: string) {

    this.activeTab = param;

    if (param === 'transcribed-text') {

      this.refreshWritingCorrections();

    }

  }



  onCloseSubmission() {

    this.openSheetSubmission = false;

  }

}

