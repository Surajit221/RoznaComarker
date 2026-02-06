import { Component, inject } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';

import { DeviceService } from '../../../../../services/device.service';

import { CommonModule } from '@angular/common';

import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';

import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { HttpClient } from '@angular/common/http';

import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';

import { FeedbackApiService, type BackendFeedback } from '../../../../../api/feedback-api.service';

import { PdfApiService } from '../../../../../api/pdf-api.service';

import { AlertService } from '../../../../../services/alert.service';

import { ClassApiService } from '../../../../../api/class-api.service';

import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { firstValueFrom } from 'rxjs';

import { TokenizedTranscript } from '../../../../../components/submission-details/tokenized-transcript/tokenized-transcript';

import { WritingCorrectionsApiService, type WritingCorrectionIssue } from '../../../../../api/writing-corrections-api.service';

import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';

import type { OcrWord } from '../../../../../models/ocr-token.model';

import type { CorrectionLegend } from '../../../../../models/correction-legend.model';

import { buildWritingCorrectionsHtml } from '../../../../../utils/writing-corrections-highlight.util';

import { ImageAnnotationOverlayComponent } from '../../../../../components/image-annotation-overlay/image-annotation-overlay';

import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';

import { environment } from '../../../../../../environments/environment';



@Component({

  selector: 'app-my-submission-page',

  imports: [CommonModule, ReactiveFormsModule, AppBarBackButton, TokenizedTranscript, ImageAnnotationOverlayComponent, ModalDialog],

  templateUrl: './my-submission-page.html',

  styleUrl: './my-submission-page.css',

})

export class MySubmissionPage {

  isUploadedFile = true;

  device = inject(DeviceService);

  activeTab = 'uploaded-file';



  private route = inject(ActivatedRoute);

  private submissionApi = inject(SubmissionApiService);

  private feedbackApi = inject(FeedbackApiService);

  private pdfApi = inject(PdfApiService);

  private alert = inject(AlertService);

  private classApi = inject(ClassApiService);

  private sanitizer = inject(DomSanitizer);

  private http = inject(HttpClient);

  private writingCorrectionsApi = inject(WritingCorrectionsApiService);



  assignmentId: string | null = null;

  classId: string | null = null;



  classTitle: string = '';



  isLoading = false;

  isPdfDownloading = false;

  submission: BackendSubmission | null = null;

  feedback: BackendFeedback | null = null;



  isOcrPolling = false;

  isOcrRefreshing = false;

  ocrErrorMessage: string | null = null;

  private ocrPollTimeoutId: any = null;



  uploadedFileUrl: string | null = null;

  private rawUploadedFileUrl: string | null = null;

  private uploadedFileIsPdf = false;

  private objectUrls: string[] = [];

  teacherComment: string | null = null;

  showRubricDialog = false;



  highlightedTranscriptHtml: SafeHtml | null = null;



  writingCorrectionsLegend: CorrectionLegend | null = null;

  writingCorrectionsIssues: WritingCorrectionIssue[] = [];

  writingCorrectionsHtml: SafeHtml | null = null;

  writingCorrectionsError: string | null = null;

  isWritingCorrectionsLoading = false;

  private lastWritingCorrectionsText: string | null = null;



  ocrWords: OcrWord[] = [];

  annotations: FeedbackAnnotation[] = [];

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
    const fb: any = this.feedback;
    const evalOverall = Number(fb?.evaluation?.effectiveRubric?.overallScore);
    if (Number.isFinite(evalOverall)) {
      return `${Math.round(evalOverall * 10) / 10}/100`;
    }

