import { Component, inject } from '@angular/core';



import { ActivatedRoute, Router } from '@angular/router';



import { DeviceService } from '../../../../../services/device.service';



import { CommonModule } from '@angular/common';



import { AppBarBackButton } from '../../../../../shared/app-bar-back-button/app-bar-back-button';



import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';



import { HttpClient } from '@angular/common/http';



import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';



import { FeedbackApiService } from '../../../../../api/feedback-api.service';



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

import { applyLegendToIssues } from '../../../../../utils/correction-legend-mapping.util';

import { rubricScoresToFeedbackItems, type RubricFeedbackItem } from '../../../../../utils/dynamic-ai-feedback.util';

import { buildLegendAlignedFeedback, type LegendAlignedFeedback } from '../../../../../utils/legend-aligned-feedback.util';

import { formatGradingDisplay, type GradingScale } from '../../../../../utils/grading-display.util';



import { ImageAnnotationOverlayComponent } from '../../../../../components/image-annotation-overlay/image-annotation-overlay';



import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';



import { environment } from '../../../../../../environments/environment';



import type { RubricDesigner, SubmissionFeedback, RubricItem } from '../../../../../models/submission-feedback.model';







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

  private hasLoadedClassSettings = false;







  classTitle: string = '';

  classGradingScale: GradingScale = 'score_0_100';



  private resolveClassIdFromSubmission(s: BackendSubmission | null): string | null {

    const fromQuery = this.classId;
    if (typeof fromQuery === 'string' && fromQuery.trim().length) return fromQuery.trim();

    const raw: any = s && (s as any).class;
    if (!raw) return null;

    if (typeof raw === 'string') return raw;

    const id = raw && typeof raw === 'object' ? (raw._id || raw.id) : null;
    return typeof id === 'string' && id.trim().length ? id.trim() : null;

  }



  private async ensureClassSettingsLoadedFromSubmission(s: BackendSubmission | null): Promise<void> {

    if (this.hasLoadedClassSettings) return;

    const classId = this.resolveClassIdFromSubmission(s);
    if (!classId) return;

    this.classId = classId;

    try {
      const summary = await this.classApi.getClassSummary(classId);
      const rawScale = typeof summary?.gradingScale === 'string' ? summary.gradingScale : undefined;
      this.classGradingScale = (rawScale === 'score_0_100' || rawScale === 'grade_a_f' || rawScale === 'pass_fail')
        ? rawScale
        : 'score_0_100';
      this.classTitle = this.classTitle || (summary?.name || '');
      this.hasLoadedClassSettings = true;
    } catch {
      this.classGradingScale = 'score_0_100';
      this.hasLoadedClassSettings = false;
    }

  }







  isLoading = false;



  isPdfDownloading = false;



  submission: BackendSubmission | null = null;



  feedback: SubmissionFeedback | null = null;



  get submissionTitle(): string {

    const a: any = this.submission && (this.submission as any).assignment;

    const title = a && typeof a === 'object' ? (a.title || a.name) : '';

    return typeof title === 'string' && title.trim().length ? title : 'Submission';

  }



  private recomputeLegendAligned(): void {

    this.legendAligned = buildLegendAlignedFeedback({

      legend: this.writingCorrectionsLegend,

      writingIssues: this.writingCorrectionsIssues,

      annotations: this.annotations

    });

  }



  get submissionAuthor(): string {

    const a: any = this.submission && (this.submission as any).assignment;

    const teacher: any = a && typeof a === 'object' ? (a.teacher || a.createdBy) : null;

    const teacherEmail = teacher && typeof teacher === 'object' ? (teacher.email || teacher.userEmail) : '';

    if (typeof teacherEmail === 'string' && teacherEmail.trim().length) return teacherEmail.trim();



    const s: any = this.submission && (this.submission as any).student;

    if (!s) return '';

    if (typeof s === 'string') return '';

    return s.displayName || s.email || '';

  }



  get submissionDateText(): string {

    const a: any = this.submission && (this.submission as any).assignment;

    const assignmentDateRaw: any = a && typeof a === 'object' ? (a.publishedAt || a.createdAt) : null;



    const raw: any = assignmentDateRaw || (this.submission && (this.submission as any).submittedAt);

    const d = raw ? new Date(raw) : null;

    if (!d || Number.isNaN(d.getTime())) return '';

    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  }







  isOcrPolling = false;



  isOcrRefreshing = false;



  ocrErrorMessage: string | null = null;



  private ocrPollTimeoutId: any = null;



  private destroyed = false;



  private loadSeq = 0;



  private hasLoadedOcrCorrections = false;







  uploadedFileUrl: string | null = null;



  private rawUploadedFileUrl: string | null = null;



  private uploadedFileIsPdf = false;



  private objectUrls: string[] = [];



  private removeObjectUrl(url: string) {



    const idx = this.objectUrls.indexOf(url);



    if (idx >= 0) {



      this.objectUrls.splice(idx, 1);



    }

  }



  private buildEmptyFeedback(submissionId: string): SubmissionFeedback {

    const emptyItem = () => ({ score: 0, maxScore: 5 as const, comment: '' });

    return {

      submissionId,

      rubricScores: {

        CONTENT: emptyItem(),

        ORGANIZATION: emptyItem(),

        GRAMMAR: emptyItem(),

        VOCABULARY: emptyItem(),

        MECHANICS: emptyItem()

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



  teacherComment: string | null = null;



  showRubricDialog = false;







  highlightedTranscriptHtml: SafeHtml | null = null;



  writingCorrectionsLegend: CorrectionLegend | null = null;

  writingCorrectionsIssues: WritingCorrectionIssue[] = [];

  writingCorrectionsHtml: SafeHtml | null = null;

  writingCorrectionsError: string | null = null;

  isWritingCorrectionsLoading = false;

  private lastWritingCorrectionsText: string | null = null;



  private legendAligned: LegendAlignedFeedback | null = null;



  ocrWords: OcrWord[] = [];



  annotations: FeedbackAnnotation[] = [];



  private toRubricVm(category: string, item: RubricItem | null | undefined) {

    const labelMap: Record<string, string> = {

      CONTENT: 'Content Relevance',

      ORGANIZATION: 'Structure & Organization',

      GRAMMAR: 'Grammar & Mechanics',

      VOCABULARY: 'Vocabulary',

      MECHANICS: 'Overall Rubric Score'

    };



    const score = Number(item?.score);

    return {

      category: labelMap[category] || category,

      score: Number.isFinite(score) ? Math.max(0, Math.min(5, Math.round(score * 10) / 10)) : 0,

      maxScore: 5,

      description: typeof item?.comment === 'string' ? item.comment : ''

    };

  }



  private get effectiveOverallScore100(): number {

    const fb: any = this.feedback;

    const persisted = Number(fb?.overallScore);

    // If a teacher explicitly overrode grading, the persisted score is authoritative.
    if (fb?.overriddenByTeacher && Number.isFinite(persisted)) return persisted;

    // Otherwise, prefer the live, legend-aligned score derived from LanguageTool issues
    // so the score stays consistent with Correction Statistics shown on the page.
    const live = Number(this.legendAligned?.overallScore100);

    if (Number.isFinite(live)) return live;

    // If the writing issues are not available (or legend alignment hasn't run yet) but the
    // backend feedback includes correction statistics, compute the same legend-aligned score
    // from those counts to keep the UI consistent.
    const cs: any = fb?.correctionStats;
    const hasCounts = cs && typeof cs === 'object';
    if (hasCounts) {
      const counts = {
        CONTENT: Math.max(0, Number(cs?.content) || 0),
        ORGANIZATION: Math.max(0, Number(cs?.organization) || 0),
        GRAMMAR: Math.max(0, Number(cs?.grammar) || 0),
        VOCABULARY: Math.max(0, Number(cs?.vocabulary) || 0),
        MECHANICS: Math.max(0, Number(cs?.mechanics) || 0)
      };

      const weights = {
        CONTENT: 1.0,
        ORGANIZATION: 0.9,
        GRAMMAR: 1.2,
        VOCABULARY: 1.0,
        MECHANICS: 1.1
      };

      const round1 = (n: number) => Math.round(n * 10) / 10;
      const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

      const perCategoryScores5 = {
        CONTENT: 5,
        ORGANIZATION: 5,
        GRAMMAR: 5,
        VOCABULARY: 5,
        MECHANICS: 5
      };

      for (const k of Object.keys(perCategoryScores5) as Array<keyof typeof perCategoryScores5>) {
        const penalty = counts[k] * 0.35 * (weights as any)[k];
        (perCategoryScores5 as any)[k] = round1(clamp(5 - penalty, 0, 5));
      }

      const avg5 =
        (perCategoryScores5.CONTENT +
          perCategoryScores5.ORGANIZATION +
          perCategoryScores5.GRAMMAR +
          perCategoryScores5.VOCABULARY +
          perCategoryScores5.MECHANICS) /
        5;

      const fromStats = round1(clamp((avg5 / 5) * 100, 0, 100));
      if (Number.isFinite(fromStats)) return fromStats;
    }

    // Fallback to persisted score if present.
    if (Number.isFinite(persisted)) return persisted;

    return 0;

  }



  get overallScoreText(): string {

    const score = this.effectiveOverallScore100;

    return formatGradingDisplay(score, this.classGradingScale).displayText;

  }


  private buildFallbackRubricDesignerFromFeedback(fb: SubmissionFeedback): RubricDesigner | null {

    const rs: any = fb && (fb as any).rubricScores ? (fb as any).rubricScores : {};

    const criteriaSeed = [
      { category: 'Grammar & Mechanics', message: typeof rs?.GRAMMAR?.comment === 'string' ? rs.GRAMMAR.comment : '' },
      { category: 'Structure & Organization', message: typeof rs?.ORGANIZATION?.comment === 'string' ? rs.ORGANIZATION.comment : '' },
      { category: 'Content Relevance', message: typeof rs?.CONTENT?.comment === 'string' ? rs.CONTENT.comment : '' },
      { category: 'Overall Rubric Score', message: typeof rs?.MECHANICS?.comment === 'string' ? rs.MECHANICS.comment : '' }
    ];



    const levels = [

      { title: 'Excellent', maxPoints: 10 },

      { title: 'Good', maxPoints: 8 },

      { title: 'Fair', maxPoints: 6 },

      { title: 'Needs Improvement', maxPoints: 4 }

    ];



    const criteria = criteriaSeed.map((x: any) => {

      const cat = typeof x?.category === 'string' ? x.category : 'Criteria';

      const msg = typeof x?.message === 'string' ? x.message : '';

      return {

        title: cat,

        cells: levels.map((_, i) => (i === 0 ? msg : ''))

      };

    });



    return {

      title: `Rubric: ${this.submissionTitle}`,

      levels,

      criteria

    };

  }



  get rubricDesigner(): RubricDesigner | null {

    const fb = this.feedback;

    if (!fb) return null;



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



    const d: any = (fb as any)?.rubricDesigner;

    if (!d || typeof d !== 'object') {

      return this.buildFallbackRubricDesignerFromFeedback(fb);

    }



    const levelsRaw = Array.isArray(d.levels) ? d.levels : [];

    const criteriaRaw = Array.isArray(d.criteria) ? d.criteria : [];



    const levels = levelsRaw

      .slice(0, 5)

      .map((l: any) => ({ title: String(l?.title || ''), maxPoints: Number(l?.maxPoints) || 0 }))

      .filter((l: { title: string; maxPoints: number }) => l.title.trim().length || l.maxPoints > 0);



    const criteria = criteriaRaw

      .slice(0, 12)

      .map((c: any) => ({

        title: normalizeCriteriaTitle(c?.title),

        cells: levels.map((_lvl: { title: string; maxPoints: number }, i: number) => String(Array.isArray(c?.cells) ? (c.cells[i] || '') : ''))

      }))

      .filter((c: { title: string; cells: string[] }) => c.title.trim().length || c.cells.some((x: string) => String(x).trim().length));



    if (!levels.length || !criteria.length) {

      return this.buildFallbackRubricDesignerFromFeedback(fb);

    }



    return {

      title: typeof d.title === 'string' ? d.title : `Rubric: ${this.submissionTitle}`,

      levels,

      criteria

    };

  }



  get rubricDesignerTitle(): string {

    return this.rubricDesigner?.title || `Rubric: ${this.submissionTitle}`;

  }



  get rubricCriteriaPreview(): Array<{ title: string; maxPoints: number }> {
    const d = this.rubricDesigner;

    if (!d) return [];

    const normalizeKey = (value: any): string => {
      return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/&/g, 'AND')
        .replace(/[^A-Z0-9\s_]/g, ' ')
        .replace(/\s+/g, '_')
        .trim();
    };



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

    const feedbackCategoryKeys = new Set<string>(
      (this.feedbacks || []).map((x: any) => normalizeKey(x?.category))
    );



    const levels = Array.isArray((d as any).levels) ? (d as any).levels : [];

    const perRowMax = levels.reduce((acc: number, x: any) => acc + (Number(x?.maxPoints) || 0), 0);



    const criteria = Array.isArray((d as any).criteria) ? (d as any).criteria : [];

    const seen = new Set<string>();
    const out = criteria
      .map((r: any) => ({ title: normalizeCriteriaTitle(r?.title), maxPoints: perRowMax }))
      .filter((r: { title: string; maxPoints: number }) => r.title.length > 0)
      .filter((r: { title: string; maxPoints: number }) => {
        const k = normalizeKey(r.title);
        if (!k) return false;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    if (!out.length) return [];

    const previewKeys = new Set<string>(out.map((x: { title: string; maxPoints: number }) => normalizeKey(x.title)));

    let isRedundant = previewKeys.size > 0;
    if (isRedundant) {
      for (const k of Array.from(previewKeys.values()) as string[]) {
        if (!feedbackCategoryKeys.has(k)) {
          isRedundant = false;
          break;
        }
      }
    }

    return isRedundant ? [] : out;

  }



  get gradeLabel(): string {

    const score = this.effectiveOverallScore100;

    return formatGradingDisplay(score, this.classGradingScale).badgeText;

  }



  get contentIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.CONTENT ?? this.feedback?.correctionStats?.content);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get grammarIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.GRAMMAR ?? this.feedback?.correctionStats?.grammar);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get organizationIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.ORGANIZATION ?? this.feedback?.correctionStats?.organization);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get vocabularyIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.VOCABULARY ?? this.feedback?.correctionStats?.vocabulary);

    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

  }



  get mechanicsIssuesCount(): number {

    const n = Number(this.legendAligned?.counts?.MECHANICS ?? this.feedback?.correctionStats?.mechanics);

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

    const score100 = this.effectiveOverallScore100;

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

    const arr = Array.isArray(this.feedback?.detailedFeedback?.actionSteps) ? this.feedback?.detailedFeedback?.actionSteps : [];

    const top = arr.filter((x) => typeof x === 'string' && x.trim().length).slice(0, 5);

    return top.length ? top : [''];

  }



  get areasForImprovement(): Array<{ title: string; description: string; borderClass: string }> {

    const computed = Array.isArray(this.legendAligned?.areasForImprovement) ? this.legendAligned!.areasForImprovement : [];

    const arr = computed.length

      ? computed

      : (Array.isArray(this.feedback?.detailedFeedback?.areasForImprovement)

          ? this.feedback?.detailedFeedback?.areasForImprovement

          : []);

    const top = arr.filter((x) => typeof x === 'string' && x.trim().length).slice(0, 3);

    return top.map((t) => ({ title: t, description: '', borderClass: 'border-blue-400' }));

  }



  get strengths(): Array<{ title: string; description: string }> {

    const computed = Array.isArray(this.legendAligned?.strengths) ? this.legendAligned!.strengths : [];

    const arr = computed.length

      ? computed

      : (Array.isArray(this.feedback?.detailedFeedback?.strengths) ? this.feedback?.detailedFeedback?.strengths : []);

    const top = arr.filter((x) => typeof x === 'string' && x.trim().length).slice(0, 3);

    return top.map((t) => ({ title: t, description: '' }));

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



    // Mark the current text as the latest attempted text so we don't re-trigger

    // the same request repeatedly when an error occurs.



    this.lastWritingCorrectionsText = text;







    try {



      await this.ensureWritingCorrectionsLegendLoaded();



      const resp = await this.writingCorrectionsApi.check({ text, language: 'en-US' });



      const rawIssues = Array.isArray(resp?.issues) ? resp.issues : [];

      this.writingCorrectionsIssues = applyLegendToIssues(rawIssues, this.writingCorrectionsLegend);



      this.recomputeLegendAligned();



      const html = buildWritingCorrectionsHtml(text, this.writingCorrectionsIssues);



      this.writingCorrectionsHtml = this.sanitizer.bypassSecurityTrustHtml(html);



      this.lastWritingCorrectionsText = text;



    } catch (err: any) {



      this.writingCorrectionsIssues = [];



      this.writingCorrectionsHtml = null;



      this.writingCorrectionsError = err?.error?.message || err?.message || 'Failed to check writing corrections';



      // Keep lastWritingCorrectionsText set to avoid repeated retries for the same text.



    } finally {



      this.isWritingCorrectionsLoading = false;



    }



  }







  private rebuildOcrWords() {



    const rawWords = this.submission && (this.submission as any).ocrData && Array.isArray((this.submission as any).ocrData.words)



      ? (this.submission as any).ocrData.words



      : [];







    const counters = new Map<number, number>();



    const seenIds = new Set<string>();







    this.ocrWords = rawWords



      .map((w: any) => {



        const text = typeof w?.text === "string" ? w.text.trim() : '';



        if (!text) return null;







        const pageNum = typeof w?.page === 'number' ? w.page : Number(w?.page);



        const page = Number.isFinite(pageNum) ? pageNum : 1;







        const nextCount = (counters.get(page) || 0) + 1;



        counters.set(page, nextCount);



        const rawId = (w as any)?.id;



        const baseId = (typeof rawId === 'string' && rawId.trim())



          ? rawId.trim()



          : (typeof rawId === 'number' && Number.isFinite(rawId))



            ? String(rawId)



            : `word_${page}_${nextCount}`;



        let id = baseId;



        if (seenIds.has(id)) {



          // Ensure uniqueness if backend has duplicate IDs or we generated a duplicate.



          let suffix = 2;



          while (seenIds.has(`${baseId}_${suffix}`)) suffix += 1;



          id = `${baseId}_${suffix}`;



        }



        seenIds.add(id);







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

      const apiBaseUrl = `${environment.apiUrl}/api`;

      const resp = await firstValueFrom(this.http.post<any>(`${apiBaseUrl}/submissions/${submissionId}/ocr-corrections`, {}));



      const success = Boolean(resp && (resp as any).success);

      const data = resp && typeof resp === 'object' ? (resp as any).data : null;



      if (success && data) {

        const corrections: any[] = Array.isArray((data as any).corrections) ? (data as any).corrections : [];

        const ocrPages: any[] = Array.isArray((data as any).ocr) ? (data as any).ocr : [];



        const knownWordIds = new Set<string>();



        for (const page of Array.isArray(ocrPages) ? ocrPages : []) {



          const words = page && Array.isArray((page as any).words) ? (page as any).words : [];



          for (const w of words) {



            const id = (w as any)?.id;



            if (typeof id === 'string' && id.trim()) knownWordIds.add(id.trim());



            if (typeof id === 'number' && Number.isFinite(id)) knownWordIds.add(String(id));



          }



        }



        // Fallback: when backend doesn't return OCR pages, validate against locally rebuilt OCR words.



        if (!knownWordIds.size) {



          for (const w of Array.isArray(this.ocrWords) ? this.ocrWords : []) {



            if (w && typeof w.id === 'string' && w.id.trim()) knownWordIds.add(w.id.trim());



          }



        }



        const seenCorrectionIds = new Set<string>();



        this.annotations = corrections



          .map((c: any) => {



            const correctionId = c && (typeof c.id === 'string' || typeof c.id === 'number') ? String(c.id) : '';



            if (!correctionId) return null;



            if (seenCorrectionIds.has(correctionId)) return null;



            seenCorrectionIds.add(correctionId);



            const rawWordIds = Array.isArray(c?.wordIds) ? c.wordIds : [];



            const wordIds = rawWordIds



              .map((x: any) => (typeof x === 'string' && x.trim() ? x.trim() : (typeof x === 'number' && Number.isFinite(x) ? String(x) : '')))



              .filter((id: string) => Boolean(id) && knownWordIds.has(id));



            const bboxList = Array.isArray(c?.bboxList) ? c.bboxList : [];



            // Only include annotations that can be mapped to known wordIds or have bounding boxes.



            if (!wordIds.length && !bboxList.length) return null;



            return {



              _id: correctionId,



              submissionId,



              page: c?.page,



              wordIds,



              bboxList,



              group: typeof c?.category === 'string' ? c.category : (typeof c?.group === 'string' ? c.group : ''),



              symbol: c?.symbol,



              color: c?.color || '#FF0000',



              message: c?.message,



              suggestedText: c?.suggestedText,



              startChar: c?.startChar,



              endChar: c?.endChar,



              source: 'AI' as const,



              editable: Boolean(c?.editable)



            } satisfies FeedbackAnnotation;



          })



          .filter(Boolean) as FeedbackAnnotation[];



        this.recomputeLegendAligned();

      } else {



        this.annotations = [];



        this.recomputeLegendAligned();



      }

    } catch (err) {

      this.annotations = [];



      this.recomputeLegendAligned();



      this.alert.showWarning('OCR corrections unavailable', 'Word highlights may be limited.');



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



      const ua = navigator.userAgent || '';

      const isIos = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

      if (isIos) {

        window.open(objectUrl, '_blank', 'noopener,noreferrer');

      }



      // Revoke after download starts to prevent long-lived object URLs.



      setTimeout(() => {



        try {



          URL.revokeObjectURL(objectUrl);



        } catch {



          // ignore



        } finally {



          this.removeObjectUrl(objectUrl);



        }



      }, 60000);

    } catch (err: any) {

      this.alert.showError('Failed to generate PDF', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isPdfDownloading = false;

    }



  }







  feedbackForm: FormGroup;







  get feedbacks(): RubricFeedbackItem[] {

    const fb = this.feedback;

    if (!fb) return [];

    console.log('Dynamic AI rubric generated for submission', (this.submission as any)?._id);

    return rubricScoresToFeedbackItems((fb as any).rubricScores);

  }



  scrollToAiFeedback() {

    const el = document.getElementById('ai-feedback-section-mobile') || document.getElementById('ai-feedback-section');

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



    this.destroyed = true;



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

      this.classGradingScale = 'score_0_100';

      this.hasLoadedClassSettings = false;



      return;



    }







    try {



      const summary = await this.classApi.getClassSummary(classId);



      this.classTitle = summary?.name || '';

      const rawScale = typeof summary?.gradingScale === 'string' ? summary.gradingScale : undefined;
      this.classGradingScale = (rawScale === 'score_0_100' || rawScale === 'grade_a_f' || rawScale === 'pass_fail')
        ? rawScale
        : 'score_0_100';

      this.hasLoadedClassSettings = true;



    } catch {



      this.classTitle = '';

      this.classGradingScale = 'score_0_100';



    }



  }







  private async load() {



    const assignmentId = this.assignmentId;



    if (!assignmentId) return;



    if (this.isLoading) return;



    this.isLoading = true;



    this.loadSeq += 1;



    const seq = this.loadSeq;







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

      if (this.destroyed || seq !== this.loadSeq) return;

      this.submission = submission;

      await this.ensureClassSettingsLoadedFromSubmission(submission);

      this.revokeObjectUrls();



      await this.setUploadedFileUrl(submission?.fileUrl || null);







      this.rebuildOcrWords();



      if (submission?._id && !this.hasLoadedOcrCorrections) {

        await this.loadOcrCorrections(submission._id);

        this.hasLoadedOcrCorrections = true;

      }







      this.ocrErrorMessage = null;



      if (submission?.ocrStatus === 'failed') {



        this.ocrErrorMessage = submission.ocrError || 'OCR failed';



      }







      this.syncOcrPolling();







      // Student feedback is fetched by submissionId; do not require the submission payload

      // to contain a populated `feedback` reference (it is often absent in student endpoints).

      if (submission?._id) {

        try {

          const fb = await this.feedbackApi.getSubmissionFeedback(submission._id);



          if (this.destroyed || seq !== this.loadSeq) return;



          this.feedback = fb;

          console.log('STUDENT FEEDBACK LOADED:', fb);

          this.teacherComment = typeof fb?.aiFeedback?.overallComments === 'string' ? fb.aiFeedback.overallComments : null;



          this.feedbackForm.patchValue({

            message: this.teacherComment || ''

          });

        } catch (err: any) {

          // Keep the page working even when feedback isn't generated yet.

          if (this.destroyed || seq !== this.loadSeq) return;

          this.feedback = this.buildEmptyFeedback(submission._id);

          this.teacherComment = null;

          this.feedbackForm.patchValue({ message: '' });

        }

      }







      if (this.destroyed || seq !== this.loadSeq) return;



      this.rebuildHighlightedTranscript();

      await this.refreshWritingCorrections();

    } catch (err: any) {

      console.error('Failed to load OCR corrections:', err?.error || err);

      throw err;

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



  private scheduleNextOcrRefresh(delayMs: number) {
    if (!this.isOcrPolling || this.destroyed) return;

    if (this.ocrPollTimeoutId) {
      clearTimeout(this.ocrPollTimeoutId);
      this.ocrPollTimeoutId = null;
    }

    this.ocrPollTimeoutId = setTimeout(() => {
      if (this.destroyed) return;
      this.refreshSubmissionForOcr();
    }, delayMs);
  }



  private async refreshSubmissionForOcr() {
    const assignmentId = this.assignmentId;
    if (!assignmentId) {
      this.stopOcrPolling();
      return;
    }

    if (!this.isOcrPolling || this.destroyed) return;

    if (this.isOcrRefreshing) {
      this.scheduleNextOcrRefresh(2500);
      return;
    }

    this.isOcrRefreshing = true;

    try {
      const updated = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId);
      if (this.destroyed) return;

      this.submission = updated;
      await this.setUploadedFileUrl(updated?.fileUrl || this.rawUploadedFileUrl);
      this.rebuildOcrWords();

      if (updated?._id && !this.hasLoadedOcrCorrections) {
        await this.loadOcrCorrections(updated._id);
        this.hasLoadedOcrCorrections = true;
      }

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



