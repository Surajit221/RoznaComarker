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

@Component({
  selector: 'app-student-submission-pages',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppBarBackButton,
    ImageAnnotationOverlayComponent,
    TokenizedTranscript,
    ModalDialog
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

  submissions: BackendSubmission[] = [];
  currentSubmission: BackendSubmission | null = null;
  currentFeedback: BackendFeedback | null = null;

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

  private computeIssueStats() {
    const stats = {
      spelling: 0,
      grammar: 0,
      typography: 0,
      style: 0,
      other: 0,
      total: 0
    };

    for (const issue of Array.isArray(this.writingCorrectionsIssues) ? this.writingCorrectionsIssues : []) {
      const key = (issue && typeof (issue as any).groupKey === 'string' ? String((issue as any).groupKey) : 'other').toLowerCase();
      if (key in stats) {
        (stats as any)[key] += 1;
      } else {
        stats.other += 1;
      }
      stats.total += 1;
    }

    return stats;
  }

  private computeFallbackScore100() {
    const s = this.computeIssueStats();
    const penalty =
      s.spelling * 1.2 +
      s.grammar * 1.6 +
      s.typography * 0.8 +
      s.style * 0.6 +
      s.other * 0.4;
    const score = Math.max(0, Math.min(100, Math.round((100 - penalty) * 10) / 10));
    return { score, maxScore: 100 };
  }

  get overallScoreText(): string {
    const fb: any = this.currentFeedback;
    const score = Number(fb?.score);
    const maxScore = Number(fb?.maxScore);
    if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
      return `${Math.round(score * 10) / 10}/${Math.round(maxScore * 10) / 10}`;
    }

    const fallback = this.computeFallbackScore100();
    return `${fallback.score}/100`;
  }

  get gradeLabel(): string {
    const fb: any = this.currentFeedback;
    let score = Number(fb?.score);
    let maxScore = Number(fb?.maxScore);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
      const fallback = this.computeFallbackScore100();
      score = fallback.score;
      maxScore = fallback.maxScore;
    }

    const pct = (score / maxScore) * 100;
    if (pct >= 90) return 'A';
    if (pct >= 80) return 'B';
    if (pct >= 70) return 'C';
    if (pct >= 60) return 'D';
    return 'F';
  }

  get issueStats() {
    return this.computeIssueStats();
  }

  get contentIssuesCount(): number {
    return this.issueStats.other;
  }

  get grammarIssuesCount(): number {
    return this.issueStats.grammar;
  }

  get organizationIssuesCount(): number {
    return this.issueStats.style + this.issueStats.typography;
  }

  get vocabularyIssuesCount(): number {
    return this.issueStats.spelling;
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
    const fb: any = this.currentFeedback;
    const score = Number(fb?.score);
    const maxScore = Number(fb?.maxScore);
    if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
      return Math.max(0, Math.min(100, (score / maxScore) * 100));
    }

    const fallback = this.computeFallbackScore100();
    return Math.max(0, Math.min(100, (fallback.score / fallback.maxScore) * 100));
  }

  get progressRingCircumference(): number {
    return 326.56;
  }

  get progressRingOffset(): number {
    return this.progressRingCircumference - (this.overallScorePct / 100) * this.progressRingCircumference;
  }

  get actionSteps(): string[] {
    const s = this.computeIssueStats();
    const steps: Array<{ key: string; text: string; count: number }> = [
      { key: 'spelling', text: 'Review spelling mistakes and re-check misspelled words.', count: s.spelling },
      { key: 'grammar', text: 'Fix grammar issues (tense, agreement, sentence structure).', count: s.grammar },
      { key: 'typography', text: 'Correct punctuation/typography issues (quotes, commas, spacing).', count: s.typography },
      { key: 'style', text: 'Improve clarity and conciseness by revising awkward sentences.', count: s.style },
      { key: 'other', text: 'Review flagged sections and refine the wording.', count: s.other }
    ]
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    const top = steps.slice(0, 5).map((x) => x.text);
    return top.length ? top : ['Keep practicing and re-check your writing for small improvements.'];
  }

  get areasForImprovement(): Array<{ title: string; description: string; borderClass: string }> {
    const items: Array<{ key: string; title: string; description: string; borderClass: string; count: number }> = [
      {
        key: 'content',
        title: 'Content & Relevance',
        description: 'Make sure each paragraph directly supports the task. Add clearer examples to develop your ideas.',
        borderClass: 'border-red-400',
        count: this.contentIssuesCount
      },
      {
        key: 'organization',
        title: 'Structure & Coherence',
        description: 'Improve paragraph flow and transitions. Use clear topic sentences and a stronger conclusion.',
        borderClass: 'border-blue-400',
        count: this.organizationIssuesCount
      },
      {
        key: 'grammar',
        title: 'Grammar & Mechanics',
        description: 'Fix sentence-structure and grammar errors. Re-check punctuation and spelling before final submission.',
        borderClass: 'border-green-400',
        count: this.grammarIssuesCount + this.vocabularyIssuesCount
      }
    ]
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    const top = items.slice(0, 3).map((x) => ({ title: x.title, description: x.description, borderClass: x.borderClass }));
    return top.length
      ? top
      : [{ title: 'Keep refining', description: 'Your writing looks strong overall. Review for small clarity and polish improvements.', borderClass: 'border-green-400' }];
  }

  get strengths(): Array<{ title: string; description: string }> {
    const s = this.computeIssueStats();
    const strengths: Array<{ title: string; description: string; score: number }> = [
      {
        title: 'Clarity & Readability',
        description: 'The writing is generally understandable and communicates the main idea.',
        score: Math.max(0, 100 - (s.style + s.typography) * 4)
      },
      {
        title: 'Grammar Control',
        description: 'Many sentences follow correct grammar patterns with room for minor fixes.',
        score: Math.max(0, 100 - s.grammar * 6)
      },
      {
        title: 'Word Choice',
        description: 'Vocabulary is mostly appropriate; keep improving precision and variety.',
        score: Math.max(0, 100 - s.spelling * 5)
      }
    ].sort((a, b) => b.score - a.score);

    const top = strengths.slice(0, 3).map((x) => ({ title: x.title, description: x.description }));
    return top.length ? top : [{ title: 'Effort', description: 'You have made a good attempt—keep practicing consistently.' }];
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

    try {
      const fb = await this.feedbackApi.generateAiFeedback({
        submissionId: submission._id,
        correctionLegend: this.defaultCorrectionLegend
      });
      this.currentFeedback = fb;
      this.alert.showToast('AI feedback generated', 'success');
    } catch (err: any) {
      this.alert.showError('Failed to generate AI feedback', err?.error?.message || err?.message || 'Please try again');
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
    } catch (err: any) {
      this.writingCorrectionsIssues = [];
      this.writingCorrectionsHtml = null;
      this.writingCorrectionsError = err?.error?.message || err?.message || 'Failed to check writing corrections';
      this.lastWritingCorrectionsText = null;
    } finally {
      this.isWritingCorrectionsLoading = false;
    }
  }

  feedbackForm: FormGroup;

  get feedbacks(): Array<{ category: string; score: number; maxScore: number; description: string }> {
    const fb: any = this.currentFeedback;
    if (!fb) return [];

    const toScore5 = (score100: any) => {
      const n = Number(score100);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(5, Math.round((n / 20) * 10) / 10));
    };

    const effective = fb?.evaluation?.effectiveRubric;
    const sf = fb?.evaluation?.structuredFeedback;

    if (effective && typeof effective === 'object') {
      return [
        {
          category: 'Grammar & Mechanics',
          score: toScore5(effective.grammarScore),
          maxScore: 5,
          description: String(sf?.grammarFeedback?.summary || '')
        },
        {
          category: 'Structure & Organization',
          score: toScore5(effective.structureScore),
          maxScore: 5,
          description: String(sf?.structureFeedback?.summary || '')
        },
        {
          category: 'Content Relevance',
          score: toScore5(effective.contentScore),
          maxScore: 5,
          description: String(sf?.contentFeedback?.summary || '')
        },
        {
          category: 'Overall Rubric Score',
          score: toScore5(effective.overallScore),
          maxScore: 5,
          description: String(sf?.grammarFeedback?.summary || '')
        }
      ];
    }

    const scoreRaw = fb.score;
    const maxScoreRaw = fb.maxScore;
    const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : 0;
    const maxScore = Number.isFinite(Number(maxScoreRaw)) ? Number(maxScoreRaw) : 0;
    const description = (fb.textFeedback || '').toString();

    return [
      {
        category: 'Overall Rubric Score',
        score,
        maxScore,
        description
      }
    ];
  }


  constructor(private router: Router, fb: FormBuilder) {
    this.feedbackForm = fb.group({
      message: ['']
    });
  }

  async ngOnInit() {
    this.studentId = this.route.snapshot.paramMap.get('studentId');
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignmentId');
    this.submissionId = this.route.snapshot.queryParamMap.get('submissionId');
    this.selectedAssignmentId = this.assignmentId;

    await this.loadClassTitle();

    await this.loadSubmissions();
    await this.loadFeedback();
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
      this.currentSubmission = submissionId
        ? this.submissions.find((s) => s._id === submissionId) || null
        : this.submissions[0] || null;

      const url = this.currentSubmission?.fileUrl || null;
      this.revokeObjectUrls();
      this.essayImageUrl = null;

      this.ocrWords = [];
      this.annotations = [];
      this.correctionsError = null;

      if (this.currentSubmission?._id && this.isProbablyPdfUrl(url)) {
        const previewUrl = this.buildSubmissionPreviewUrl(this.currentSubmission._id);
        this.essayImageUrl = await this.fetchAsObjectUrl(previewUrl);
      } else if (this.isProbablyImageUrl(url) && url) {
        this.essayImageUrl = await this.fetchAsObjectUrl(url);
      }

      if (this.currentSubmission?._id) {
        await this.loadOcrCorrections(this.currentSubmission._id);
      }

      await this.refreshWritingCorrections();
    } catch (err: any) {
      this.alert.showError('Failed to load submissions', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  private async loadFeedback() {
    const feedbackId = this.currentSubmission && (this.currentSubmission as any).feedback;
    if (!feedbackId || typeof feedbackId !== 'string') return;

    try {
      const fb = await this.feedbackApi.getFeedbackByIdForTeacher(feedbackId);
      this.currentFeedback = fb;
      this.feedbackForm.patchValue({
        message: (fb as any)?.teacherComments || fb?.textFeedback || ''
      });
    } catch (err: any) {
      // ignore if not found
    }
  }

  async submitFeedback() {
    const submission = this.currentSubmission;
    if (!submission) {
      this.alert.showWarning('No submission', 'Please select a submission first.');
      return;
    }

    const textFeedback = this.feedbackForm.value.message;
    const teacherComments = typeof textFeedback === 'string' ? textFeedback : (textFeedback == null ? undefined : String(textFeedback));

    try {
      const existingFeedbackId = submission && (submission as any).feedback;
      if (existingFeedbackId && typeof existingFeedbackId === 'string') {
        const updated = await this.feedbackApi.updateFeedback({
          feedbackId: existingFeedbackId,
          textFeedback,
          teacherComments
        });
        this.currentFeedback = updated;
      } else {
        const created = await this.feedbackApi.createFeedback({
          submissionId: submission._id,
          textFeedback,
          teacherComments
        });
        this.currentFeedback = created;
      }

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