    const score = Number(fb?.score);
    const maxScore = Number(fb?.maxScore);
    if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
      return `${Math.round(score * 10) / 10}/${Math.round(maxScore * 10) / 10}`;
    }

    const fallback = this.computeFallbackScore100();
    return `${fallback.score}/100`;
  }

  get gradeLabel(): string {
    const fb: any = this.feedback;
    const fromEval = fb?.evaluation?.effectiveRubric;
    const letter = typeof fromEval?.gradeLetter === 'string' ? String(fromEval.gradeLetter) : '';
    if (letter) return letter;

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
    const fb: any = this.feedback;
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



  get isPdfUpload(): boolean {

    return this.uploadedFileIsPdf;

  }



  async onOpenUploadedPdf(event: Event) {

    event.preventDefault();



    const rawUrl = this.rawUploadedFileUrl;

    if (!rawUrl) {

      this.alert.showWarning('PDF not available', 'Please try again');

      return;

    }



    try {

      const objectUrl = await this.fetchAsObjectUrl(rawUrl, false);

      window.open(objectUrl, '_blank', 'noopener');

    } catch {

      this.alert.showError('Failed to open PDF', 'Please try again');

    }

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



  private async fetchAsObjectUrl(url: string, trackForCleanup = true): Promise<string> {

    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));

    const objectUrl = URL.createObjectURL(blob);



    if (trackForCleanup) {

      this.objectUrls.push(objectUrl);

    } else {

      // Give new tab some time to load the PDF before revoking.

      setTimeout(() => {

        try {

          URL.revokeObjectURL(objectUrl);

        } catch {

          // ignore

        }

      }, 60000);

    }



    return objectUrl;

  }



  private escapeHtml(value: string): string {

    return value

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;')

      .replace(/'/g, '&#039;');

  }



  private rebuildHighlightedTranscript() {

    const text = this.extractedText || '';

    if (!text) {

      this.highlightedTranscriptHtml = null;

      return;

    }



    const fb: any = this.feedback;

    const annotated = fb && fb.aiFeedback && Array.isArray(fb.aiFeedback.annotatedText)

      ? fb.aiFeedback.annotatedText

      : [];



    if (!annotated.length) {

      this.highlightedTranscriptHtml = this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(text));

      return;

    }



    const sorted = annotated

      .map((a: any) => {

        const startIndex = typeof a.startIndex === 'number' ? a.startIndex : Number(a.startIndex);

        const endIndex = typeof a.endIndex === 'number' ? a.endIndex : Number(a.endIndex);

        const symbol = typeof a.symbol === 'string' ? a.symbol : '';

        const description = typeof a.description === 'string' ? a.description : '';

        const suggestion = typeof a.suggestion === 'string' ? a.suggestion : '';

        const color = typeof a.color === 'string' ? a.color : '#FF0000';

        if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex) || endIndex <= startIndex) return null;

        if (!symbol) return null;

        return { startIndex, endIndex, symbol, description, suggestion, color };

      })

      .filter(Boolean)

      .sort((a: any, b: any) => a.startIndex - b.startIndex);



    let cursor = 0;

    let html = '';



    for (const a of sorted) {

      if (a.startIndex < cursor) {

        continue;

      }



      if (a.startIndex > cursor) {

        html += this.escapeHtml(text.slice(cursor, a.startIndex));

      }



      const snippet = text.slice(a.startIndex, a.endIndex);

      const tooltip = `${this.escapeHtml(a.symbol)} - ${this.escapeHtml(a.description)}${a.suggestion ? '<br />Suggestion: ' + this.escapeHtml(a.suggestion) : ''}`;



      html += `<span class="correction-highlight" style="border-bottom-color: ${this.escapeHtml(a.color)}; background: rgba(255, 193, 7, 0.15);">`;

      html += `${this.escapeHtml(snippet)}<span style="color:${this.escapeHtml(a.color)}; font-weight:700; margin-left:2px;">${this.escapeHtml(a.symbol)}</span>`;

      html += `<span class="correction-tooltip"><strong style="color:${this.escapeHtml(a.color)}">${this.escapeHtml(a.symbol)}</strong><br />${tooltip}</span>`;

      html += `</span>`;



      cursor = a.endIndex;

    }



    if (cursor < text.length) {

      html += this.escapeHtml(text.slice(cursor));

    }



    this.highlightedTranscriptHtml = this.sanitizer.bypassSecurityTrustHtml(html);

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



  private rebuildOcrWords() {

    const rawWords = this.submission && (this.submission as any).ocrData && Array.isArray((this.submission as any).ocrData.words)

      ? (this.submission as any).ocrData.words

      : [];



    const counters = new Map<number, number>();



    this.ocrWords = rawWords

      .map((w: any) => {

        const text = typeof w?.text === "string" ? w.text.trim() : '';

        if (!text) return null;



        const pageNum = typeof w?.page === 'number' ? w.page : Number(w?.page);

        const page = Number.isFinite(pageNum) ? pageNum : 1;



        const nextCount = (counters.get(page) || 0) + 1;

        counters.set(page, nextCount);

        const id = `word_${page}_${nextCount}`;



        let bbox: OcrWord['bbox'] = null;

        const rawBbox = w?.bbox;

        if (rawBbox && typeof rawBbox === 'object') {

          const x0 = Number((rawBbox as any).x0);

          const y0 = Number((rawBbox as any).y0);

          const x1 = Number((rawBbox as any).x1);

          const y1 = Number((rawBbox as any).y1);



          if ([x0, y0, x1, y1].every(Number.isFinite) && x1 > x0 && y1 > y0) {

            bbox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

          }

        }



        return {

          id,

          text,

          bbox

        } satisfies OcrWord;

      })

      .filter(Boolean) as OcrWord[];
  }

  private async loadOcrCorrections(submissionId: string) {
    try {
      console.log('Loading OCR corrections for submission:', submissionId);
      const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
      const resp = await firstValueFrom(this.http.post<any>(`${apiBaseUrl}/submissions/${submissionId}/ocr-corrections`, {}));
      
      console.log('OCR corrections response:', resp);
      
      const success = Boolean(resp && (resp as any).success);
      const data = resp && typeof resp === 'object' ? (resp as any).data : null;

      if (success && data) {
        const corrections: any[] = Array.isArray((data as any).corrections) ? (data as any).corrections : [];
        const ocrPages: any[] = Array.isArray((data as any).ocr) ? (data as any).ocr : [];
        
        console.log('Parsed corrections:', corrections);
        console.log('OCR pages:', ocrPages);
        
        // Verify wordIds exist in OCR data
        corrections.forEach((correction: any) => {
          if (correction && correction.wordIds && correction.wordIds.length > 0) {
            console.log(`Correction ${correction.id} wordIds:`, correction.wordIds);
            correction.wordIds.forEach((wordId: any) => {
              const found = ocrPages.some((page: any) => 
                page && page.words && page.words.some((word: any) => word && word.id === wordId)
              );
              console.log(`WordId ${wordId} found in OCR:`, found);
            });
          }
          
          if (correction && correction.bboxList && correction.bboxList.length > 0) {
            console.log(`Correction ${correction.id} bboxList:`, correction.bboxList);
          }
        });
        
        // Update annotations for overlay
        this.annotations = corrections.map((c: any) => ({
          _id: c && c.id ? c.id : '',
          submissionId,
          page: c?.page,
          wordIds: c?.wordIds || [],
          bboxList: c?.bboxList || [],
          group: c?.category,
          symbol: c?.symbol,
          color: c?.color || '#FF0000',
          message: c?.message,
          suggestedText: c?.suggestedText,
          startChar: c?.startChar,
          endChar: c?.endChar,
          source: 'AI' as const,
          editable: Boolean(c?.editable)
        }));
        
        console.log('Updated annotations for overlay:', this.annotations);
      }
    } catch (err) {
      console.error('Failed to load OCR corrections:', err);
      this.annotations = [];
    }
  }

  async downloadPdf() {

    const submissionId = this.submission?._id;

    if (!submissionId) {
      this.alert.showWarning('No submission', 'Please upload a submission first.');
      return;
    }

    if (this.isPdfDownloading) return;
    this.isPdfDownloading = true;

    try {
      const blob = await this.pdfApi.downloadSubmissionPdf(submissionId);
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



  feedbackForm: FormGroup;



  get feedbacks(): Array<{ category: string; score: number; maxScore: number; description: string }> {
    const fb: any = this.feedback;
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

    return [{ category: 'Overall Rubric Score', score, maxScore, description }];

  }

  scrollToAiFeedback() {
    const el = document.getElementById('ai-feedback-section');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openRubricDialog() {
    this.showRubricDialog = true;
  }

  closeRubricDialog() {
    this.showRubricDialog = false;
  }



  constructor(private router: Router, fb: FormBuilder) {

    this.feedbackForm = fb.group({

      message: ['']

    });

  }



  ngOnDestroy() {

    this.stopOcrPolling();

    this.revokeObjectUrls();

  }



  get extractedText(): string | null {

    const s = this.submission;

    if (!s) return null;

    const fromTranscript = s.transcriptText && String(s.transcriptText).trim() ? String(s.transcriptText) : '';

    if (fromTranscript) return fromTranscript;

    const fromOcr = s.ocrText && String(s.ocrText).trim() ? String(s.ocrText) : '';

    return fromOcr || null;

  }



  get ocrStatus(): BackendSubmission['ocrStatus'] | null {

    return this.submission?.ocrStatus || null;

  }



  get isOcrPending(): boolean {

    return this.ocrStatus === 'pending' && !this.extractedText;

  }



  async ngOnInit() {

    this.assignmentId = this.route.snapshot.paramMap.get('slug');

    this.classId = this.route.snapshot.queryParamMap.get('classId');



    await this.loadClassTitle();



    await this.load();

  }



  private async loadClassTitle() {

    const classId = this.classId;

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



  private async load() {

    const assignmentId = this.assignmentId;

    if (!assignmentId) return;

    if (this.isLoading) return;

    this.isLoading = true;



    try {

      let submission: BackendSubmission | null = null;

      try {

        submission = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId);

      } catch (e: any) {

        const mine = await this.submissionApi.getMySubmissions();

        const match = (mine || []).find((s) => {

          const a: any = s && (s as any).assignment;

          return typeof a === 'string' ? a === assignmentId : a && a._id === assignmentId;

        });

        submission = match || null;

      }



      this.submission = submission;

      await this.setUploadedFileUrl(submission?.fileUrl || null);



      this.rebuildOcrWords();

      if (submission?._id) {
        await this.loadOcrCorrections(submission._id);
      }



      this.ocrErrorMessage = null;

      if (submission?.ocrStatus === 'failed') {

        this.ocrErrorMessage = submission.ocrError || 'OCR failed';

      }



      this.syncOcrPolling();



      if (submission && (submission as any).feedback) {

        const submissionId = submission._id;

        const fb = await this.feedbackApi.getFeedbackBySubmissionForStudent(submissionId);

        this.feedback = fb;

        this.teacherComment = (fb as any)?.teacherComments || fb?.textFeedback || null;



        this.feedbackForm.patchValue({

          message: this.teacherComment || ''

        });

      }



      this.rebuildHighlightedTranscript();

      await this.refreshWritingCorrections();

    } catch (err: any) {

      this.alert.showError('Failed to load submission', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isLoading = false;

    }

  }



  private syncOcrPolling() {

    if (!this.submission) {

      this.stopOcrPolling();

      return;

    }



    if (this.submission.ocrStatus === 'pending' && !this.extractedText) {

      this.startOcrPolling();

      return;

    }



    this.stopOcrPolling();

  }



  private startOcrPolling() {

    if (this.isOcrPolling) return;

    this.isOcrPolling = true;

    this.scheduleNextOcrRefresh(1500);

  }



  private stopOcrPolling() {

    this.isOcrPolling = false;

    if (this.ocrPollTimeoutId) {

      clearTimeout(this.ocrPollTimeoutId);

      this.ocrPollTimeoutId = null;

    }

  }



  private scheduleNextOcrRefresh(ms: number) {

    if (!this.isOcrPolling) return;

    if (this.ocrPollTimeoutId) {

      clearTimeout(this.ocrPollTimeoutId);

      this.ocrPollTimeoutId = null;

    }



    this.ocrPollTimeoutId = setTimeout(() => {

      this.refreshSubmissionForOcr();

    }, ms);

  }



  private async refreshSubmissionForOcr() {

    const assignmentId = this.assignmentId;

    if (!assignmentId) {

      this.stopOcrPolling();

      return;

    }



    if (!this.isOcrPolling) return;

    if (this.isOcrRefreshing) {

      this.scheduleNextOcrRefresh(2500);

      return;

    }



    this.isOcrRefreshing = true;

    try {

      const updated = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId);

      this.submission = updated;

      await this.setUploadedFileUrl(updated?.fileUrl || this.rawUploadedFileUrl);



      this.rebuildOcrWords();

      this.rebuildHighlightedTranscript();

      await this.refreshWritingCorrections();



      if (updated?.ocrStatus === 'failed') {

        this.ocrErrorMessage = updated.ocrError || 'OCR failed';

      } else {

        this.ocrErrorMessage = null;

      }



      if (updated?.ocrStatus === 'completed' || updated?.ocrStatus === 'failed' || this.extractedText) {

        this.stopOcrPolling();

        return;

      }



      this.scheduleNextOcrRefresh(3000);

    } catch (err: any) {

      const message = err?.error?.message || err?.message || 'Failed to fetch OCR text';

      this.ocrErrorMessage = message;

      this.stopOcrPolling();

    } finally {

      this.isOcrRefreshing = false;

    }

  }



  toBack() {

    if (this.classId) {

      this.router.navigate(['/student/my-classes/detail', this.classId]);

      return;

    }



    this.router.navigate(['/student/my-classes']);

  }



  onTabSelected(param: string) {

    this.activeTab = param;

  }



  private setUploadedFileUrl(url: string | null) {

    this.revokeObjectUrls();

    this.rawUploadedFileUrl = url;

    this.uploadedFileUrl = null;

    this.uploadedFileIsPdf = false;



    if (!url) {

      return Promise.resolve();

    }



    const lowered = url.toLowerCase().split('?')[0];

    this.uploadedFileIsPdf = lowered.endsWith('.pdf');



    return this.fetchAsObjectUrl(url, true)

      .then((objectUrl) => {

        this.uploadedFileUrl = objectUrl;

      })

      .catch(() => {

        this.uploadedFileUrl = null;

      });

  }

}

