import { Component, EventEmitter, inject, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceService } from '../../../../../services/device.service';
import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
import { ImageAnnotationOverlayComponent } from '../../../../../components/image-annotation-overlay/image-annotation-overlay';
import { TokenizedTranscript } from '../../../../../components/submission-details/tokenized-transcript/tokenized-transcript';
import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';
import type { OcrWord } from '../../../../../models/ocr-token.model';
import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';
import { DialogViewSubmissions } from '../dialog-view-submissions/dialog-view-submissions';
import type { RubricFeedbackItem } from '../../../../../utils/dynamic-ai-feedback.util';
import type { SubmissionFeedback, RubricItem } from '../../../../../models/submission-feedback.model';

@Component({
  selector: 'app-student-submission-pages',
  imports: [
    CommonModule,
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
    const score = Number(this.currentFeedback?.overallScore);
    if (!Number.isFinite(score)) return '0/100';
    return `${Math.round(score * 10) / 10}/100`;
  }

  get gradeLabel(): string {
    const g = typeof this.currentFeedback?.grade === 'string' ? this.currentFeedback.grade : '';
    return g || 'F';
  }

  get issueStats() {
    return { spelling: 0, grammar: 0, typography: 0, style: 0, other: 0, total: 0 };
  }

  get contentIssuesCount(): number {
    const n = Number(this.currentFeedback?.correctionStats?.content);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get grammarIssuesCount(): number {
    const n = Number(this.currentFeedback?.correctionStats?.grammar);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get organizationIssuesCount(): number {
    const n = Number(this.currentFeedback?.correctionStats?.organization);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get vocabularyIssuesCount(): number {
    const n = Number(this.currentFeedback?.correctionStats?.vocabulary);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get correctionStatsTotalForBars(): number {
    const total = this.contentIssuesCount + this.grammarIssuesCount + this.organizationIssuesCount + this.vocabularyIssuesCount;
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

  get overallScorePct(): number {
    const score100 = Number(this.currentFeedback?.overallScore);
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
    const arr = Array.isArray(this.currentFeedback?.detailedFeedback?.actionSteps)
      ? this.currentFeedback?.detailedFeedback?.actionSteps
      : [];
    return arr.length ? arr.slice(0, 5) : [''];
  }

  get areasForImprovement(): Array<{ title: string; description: string; borderClass: string }> {
    const arr = Array.isArray(this.currentFeedback?.detailedFeedback?.areasForImprovement)
      ? this.currentFeedback?.detailedFeedback?.areasForImprovement
      : [];
    const top = arr.slice(0, 3);
    return top.map((t) => ({ title: t, description: '', borderClass: 'border-blue-400' }));
  }

  get strengths(): Array<{ title: string; description: string }> {
    const arr = Array.isArray(this.currentFeedback?.detailedFeedback?.strengths)
      ? this.currentFeedback?.detailedFeedback?.strengths
      : [];
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
      const apiBaseUrl = (environment as any).API_URL || (environment as any).apiBaseUrl;
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
    this.isLoading = true;
    try {
      const updated = await this.feedbackApi.generateAiSubmissionFeedback(submission._id);
      this.currentFeedback = updated;
      console.log('TEACHER FEEDBACK LOADED:', updated);
      this.feedbackForm.patchValue({ message: updated?.aiFeedback?.overallComments || '' });
      this.hydrateRubricEditFormFromFeedback();
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
      this.writingCorrectionsIssues = Array.isArray(resp?.issues) ? resp.issues : [];
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

  feedbackForm: FormGroup;
  rubricEditForm: FormGroup;

  private recomputeRubricFeedbackItems() {
    const fb = this.currentFeedback;
    if (!fb) {
      this.rubricFeedbackItems = [];
      return;
    }

    const rs = fb.rubricScores;
    const items: RubricFeedbackItem[] = [
      this.toRubricItemVm('CONTENT', rs?.CONTENT),
      this.toRubricItemVm('ORGANIZATION', rs?.ORGANIZATION),
      this.toRubricItemVm('GRAMMAR', rs?.GRAMMAR),
      this.toRubricItemVm('VOCABULARY', rs?.VOCABULARY),
      this.toRubricItemVm('MECHANICS', rs?.MECHANICS),
      {
        category: 'Overall Comments',
        score: Number.isFinite(Number(fb.overallScore)) ? Number(fb.overallScore) : 0,
        maxScore: 100,
        description: typeof fb?.aiFeedback?.overallComments === 'string' ? fb.aiFeedback.overallComments : ''
      }
    ];

    this.rubricFeedbackItems = items.filter((x) => Boolean(x.category));
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
        overallComments: (teacherComments || (base?.aiFeedback?.overallComments || overallComments || ''))
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
    const apiBaseUrl = (environment as any).API_URL || (environment as any).apiBaseUrl;
    const rootBaseUrl = String(apiBaseUrl).replace(/\/api\/?$/, '');
    return `${rootBaseUrl}/files/submission-preview/${encodeURIComponent(submissionId)}`;
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
      this.recomputeRubricFeedbackItems();
    } catch (err: any) {
      const empty = this.buildEmptyFeedback(submissionId);
      this.currentFeedback = empty;
      console.log('TEACHER FEEDBACK LOADED:', empty);
      this.feedbackForm.patchValue({ message: '' });
      this.hydrateRubricEditFormFromFeedback();
      this.recomputeRubricFeedbackItems();
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
        teacherComments
      };

      const updated = await this.feedbackApi.upsertSubmissionFeedback(submission._id, payload);
      this.currentFeedback = updated;
      this.hydrateRubricEditFormFromFeedback();
      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Feedback saved', 'success');
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
