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

import { environment } from '../../../../../../environments/environment';



@Component({

  selector: 'app-my-submission-page',

  imports: [CommonModule, ReactiveFormsModule, AppBarBackButton, TokenizedTranscript, ImageAnnotationOverlayComponent],

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



  highlightedTranscriptHtml: SafeHtml | null = null;



  writingCorrectionsLegend: CorrectionLegend | null = null;

  writingCorrectionsIssues: WritingCorrectionIssue[] = [];

  writingCorrectionsHtml: SafeHtml | null = null;

  writingCorrectionsError: string | null = null;

  isWritingCorrectionsLoading = false;

  private lastWritingCorrectionsText: string | null = null;



  ocrWords: OcrWord[] = [];

  annotations: FeedbackAnnotation[] = [];



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



    try {

      const pdfUrl = await this.pdfApi.getPdfUrl(submissionId);

      if (!pdfUrl) {

        this.alert.showError('PDF not available', 'Please try again');

        return;

      }



      const objectUrl = await this.fetchAsObjectUrl(pdfUrl, false);

      window.open(objectUrl, '_blank', 'noopener');

    } catch (err: any) {

      this.alert.showError('Failed to generate PDF', err?.error?.message || err?.message || 'Please try again');

    }

  }



  feedbackForm: FormGroup;



  get feedbacks(): Array<{ category: string; score: number; maxScore: number; description: string }> {

    const fb: any = this.feedback;

    if (!fb) return [];



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

        this.teacherComment = fb?.textFeedback || null;



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

