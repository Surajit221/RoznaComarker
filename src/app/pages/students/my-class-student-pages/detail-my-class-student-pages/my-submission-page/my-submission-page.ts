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
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { TokenizedTranscript } from '../../../../../components/submission-details/tokenized-transcript/tokenized-transcript';
import { CorrectionOverlay, type MediaLoadState } from '../../../../../components/correction-overlay/correction-overlay';
import { WritingCorrectionsLegendComponent } from '../../../../../components/writing-corrections-legend/writing-corrections-legend';
import { CanonicalDetailedFeedbackComponent } from '../../../../../components/canonical-detailed-feedback/canonical-detailed-feedback';
import { WritingCorrectionsApiService, type WritingCorrectionIssue } from '../../../../../api/writing-corrections-api.service';
import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';
import type { OcrWord } from '../../../../../models/ocr-token.model';
import type { CorrectionLegend } from '../../../../../models/correction-legend.model';
import { buildWritingCorrectionsHtml } from '../../../../../utils/writing-corrections-highlight.util';
import { applyLegendToAnnotations, applyLegendToIssues } from '../../../../../utils/correction-legend-mapping.util';
import { rubricScoresToFeedbackItems, type RubricFeedbackItem } from '../../../../../utils/dynamic-ai-feedback.util';
import { buildLegendAlignedFeedback, type LegendAlignedFeedback } from '../../../../../utils/legend-aligned-feedback.util';
import { triggerBlobDownload } from '../../../../../utils/file-download.util';
import { formatGradingDisplay, type GradingScale } from '../../../../../utils/grading-display.util';
import { DEFAULT_CORRECTION_LEGEND } from '../../../../../constants/correction-legend.default';
import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';
import { environment } from '../../../../../../environments/environment';
import type { RubricDesigner, SubmissionFeedback, RubricItem } from '../../../../../models/submission-feedback.model';
import { normalizeToHttps } from '../../../../../utils/url-normalizer.util';
import { AdaptiveWritingStudio } from '../../../../../components/student/adaptive-writing-studio/adaptive-writing-studio';
import type { AdaptiveSkillScore } from '../../../../../components/student/adaptive-writing-studio/adaptive-writing-studio.types';
import { applySubmissionLifecycleFallback, categoryDisplay, normalizeCanonicalResult, type CanonicalResultViewState } from '../../../../../utils/canonical-result-state.util';
import { buildDetailedFeedbackDisplayModel } from '../../../../../utils/detailed-feedback-display.util';
import { CanonicalSubmissionResultCoordinator, type ResultRefreshSnapshot } from '../../../../../services/canonical-submission-result-coordinator.service';
import { buildTranscriptPageViews, type TranscriptPageView } from '../../../../../utils/transcript-page-views.util';

type SectionLoadState = 'idle' | 'loading' | 'processing' | 'partial' | 'loaded' | 'empty' | 'stale' | 'error';

@Component({
  selector: 'app-my-submission-page',
  imports: [CommonModule, ReactiveFormsModule, AppBarBackButton, TokenizedTranscript, CorrectionOverlay, WritingCorrectionsLegendComponent, CanonicalDetailedFeedbackComponent, ModalDialog, AdaptiveWritingStudio],
  templateUrl: './my-submission-page.html',
  styleUrl: './my-submission-page.css',
})
export class MySubmissionPage {
  canonicalResultState: CanonicalResultViewState | null = null;
  get canonicalDetailedFeedback() { return this.canonicalResultState?.detailedFeedback || null; }
  get detailedFeedbackDisplay() { return buildDetailedFeedbackDisplayModel(this.canonicalResultState, this.feedback); }
  adaptiveSkillScores: readonly AdaptiveSkillScore[] = this.buildAdaptiveSkillScores(null);
  isUploadedFile = true;
  device = inject(DeviceService);
  activeTab = 'uploaded-file';

  private route = inject(ActivatedRoute);
  private submissionApi = inject(SubmissionApiService);
  private assignmentApi = inject(AssignmentApiService);
  private feedbackApi = inject(FeedbackApiService);
  private pdfApi = inject(PdfApiService);
  private alert = inject(AlertService);
  private classApi = inject(ClassApiService);
  private sanitizer = inject(DomSanitizer);
  private http = inject(HttpClient);
  private writingCorrectionsApi = inject(WritingCorrectionsApiService);
  private resultCoordinator = inject(CanonicalSubmissionResultCoordinator);

  assignmentId: string | null = null;
  assignmentUnavailable = false;
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

  private buildRubricDesignerFromAssignment(): RubricDesigner | null {
    const a: any = this.assignment;
    if (!a) return null;

    const fromRubrics = this.parseRubricDesignerFromRubricsField(a?.rubrics, a?.title);
    if (fromRubrics) return fromRubrics;

    return this.parseLegacyRubricDesigner(a?.rubric, a?.title);
  }

  private parseRubricDesignerFromRubricsField(value: any, assignmentTitle: any): RubricDesigner | null {
    const obj = value && typeof value === 'object' ? value : null;
    const criteriaRaw = Array.isArray(obj?.criteria) ? obj.criteria : null;
    if (!criteriaRaw) return null;

    const first = criteriaRaw[0] && typeof criteriaRaw[0] === 'object' ? criteriaRaw[0] : null;
    const levelsRaw = Array.isArray((first as any)?.levels) ? (first as any).levels : [];
    if (!levelsRaw.length) return null;

    const levels = levelsRaw.map((l: any) => ({
      title: typeof l?.title === 'string' ? String(l.title) : '',
      maxPoints: Number(l?.score) || 0
    }));

    const criteria = criteriaRaw.map((c: any) => {
      const rowLevels = Array.isArray(c?.levels) ? c.levels : [];
      return {
        title: typeof c?.name === 'string' ? String(c.name) : '',
        cells: levels.map((_lvl: any, i: number) => String(rowLevels[i]?.description ?? ''))
      };
    });

    const at = typeof assignmentTitle === 'string' ? assignmentTitle : '';
    return {
      title: at.trim().length ? `Rubric: ${at}` : `Rubric: ${this.submissionTitle}`,
      levels,
      criteria
    };
  }

  private parseLegacyRubricDesigner(value: any, assignmentTitle: any): RubricDesigner | null {
    if (!value) return null;
    const obj = typeof value === 'string' ? this.safeJsonParse(value) : value;
    if (!obj || typeof obj !== 'object') return null;

    const at = typeof assignmentTitle === 'string' ? assignmentTitle : '';
    const title = typeof (obj as any).title === 'string'
      ? String((obj as any).title)
      : (at.trim().length ? `Rubric: ${at}` : `Rubric: ${this.submissionTitle}`);
    const levels = Array.isArray((obj as any).levels) ? (obj as any).levels : null;
    const criteria = Array.isArray((obj as any).criteria) ? (obj as any).criteria : null;
    if (!levels || !criteria) return null;

    return {
      title,
      levels: levels.map((l: any) => ({
        title: typeof l?.title === 'string' ? String(l.title) : '',
        maxPoints: Number(l?.maxPoints) || 0
      })),
      criteria: criteria.map((c: any) => ({
        title: typeof c?.title === 'string' ? String(c.title) : '',
        cells: Array.isArray(c?.cells) ? c.cells.map((x: any) => String(x ?? '')) : []
      }))
    };
  }

  private safeJsonParse(value: string): any {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw.length) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private readonly defaultCorrectionLegend: any = DEFAULT_CORRECTION_LEGEND;

  private normalizeLegendKey(value: any): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  toRgba(color: string | null | undefined, alpha: number): string {
    const c = typeof color === 'string' ? color.trim() : '';
    const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 0.18;
    if (!c.startsWith('#')) {
      return `rgba(255, 193, 7, ${a})`;
    }
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    if (full.length !== 6) {
      return `rgba(255, 193, 7, ${a})`;
    }
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (![r, g, b].every((v) => Number.isFinite(v))) {
      return `rgba(255, 193, 7, ${a})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  private parseHexColor(color: string | null | undefined): { r: number; g: number; b: number } | null {
    const c = typeof color === 'string' ? color.trim() : '';
    if (!c.startsWith('#')) return null;
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    if (full.length !== 6) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (![r, g, b].every((v) => Number.isFinite(v))) return null;
    return { r, g, b };
  }

  private relativeLuminance(color: string | null | undefined): number {
    const rgb = this.parseHexColor(color);
    if (!rgb) return 0.5;
    const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
    const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  badgeTextColor(color: string | null | undefined): string {
    const lum = this.relativeLuminance(color);
    if (lum >= 0.72) return '#374151';
    const c = typeof color === 'string' && color.trim() ? color.trim() : '#374151';
    return c;
  }

  badgeBorderColor(color: string | null | undefined): string {
    const lum = this.relativeLuminance(color);
    if (lum >= 0.72) return 'rgba(55, 65, 81, 0.35)';
    const c = typeof color === 'string' && color.trim() ? color.trim() : '#374151';
    return c;
  }

  private isAcademicLegend(legend: any): boolean {
    const groups = legend && Array.isArray(legend.groups) ? legend.groups : [];
    if (!groups.length) return false;
    const keys = new Set(groups.map((g: any) => this.normalizeLegendKey(g?.key)).filter((k: string) => k.length));
    return (
      keys.has('CONTENT') ||
      keys.has('ORGANIZATION') ||
      keys.has('GRAMMAR') ||
      keys.has('VOCABULARY') ||
      keys.has('MECHANICS')
    );
  }

  private getAcademicLegendForColors(): CorrectionLegend {
    return this.isAcademicLegend(this.writingCorrectionsLegend)
      ? (this.writingCorrectionsLegend as CorrectionLegend)
      : DEFAULT_CORRECTION_LEGEND;
  }

  get correctionLegendItems(): Array<{ symbol: string; label: string; color: string }> {
    const legend: any = this.defaultCorrectionLegend;
    const groups = legend && Array.isArray(legend.groups) ? legend.groups : [];
    const items: Array<{ symbol: string; label: string; color: string }> = [];
    const seen = new Set<string>();

    for (const g of groups) {
      if (!g) continue;
      const color = typeof g.color === 'string' && g.color.trim() ? g.color.trim() : '#FFC107';
      const symbols = Array.isArray(g.symbols) ? g.symbols : [];
      for (const s of symbols) {
        const sym = this.normalizeLegendKey(s && (s as any).symbol);
        if (!sym || seen.has(sym)) continue;
        items.push({
          symbol: sym,
          label: String((s as any)?.label || sym),
          color
        });
        seen.add(sym);
      }
    }

    for (const issue of Array.isArray(this.writingCorrectionsIssues) ? this.writingCorrectionsIssues : []) {
      const sym = this.normalizeLegendKey((issue as any)?.symbol);
      if (!sym || seen.has(sym)) continue;
      const color = typeof (issue as any)?.color === 'string' && String((issue as any).color).trim() ? String((issue as any).color).trim() : '#FFC107';
      const label = String((issue as any)?.symbolLabel || sym);
      items.push({ symbol: sym, label, color });
      seen.add(sym);
    }

    for (const ann of Array.isArray(this.annotations) ? this.annotations : []) {
      const sym = this.normalizeLegendKey((ann as any)?.symbol);
      if (!sym || seen.has(sym)) continue;
      const color = typeof (ann as any)?.color === 'string' && String((ann as any).color).trim() ? String((ann as any).color).trim() : '#FFC107';
      items.push({ symbol: sym, label: sym, color });
      seen.add(sym);
    }

    return items;
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
  submissionState: SectionLoadState = 'idle';
  transcriptState: SectionLoadState = 'idle';
  correctionsState: SectionLoadState = 'idle';
  statisticsState: SectionLoadState = 'idle';
  feedbackState: SectionLoadState = 'idle';
  aiFeedbackState: SectionLoadState = 'idle';
  scoreState: SectionLoadState = 'idle';
  pdfMediaState: MediaLoadState = 'idle';
  readonly skeletonRows = [0, 1, 2, 3, 4];
  readonly feedbackSkeletonRows = [0, 1];
  isPdfDownloading = false;
  submission: BackendSubmission | null = null;
  feedback: SubmissionFeedback | null = null;
  assignment: BackendAssignment | null = null;

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
  private ocrPollAttempts = 0;
  private destroyed = false;
  private refreshParamSub: Subscription | null = null;
  private lastRefreshToken: string | null = null;
  private loadSeq = 0;
  private hasLoadedOcrCorrections = false;
  private loadOcrCorrectionsSeq = 0;
  private loadTranscriptPagesSeq = 0;
  private transcriptPagesSignature: string | null = null;
  private setUploadedFileUrlSeq = 0;

  uploadedFileUrl: string | null = null;
  private rawUploadedFileUrl: string | null = null;
  submissionFileUrls: string[] = [];
  submissionFileIds: string[] = [];
  activeFileIndex = 0;
  private uploadedFileIsPdf = false;
  private objectUrls: string[] = [];

  private resetSectionStates(): void {
    this.submissionState = 'loading';
    this.transcriptState = 'loading';
    this.correctionsState = 'loading';
    this.statisticsState = 'loading';
    this.feedbackState = 'loading';
    this.aiFeedbackState = 'loading';
    this.scoreState = 'loading';
  }

  private normalizeUploadsUrl(url: string): string {
    const raw = normalizeToHttps(url);
    if (!raw) return '';

    const cacheBustToken = this.lastRefreshToken;
    const appendCacheBust = (input: string): string => {
      const token = cacheBustToken ? String(cacheBustToken).trim() : '';
      if (!token) return input;

      const parts = input.split('#');
      const baseWithQuery = parts[0];
      const hash = parts.length > 1 ? `#${parts.slice(1).join('#')}` : '';

      if (baseWithQuery.toLowerCase().includes('_cb=')) return `${baseWithQuery}${hash}`;

      const sep = baseWithQuery.includes('?') ? '&' : '?';
      return `${baseWithQuery}${sep}_cb=${encodeURIComponent(token)}${hash}`;
    };

    if (/^https?:\/\//i.test(raw)) {
      return raw.includes('/uploads/submissions/') ? appendCacheBust(raw) : raw;
    }

    if (raw.startsWith('/')) {
      const abs = `${String(environment.apiUrl || '').replace(/\/+$/, '')}${raw}`;
      return raw.startsWith('/uploads/submissions/') ? appendCacheBust(abs) : abs;
    }

    return raw;
  }

  get hasMultipleImages(): boolean {
    const urls = Array.isArray(this.submissionFileUrls) ? this.submissionFileUrls : [];
    return urls.filter((u: string) => typeof u === 'string' && u.trim().length).length > 1;
  }

  get activeFileId(): string | null {
    const ids = Array.isArray(this.submissionFileIds) ? this.submissionFileIds : [];
    const id = ids[this.activeFileIndex];
    return typeof id === 'string' && id.trim().length ? id.trim() : null;
  }

  get activeFileUrlRaw(): string | null {
    const urls = Array.isArray(this.submissionFileUrls) ? this.submissionFileUrls : [];
    const url = urls[this.activeFileIndex];
    return typeof url === 'string' && url.trim().length ? url.trim() : null;
  }

  onSelectSubmissionImage(index: number) {
    const i = Number(index);
    if (!Number.isFinite(i)) return;
    const urls = Array.isArray(this.submissionFileUrls) ? this.submissionFileUrls : [];
    if (i < 0 || i >= urls.length) return;
    if (this.activeFileIndex === i) return;
    this.activeFileIndex = i;

    void this.setUploadedFileUrl(this.activeFileUrlRaw);

    this.annotations = [];
    this.recomputeLegendAligned();
    this.rebuildOcrWords();

    const submissionId = this.submission?._id;
    if (submissionId) {
      void this.loadOcrCorrections(submissionId);
    }

    this.rebuildHighlightedTranscript();
    void this.refreshWritingCorrections();
  }

  get activeOcrPages(): Array<{ fileId?: string; pageNumber?: number; text?: string; words?: any }> {
    const pages = Array.isArray(this.submission?.ocrPages) ? this.submission!.ocrPages : [];
    if (!pages.length) return [];

    const activeId = this.activeFileId;
    if (!activeId) return pages;

    const filtered = pages.filter((p: any) => {
      const fid = p && p.fileId ? String(p.fileId) : '';
      return fid && fid === activeId;
    });

    return filtered.length ? filtered : pages;
  }

  private removeObjectUrl(url: string) {
    const idx = this.objectUrls.indexOf(url);
    if (idx >= 0) {
      this.objectUrls.splice(idx, 1);
    }
  }

  private buildEmptyFeedback(submissionId: string): SubmissionFeedback {
    return {
      submissionId,
      assessmentVersion: 'writing-rubric-100-v1',
      maxOverallScore: 100,
      rubricScores: {
  CONTENT: {
    score: 0,
    maxScore: 20,
    comment: ''
  },
  ORGANIZATION: {
    score: 0,
    maxScore: 20,
    comment: ''
  },
  GRAMMAR: {
    score: 0,
    maxScore: 25,
    comment: ''
  },
  VOCABULARY: {
    score: 0,
    maxScore: 20,
    comment: ''
  },
  MECHANICS: {
    score: 0,
    maxScore: 10,
    comment: ''
  },
  PRESENTATION: {
    score: 0,
    maxScore: 5,
    comment: ''
  }
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
  writingCorrectionsLegend: CorrectionLegend | null = DEFAULT_CORRECTION_LEGEND;
  writingCorrectionsIssues: WritingCorrectionIssue[] = [];
  writingCorrectionsHtml: SafeHtml | null = null;
  writingCorrectionsError: string | null = null;
  isWritingCorrectionsLoading = false;
  private lastWritingCorrectionsText: string | null = null;
  private legendAligned: LegendAlignedFeedback | null = null;

  ocrWords: OcrWord[] = [];
  annotations: FeedbackAnnotation[] = [];
  transcriptPageViews: TranscriptPageView[] = [];

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

  private get effectiveOverallScore100(): number | null {
    return this.canonicalResultState?.score ?? null;
  }

  get overallScoreText(): string {
    const score = this.effectiveOverallScore100;
    if (score === null) return this.canonicalResultState?.scoreMessage || 'Score pending';
    return formatGradingDisplay(score, this.classGradingScale).displayText;
  }

  private buildFallbackRubricDesignerFromFeedback(fb: SubmissionFeedback): RubricDesigner | null {
    const criteriaSeed = [
      { category: '' },
      { category: '' },
      { category: '' },
      { category: '' }
    ];

    const levels = Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null as any }));

    const criteria = criteriaSeed.map((x: any) => {
      const cat = typeof x?.category === 'string' ? x.category : 'Criteria';
      return {
        title: cat,
        cells: levels.map(() => '')
      };
    });

    return {
      title: `Rubric: ${this.submissionTitle}`,
      levels,
      criteria
    };
  }

  // ─── FIXED rubricDesigner getter ────────────────────────────────────────────
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

    // ✅ Use feedback's own rubricDesigner only if it has REAL non-empty data.
    // An empty/fallback rubric has arrays present but all titles and cells are "".
    // We require at least one level with a non-empty title AND at least one
    // criteria row with a non-empty title or non-empty cell to treat it as real.
    const feedbackHasRubric = (() => {
      if (!d || typeof d !== 'object') return false;
      const lvls = Array.isArray(d.levels) ? d.levels : [];
      const crits = Array.isArray(d.criteria) ? d.criteria : [];
      if (!lvls.length || !crits.length) return false;
      const hasRealLevel = lvls.some((l: any) => String(l?.title || '').trim().length > 0);
      const hasRealCriteria = crits.some((c: any) => {
        const titleOk = String(c?.title || '').trim().length > 0;
        const cellsOk = Array.isArray(c?.cells) && c.cells.some((x: any) => String(x || '').trim().length > 0);
        return titleOk || cellsOk;
      });
      return hasRealLevel && hasRealCriteria;
    })();

    if (!feedbackHasRubric) {
      const fromAssignment = this.buildRubricDesignerFromAssignment();
      if (fromAssignment) return fromAssignment;
    }

    if (!d || typeof d !== 'object') {
      return this.buildFallbackRubricDesignerFromFeedback(fb);
    }

    const levelsRaw = Array.isArray(d.levels) ? d.levels : [];
    const criteriaRaw = Array.isArray(d.criteria) ? d.criteria : [];

    const isLegacyAutoSeededTemplate = (() => {
      const levelSig = levelsRaw.map((l: any) => ({ t: String(l?.title || '').trim(), p: Number(l?.maxPoints) }));
      const expectedLevels = [
        { t: 'Excellent', p: 10 },
        { t: 'Good', p: 8 },
        { t: 'Fair', p: 6 },
        { t: 'Needs Improvement', p: 4 }
      ];
      const sameLevels =
        levelSig.length === expectedLevels.length &&
        levelSig.every((x: any, i: number) => x.t === expectedLevels[i].t && x.p === expectedLevels[i].p);
      if (!sameLevels) return false;
      const normalize = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const critTitles = criteriaRaw.map((c: any) => normalize(c?.title));
      const expectedCrit = new Set([
        'grammar & mechanics',
        'structure & organization',
        'content relevance',
        'overall rubric score'
      ]);
      return critTitles.length && critTitles.every((t: string) => expectedCrit.has(t));
    })();

    if (isLegacyAutoSeededTemplate) {
      return this.buildFallbackRubricDesignerFromFeedback(fb);
    }

    const levels = levelsRaw
      .slice(0, 5)
      .map((l: any) => {
        const title = String(l?.title || '');
        const rawPoints = Number(l?.maxPoints);
        const maxPoints = Number.isFinite(rawPoints) ? rawPoints : 0;
        return { title, maxPoints: !title.trim().length && maxPoints === 0 ? null : maxPoints };
      })
      .filter((l: { title: string; maxPoints: number | null }) => l.title.trim().length || (Number(l.maxPoints) || 0) > 0);

    const criteria = criteriaRaw
      .slice(0, 12)
      .map((c: any) => ({
        title: normalizeCriteriaTitle(c?.title),
        cells: levels.map((_lvl: { title: string; maxPoints: number }, i: number) =>
          String(Array.isArray(c?.cells) ? (c.cells[i] || '') : '')
        )
      }))
      .filter((c: { title: string; cells: string[] }) =>
        c.title.trim().length || c.cells.some((x: string) => String(x).trim().length)
      );

    if (!levels.length || !criteria.length) {
      return this.buildFallbackRubricDesignerFromFeedback(fb);
    }

    return {
      title: typeof d.title === 'string' ? d.title : `Rubric: ${this.submissionTitle}`,
      levels,
      criteria
    };
  }
  // ────────────────────────────────────────────────────────────────────────────

  get rubricDesignerTitle(): string {
    return this.rubricDesigner?.title || `Rubric: ${this.submissionTitle}`;
  }

  get rubricCriteriaPreview(): Array<{ title: string; maxPoints: number }> {
    return [];
  }

  get gradeLabel(): string {
    const score = this.effectiveOverallScore100;
    if (score === null) return '—';
    return formatGradingDisplay(score, this.classGradingScale).badgeText;
  }
  get scoreSummaryText(): string { return this.canonicalResultState?.score === null || this.canonicalResultState?.score === undefined
    ? (this.canonicalResultState?.scoreMessage || 'Score pending') : 'Strong effort with some areas for refinement'; }

  get contentIssuesDisplay() { return categoryDisplay(this.canonicalResultState, 'content'); }
  get grammarIssuesDisplay() { return categoryDisplay(this.canonicalResultState, 'grammar'); }
  get organizationIssuesDisplay() { return categoryDisplay(this.canonicalResultState, 'organization'); }
  get vocabularyIssuesDisplay() { return categoryDisplay(this.canonicalResultState, 'vocabulary'); }
  get mechanicsIssuesDisplay() { return categoryDisplay(this.canonicalResultState, 'mechanics'); }
  get partialStatisticsMessage(): string | null {
    if (this.canonicalResultState?.statisticsCompleteness !== 'language_only') return null;
    return this.canonicalResultState.correctionStatus === 'partial'
      ? 'Semantic analysis could not be completed. Grammar and mechanics results are still available.'
      : this.canonicalResultState.semanticProgressMessage
        || 'Grammar and mechanics are available. Content, organization, and vocabulary are still being analyzed.';
  }

  get contentIssuesCount(): number {
    const n = Number(this.feedback?.correctionStatistics?.content ?? this.feedback?.correctionStats?.content ?? this.submission?.correctionStatistics?.content);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get grammarIssuesCount(): number {
    const n = Number(this.feedback?.correctionStatistics?.grammar ?? this.feedback?.correctionStats?.grammar ?? this.submission?.correctionStatistics?.grammar);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get organizationIssuesCount(): number {
    const n = Number(this.feedback?.correctionStatistics?.organization ?? this.feedback?.correctionStats?.organization ?? this.submission?.correctionStatistics?.organization);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get vocabularyIssuesCount(): number {
    const n = Number(this.feedback?.correctionStatistics?.vocabulary ?? this.feedback?.correctionStats?.vocabulary ?? this.submission?.correctionStatistics?.vocabulary);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  get mechanicsIssuesCount(): number {
    const n = Number(this.feedback?.correctionStatistics?.mechanics ?? this.feedback?.correctionStats?.mechanics ?? this.submission?.correctionStatistics?.mechanics);
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
    if (score100 === null || !Number.isFinite(score100)) return 0;
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
    const normalizedUrl = normalizeToHttps(url);
    if (!environment.production) {
      console.debug('[STUDENT FILE URL]', normalizedUrl);
    }
    const blob = await firstValueFrom(this.http.get(normalizedUrl, { responseType: 'blob' }));
    const objectUrl = URL.createObjectURL(blob);

    if (trackForCleanup) {
      this.objectUrls.push(objectUrl);
    } else {
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
    try { this.writingCorrectionsLegend = await this.writingCorrectionsApi.getLegend(); }
    catch { this.writingCorrectionsLegend = DEFAULT_CORRECTION_LEGEND; }
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
    } finally {
      this.isWritingCorrectionsLoading = false;
    }
  }

  private rebuildOcrWords() {
    const pages = this.activeOcrPages;
    const pageWords = pages
      .map((p: any) => (p && Array.isArray(p.words) ? p.words : []))
      .flat();

    const rawWords = pageWords.length
      ? pageWords
      : (this.submission && (this.submission as any).ocrData && Array.isArray((this.submission as any).ocrData.words)
        ? (this.submission as any).ocrData.words
        : []);

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
          bbox,
          separatorBefore: w?.separatorBefore === '\n\n' ? '\n\n' : w?.separatorBefore === '\n' ? '\n' : w?.separatorBefore === ' ' ? ' ' : ''
        } satisfies OcrWord;
      })
      .filter(Boolean) as OcrWord[];
  }

  private async loadOcrCorrections(submissionId: string) {
    const seq = ++this.loadOcrCorrectionsSeq;
    const requestedFileId = this.activeFileId;

    // Legend availability is independent from persisted OCR availability.
    try {
      await this.ensureWritingCorrectionsLegendLoaded();
    } catch (legendError) {
      console.error('[loadWritingCorrectionsLegend]', legendError);
    }

    try {
      const apiBaseUrl = `${environment.apiUrl}/api`;
      const body = requestedFileId ? { fileId: requestedFileId } : {};
      const resp = await firstValueFrom(this.http.post<any>(`${apiBaseUrl}/submissions/${submissionId}/ocr-corrections`, body));

      const success = Boolean(resp && (resp as any).success);
      const data = resp && typeof resp === 'object' ? (resp as any).data : null;

      if (seq !== this.loadOcrCorrectionsSeq) return;
      if (requestedFileId && requestedFileId !== this.activeFileId) return;

      if (data?.processing === true) {
        this.correctionsState = 'processing';
        this.statisticsState = 'processing';
        this.hasLoadedOcrCorrections = false;
        this.ocrErrorMessage = null;
        this.startOcrPolling();
        return true;
      }

      if (success && data) {
        this.canonicalResultState = normalizeCanonicalResult(data, this.canonicalResultState);
        const corrections: any[] = Array.isArray((data as any).corrections) ? (data as any).corrections : [];
        const statistics = (data as any).statistics;
        if (statistics && ['content','grammar','organization','vocabulary','mechanics','total'].every((key) => Number.isFinite(Number(statistics[key])))) {
          if (this.submission) (this.submission as any).correctionStatistics = { ...statistics };
          this.statisticsState = (data as any).correctionStatus === 'partial' || (data as any).correctionStatus === 'processing' ? 'partial' : 'loaded';
        } else this.statisticsState = corrections.length ? 'partial' : 'empty';
        this.correctionsState = (data as any).correctionStatus === 'partial' || (data as any).correctionStatus === 'processing' ? 'partial' : 'loaded';
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

        if (!knownWordIds.size) {
          for (const w of Array.isArray(this.ocrWords) ? this.ocrWords : []) {
            if (w && typeof w.id === 'string' && w.id.trim()) knownWordIds.add(w.id.trim());
          }
        }

        const seenCorrectionIds = new Set<string>();
        const nextAnnotations = corrections
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
            if (!wordIds.length && !bboxList.length) return null;

            return {
              _id: correctionId,
              submissionId,
              page: typeof c?.page === 'number' && Number.isFinite(c.page) ? c.page : 1,
              wordIds,
              bboxList,
              group: typeof c?.category === 'string' ? c.category : (typeof c?.group === 'string' ? c.group : ''),
              symbol: typeof c?.symbol === 'string' ? c.symbol : '',
              color: typeof c?.color === 'string' && c.color.trim() ? c.color.trim() : '#FF0000',
              message: typeof c?.message === 'string' ? c.message : '',
              suggestedText: typeof c?.suggestedText === 'string' ? c.suggestedText : '',
              startChar: typeof c?.startChar === 'number' ? c.startChar : undefined,
              endChar: typeof c?.endChar === 'number' ? c.endChar : undefined,
              source: c?.source === 'LANGUAGETOOL' ? 'LANGUAGETOOL' as const : 'AI' as const,
              editable: Boolean(c?.editable)
            } satisfies FeedbackAnnotation;
          })
          .filter(Boolean) as FeedbackAnnotation[];

        const academicLegend = this.getAcademicLegendForColors();
        this.annotations = applyLegendToAnnotations(nextAnnotations, academicLegend);
      }

      this.recomputeLegendAligned();
      return true;
    } catch (err) {
      if (seq !== this.loadOcrCorrectionsSeq || (requestedFileId && requestedFileId !== this.activeFileId)) return false;
      const failure: any = err;
      console.error('[loadOcrCorrections]', {
        submissionId,
        fileId: requestedFileId,
        status: failure?.status,
        response: failure?.error,
        message: failure?.message
      });
      // Keep the last known-good markers during a transient refresh failure.
      const status = Number(failure?.status);
      if ([202, 409, 429].includes(status)) { this.correctionsState = 'processing'; this.statisticsState = 'processing'; this.startOcrPolling(); return true; }
      this.ocrErrorMessage = failure?.error?.data?.ocrError || failure?.error?.message || failure?.message || 'OCR corrections are unavailable.';
      if (!this.submission?.correctionStatistics) this.statisticsState = 'error';
      return false;
    }
  }

  private resolveAssignmentIdFromSubmission(s: BackendSubmission | null): string | null {
    const raw: any = s?.assignment;
    const id = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw._id || raw.id : null;
    const normalized = typeof id === 'string' ? id.trim() : '';
    return /^[a-f\d]{24}$/i.test(normalized) ? normalized : null;
  }

  private async loadAssignmentMetadata(s: BackendSubmission | null, seq: number): Promise<void> {
    const persistedAssignmentId = this.resolveAssignmentIdFromSubmission(s);
    if (!persistedAssignmentId) return;
    this.assignmentId = persistedAssignmentId;
    try {
      const loadedAssignment = await this.assignmentApi.getAssignmentById(persistedAssignmentId);
      if (this.destroyed || seq !== this.loadSeq || this.resolveAssignmentIdFromSubmission(this.submission) !== persistedAssignmentId) return;
      this.assignment = loadedAssignment;
      this.assignmentUnavailable = false;
    } catch {
      if (this.destroyed || seq !== this.loadSeq || this.resolveAssignmentIdFromSubmission(this.submission) !== persistedAssignmentId) return;
      this.assignment = null;
      this.assignmentUnavailable = true;
    }
  }

  private async loadCompleteTranscript(submissionId: string): Promise<void> {
    const storedPages = Array.isArray(this.submission?.ocrPages) ? this.submission.ocrPages : [];
    const signature = JSON.stringify({ submissionId, ocrStatus: this.submission?.ocrStatus,
      correctionSourceHash: (this.submission as any)?.correctionSourceHash || null,
      pages: storedPages.map((page: any) => [String(page?.fileId || ''), Number(page?.pageNumber || 1),
        String(page?.status || page?.ocrStatus || ''), Array.isArray(page?.words) ? page.words.length : 0]) });
    if (signature === this.transcriptPagesSignature && this.transcriptPageViews.length) return;
    const seq = ++this.loadTranscriptPagesSeq;
    try {
      const apiBaseUrl = `${environment.apiUrl}/api`;
      const resp = await firstValueFrom(this.http.post<any>(`${apiBaseUrl}/submissions/${submissionId}/ocr-corrections`, {}));
      if (seq !== this.loadTranscriptPagesSeq || this.submission?._id !== submissionId) return;
      const data = resp?.data && typeof resp.data === 'object' ? resp.data : {};
      const pages = Array.isArray(data.ocr) && data.ocr.length ? data.ocr : (Array.isArray(this.submission?.ocrPages) ? this.submission.ocrPages : []);
      const corrections = Array.isArray(data.corrections) ? data.corrections : [];
      const legend = this.getAcademicLegendForColors();
      this.transcriptPageViews = buildTranscriptPageViews({ submissionId, fileIds: [...this.submissionFileIds], ocrPages: pages,
        corrections, overallOcrStatus: this.submission?.ocrStatus }).map((page) => ({ ...page,
        annotations: applyLegendToAnnotations(page.annotations, legend) }));
      this.transcriptPagesSignature = signature;
    } catch {
      if (seq !== this.loadTranscriptPagesSeq || this.submission?._id !== submissionId) return;
      this.transcriptPageViews = buildTranscriptPageViews({ submissionId, fileIds: [...this.submissionFileIds],
        ocrPages: Array.isArray(this.submission?.ocrPages) ? this.submission.ocrPages : [], corrections: [],
        overallOcrStatus: this.submission?.ocrStatus });
    }
  }

  private buildAdaptiveSkillScores(feedback: SubmissionFeedback | null): readonly AdaptiveSkillScore[] {
    const scores = feedback?.rubricScores;
    const points = (key: keyof SubmissionFeedback['rubricScores']): Pick<AdaptiveSkillScore, 'earnedPoints' | 'maximumPoints'> => {
      const item = scores?.[key];
      const earned = Number(item?.score);
      const maximum = Number(item?.maxScore);
      return {
        earnedPoints: item && Number.isFinite(earned) && earned >= 0 ? earned : null,
        maximumPoints: item && Number.isFinite(maximum) && maximum > 0 ? maximum : null
      };
    };

    return [
      { id: 'task', label: 'Task Achievement', ...points('CONTENT') },
      { id: 'coherence', label: 'Coherence & Flow', ...points('ORGANIZATION') },
      { id: 'lexical', label: 'Lexical Resource', ...points('VOCABULARY') },
      { id: 'grammar', label: 'Grammar', ...points('GRAMMAR') },
      { id: 'mechanics', label: 'Mechanics', ...points('MECHANICS') }
    ];
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
      triggerBlobDownload(blob, { filename: 'submission-feedback.pdf', mimeType: 'application/pdf' });
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

  getOcrTextForFileId(fileId: string): string {
    const pages = Array.isArray(this.submission?.ocrPages) ? this.submission!.ocrPages : [];
    const filePages = pages.filter((p: any) => p && p.fileId === fileId);

    if (filePages.length > 0) {
      return filePages
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .map((t: string) => t.trim())
        .filter((t: string) => t.length)
        .join('\n\n');
    }

    if (this.submissionFileIds.length === 1 && this.submissionFileIds[0] === fileId) {
      const combined = this.submission?.combinedOcrText && String(this.submission.combinedOcrText).trim()
        ? String(this.submission.combinedOcrText)
        : '';
      if (combined) return combined;

      const fromTranscript = this.submission?.transcriptText && String(this.submission.transcriptText).trim()
        ? String(this.submission.transcriptText)
        : '';
      if (fromTranscript) return fromTranscript;

      const fromOcr = this.submission?.ocrText && String(this.submission.ocrText).trim()
        ? String(this.submission.ocrText)
        : '';
      if (fromOcr) return fromOcr;
    }

    return '';
  }

  getAnnotationsForFileId(fileId: string): FeedbackAnnotation[] {
    return this.annotations.filter(a => (a as any).fileId === fileId || !(a as any).fileId);
  }

  get hasAnyTranscribedText(): boolean {
    return this.submissionFileIds.some((id) => {
      const text = this.getOcrTextForFileId(id);
      return text.length > 0;
    });
  }

  openRubricDialog() {
    // Do NOT call refreshAssignmentForRubric() here — it causes a race condition
    // where this.assignment updates async AFTER the dialog opens, triggering
    // buildRubricDesignerFromAssignment() to return data and override the
    // feedback's own rubricDesigner, resulting in empty cells on the student UI.
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
    this.refreshParamSub?.unsubscribe();
    this.refreshParamSub = null;
    this.stopOcrPolling();
    this.revokeObjectUrls();
  }

  get extractedText(): string | null {
    const s = this.submission;
    if (!s) return null;
    const allPages = Array.isArray(s.ocrPages) ? s.ocrPages : [];
    const pageText = allPages
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .map((t: string) => t.trim())
      .filter((t: string) => t.length)
      .join('\n\n');

    if (pageText) return pageText;

    const fromTranscript = s.transcriptText && String(s.transcriptText).trim() ? String(s.transcriptText) : '';
    if (fromTranscript && this.submissionFileIds.length <= 1) return fromTranscript;

    const fromOcr = s.ocrText && String(s.ocrText).trim() ? String(s.ocrText) : '';
    return fromOcr || null;
  }

  get ocrStatus(): BackendSubmission['ocrStatus'] | null {
    return this.submission?.ocrStatus || null;
  }

  get isOcrPending(): boolean {
    return this.ocrStatus === 'pending' || this.ocrStatus === 'processing';
  }

  async ngOnInit() {
    this.assignmentId = this.route.snapshot.paramMap.get('slug');
    this.classId = this.route.snapshot.queryParamMap.get('classId');
    this.lastRefreshToken = this.route.snapshot.queryParamMap.get('refresh');

    this.refreshParamSub?.unsubscribe();
    this.refreshParamSub = this.route.queryParamMap.subscribe((params) => {
      const next = params.get('refresh');
      if (next === this.lastRefreshToken) return;
      this.lastRefreshToken = next;
      if (!next) return;
      void this.load();
    });

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
    ++this.loadOcrCorrectionsSeq;
    ++this.loadTranscriptPagesSeq;
    ++this.setUploadedFileUrlSeq;
    this.resetSectionStates();
    this.submission = null;
    this.feedback = null;
    this.assignment = null;
    this.assignmentUnavailable = false;
    this.annotations = [];
    this.ocrWords = [];
    this.transcriptPageViews = [];
    this.transcriptPagesSignature = null;
    this.submissionFileUrls = [];
    this.submissionFileIds = [];
    this.uploadedFileUrl = null;
    this.pdfMediaState = 'idle';
    this.hasLoadedOcrCorrections = false;

    try {
      let submission: BackendSubmission | null = null;
      try {
        submission = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId, this.lastRefreshToken);
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
      this.submissionState = 'loaded';

      await this.loadAssignmentMetadata(submission, seq);
      if (this.destroyed || seq !== this.loadSeq) return;

      const rawFiles: any[] = Array.isArray((submission as any)?.files) ? (submission as any).files : [];
      const filePairsFromObjects = rawFiles
        .map((f: any) => {
          if (!f || typeof f !== 'object') return null;
          const id = typeof (f._id || f.id) === 'string' ? String(f._id || f.id).trim() : '';
          const url = typeof f.url === 'string' ? f.url.trim() : '';
          if (!id || !url) return null;
          return { id, url };
        })
        .filter(Boolean) as Array<{ id: string; url: string }>;

      if (filePairsFromObjects.length) {
        this.submissionFileIds = filePairsFromObjects.map((p) => p.id);
        this.submissionFileUrls = filePairsFromObjects.map((p) => p.url);
      } else {
        const urlsRaw = Array.isArray((submission as any)?.fileUrls) ? (submission as any).fileUrls : [];
        const urls = urlsRaw
          .map((u: any) => (typeof u === 'string' ? u.trim() : ''))
          .filter((u: string) => Boolean(u));

        const idsRaw = rawFiles
          .map((f: any) => (typeof f === 'string' ? f : (f && typeof f === 'object' ? (f._id || f.id) : null)))
          .map((id: any) => (typeof id === 'string' ? id.trim() : ''));

        const urlsCount = Array.isArray(urlsRaw) ? urlsRaw.length : 0;
        const idsCount = Array.isArray(idsRaw) ? idsRaw.length : 0;

        if (urlsCount > 0 && urlsCount === idsCount) {
          this.submissionFileUrls = urlsRaw.map((u: any) => (typeof u === 'string' ? u.trim() : '')).filter((u: string) => Boolean(u));
          this.submissionFileIds = idsRaw.map((id: any) => (typeof id === 'string' ? id : ''));
        } else {
          this.submissionFileUrls = urls.length ? urls : (submission?.fileUrl ? [submission.fileUrl] : []);
          this.submissionFileIds = idsRaw.filter((id: string) => Boolean(id));
        }
      }

      if (!this.submissionFileIds.length) {
        const pages: any[] = Array.isArray((submission as any)?.ocrPages) ? (submission as any).ocrPages : [];
        const seen = new Set<string>();
        const idsFromPages: string[] = [];
        for (const p of pages) {
          const fid = p && p.fileId ? String(p.fileId).trim() : '';
          if (!fid || seen.has(fid)) continue;
          seen.add(fid);
          idsFromPages.push(fid);
        }
        if (idsFromPages.length) {
          this.submissionFileIds = idsFromPages;
        }
      }

      if (!this.submissionFileIds.length && (submission as any)?.file) {
        const fid = typeof (submission as any).file === 'string' ? (submission as any).file : ((submission as any).file?._id || (submission as any).file?.id);
        if (typeof fid === 'string' && fid.trim()) {
          this.submissionFileIds = [fid.trim()];
        }
      }

      if (!Array.isArray(this.submissionFileUrls) || !this.submissionFileUrls.length) {
        this.submissionFileUrls = submission?.fileUrl ? [submission.fileUrl] : [];
      }

      if (this.activeFileIndex < 0 || this.activeFileIndex >= this.submissionFileUrls.length) {
        this.activeFileIndex = 0;
      }

      await this.ensureClassSettingsLoadedFromSubmission(submission);

      this.revokeObjectUrls();
      await this.setUploadedFileUrl(this.activeFileUrlRaw || submission?.fileUrl || null);

      this.rebuildOcrWords();

      let correctionsLoaded = true;
      if (submission?._id) {
        correctionsLoaded = await this.loadOcrCorrections(submission._id) !== false;
        if (this.destroyed || seq !== this.loadSeq) return;
        await this.loadCompleteTranscript(submission._id);
        if (this.destroyed || seq !== this.loadSeq) return;
        this.hasLoadedOcrCorrections = submission.ocrStatus === 'completed';
      }

      if (!correctionsLoaded) this.correctionsState = 'error';
      else if (!['processing', 'partial', 'loaded'].includes(this.correctionsState)) this.correctionsState = 'loaded';

      this.rebuildHighlightedTranscript();
      await this.refreshWritingCorrections();

      this.ocrErrorMessage = null;

      if (submission?.ocrStatus === 'failed') {
        this.ocrErrorMessage = submission.ocrError || 'OCR failed';
      }

      this.transcriptState = this.ocrErrorMessage && !this.extractedText ? 'error' : 'loaded';

      this.syncOcrPolling();

      if (submission?._id) {
        try {
          const fb = await this.feedbackApi.getSubmissionFeedback(submission._id);

          if (this.destroyed || seq !== this.loadSeq) return;

          this.canonicalResultState = normalizeCanonicalResult(fb, this.canonicalResultState);
          const evaluationPending = this.canonicalResultState.processingActive && this.canonicalResultState.evaluationStatus !== 'completed';
          this.feedback = fb;
          this.adaptiveSkillScores = this.buildAdaptiveSkillScores(fb);
          console.log('STUDENT FEEDBACK LOADED:', fb);
          this.teacherComment = typeof fb?.aiFeedback?.overallComments === 'string' ? fb.aiFeedback.overallComments : null;

          this.feedbackForm.patchValue({
            message: this.teacherComment || ''
          });
          this.feedbackState = this.canonicalResultState.detailedFeedbackStatus === 'completed' ? 'loaded'
            : ['failed', 'blocked'].includes(this.canonicalResultState.detailedFeedbackStatus) ? 'error' : 'processing';
          this.aiFeedbackState = ['failed', 'blocked'].includes(this.canonicalResultState.evaluationStatus) ? 'error' : evaluationPending ? 'processing' : 'loaded';
          this.scoreState = this.canonicalResultState.evaluationStatus === 'processing' ? 'processing'
            : ['failed', 'blocked'].includes(this.canonicalResultState.evaluationStatus) ? 'error' : 'loaded';
          this.syncOcrPolling();
        } catch (err: any) {
          if (this.destroyed || seq !== this.loadSeq) return;
          this.canonicalResultState = normalizeCanonicalResult({ __temporaryError: true }, this.canonicalResultState);
          this.adaptiveSkillScores = this.buildAdaptiveSkillScores(null);
          this.teacherComment = null;
          this.feedbackForm.patchValue({ message: '' });
          const missingFeedback = Number(err?.status) === 404;
          this.feedbackState = missingFeedback ? 'loaded' : 'error';
          this.aiFeedbackState = missingFeedback ? 'loaded' : 'error';
          this.scoreState = missingFeedback ? 'loaded' : 'error';
        }
      }

      if (this.destroyed || seq !== this.loadSeq) return;

    } catch (err: any) {
      if (!this.destroyed && seq === this.loadSeq) {
        this.submissionState = 'error';
        this.transcriptState = 'error';
        this.correctionsState = 'error';
        this.feedbackState = 'error';
        this.aiFeedbackState = 'error';
        this.scoreState = 'error';
      }
      console.error('Failed to load OCR corrections:', err?.error || err);
      throw err;
    } finally {
      if (seq === this.loadSeq) this.isLoading = false;
    }
  }

  private syncOcrPolling() {
    if (!this.submission) {
      this.stopOcrPolling();
      return;
    }

    const result = this.canonicalResultState;
    if ((result && result.processingActive && result.automaticPollingAllowed && !result.terminal)
      || (!result && ['pending', 'processing'].includes(this.submission.ocrStatus || 'pending'))
      || (this.submission.ocrStatus === 'completed' && !this.hasLoadedOcrCorrections)) {
      this.startOcrPolling();
      return;
    }

    this.stopOcrPolling();
  }

  private startOcrPolling() {
    if (this.isOcrPolling || !this.submission?._id) return;
    this.isOcrPolling = true;
    this.ocrPollAttempts = 0;
    this.resultCoordinator.start(this.submission._id, (submissionId, requestSequence) => this.refreshCanonicalResult(submissionId, requestSequence));
  }

  private stopOcrPolling() {
    this.isOcrPolling = false;
    this.resultCoordinator.stop();
    if (this.ocrPollTimeoutId) {
      clearTimeout(this.ocrPollTimeoutId);
      this.ocrPollTimeoutId = null;
    }
  }

  private async refreshCanonicalResult(submissionId: string, _requestSequence: number): Promise<ResultRefreshSnapshot> {
    const assignmentId = this.assignmentId;
    if (!assignmentId || this.destroyed) throw { status: 0 };
    const updated = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId, Date.now());
    if (this.destroyed || !updated || updated._id !== submissionId) throw { status: 409 };

    this.submission = updated;
    this.rebuildOcrWords();
    await this.loadOcrCorrections(submissionId);
    await this.loadCompleteTranscript(submissionId);
    this.rebuildHighlightedTranscript();
    await this.refreshWritingCorrections();

    let canonicalFeedbackLoaded = false;
    try {
      const feedback = await this.feedbackApi.getSubmissionFeedback(submissionId);
      if (this.destroyed || this.submission?._id !== submissionId) throw { status: 409 };
      this.feedback = feedback;
      this.canonicalResultState = normalizeCanonicalResult(feedback, this.canonicalResultState);
      canonicalFeedbackLoaded = true;
      this.adaptiveSkillScores = this.buildAdaptiveSkillScores(feedback);
      this.teacherComment = typeof feedback?.aiFeedback?.overallComments === 'string' ? feedback.aiFeedback.overallComments : null;
      this.feedbackForm.patchValue({ message: this.teacherComment || '' });
    } catch (error: any) {
      if (![404, 202, 409, 429].includes(Number(error?.status))) throw error;
    }

    this.canonicalResultState = applySubmissionLifecycleFallback(this.canonicalResultState, updated, canonicalFeedbackLoaded);
    const canonical = this.canonicalResultState;
    this.transcriptState = updated.ocrStatus === 'failed' ? 'error' : updated.ocrStatus === 'completed' ? 'loaded' : 'processing';
    this.correctionsState = canonical.correctionStatus === 'completed' ? 'loaded' : canonical.correctionStatus === 'failed' ? 'error' : canonical.correctionStatus === 'partial' ? 'partial' : 'processing';
    this.statisticsState = canonical.statisticsStatus === 'complete' ? 'loaded' : canonical.statisticsStatus === 'failed' ? 'error' : canonical.statisticsStatus === 'partial' ? 'partial' : 'processing';
    this.scoreState = canonical.evaluationStatus === 'completed' ? 'loaded' : ['failed', 'blocked'].includes(canonical.evaluationStatus) ? 'error' : 'processing';
    this.aiFeedbackState = ['failed', 'blocked'].includes(canonical.evaluationStatus) ? 'error' : canonical.processingActive ? 'processing' : 'loaded';
    this.feedbackState = canonical.detailedFeedbackStatus === 'completed' ? 'loaded' : ['failed', 'blocked'].includes(canonical.detailedFeedbackStatus) ? 'error' : 'processing';
    return { submissionId, ocrStatus: updated.ocrStatus as any, canonical };
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
    this.ocrPollAttempts += 1;

    try {
      const updated = await this.submissionApi.getMySubmissionByAssignmentId(assignmentId, this.lastRefreshToken);
      if (this.destroyed) return;

      this.submission = updated;
      await this.setUploadedFileUrl(updated?.fileUrl || this.rawUploadedFileUrl);
      this.rebuildOcrWords();

      if (updated?._id && (!this.hasLoadedOcrCorrections || updated.ocrStatus === 'completed')) {
        await this.loadOcrCorrections(updated._id);
        await this.loadCompleteTranscript(updated._id);
        this.hasLoadedOcrCorrections = updated.ocrStatus === 'completed';
      }

      this.rebuildHighlightedTranscript();
      await this.refreshWritingCorrections();

      if (updated?.ocrStatus === 'failed') {
        this.ocrErrorMessage = updated.ocrError || 'OCR failed';
      } else {
        this.ocrErrorMessage = null;
      }

      if (updated?.ocrStatus === 'completed' || updated?.ocrStatus === 'failed') {
        this.stopOcrPolling();
        return;
      }

      const delays = [1200, 2000, 3000, 5000];
      if (this.ocrPollAttempts >= delays.length) {
        this.ocrErrorMessage = 'OCR is taking longer than expected. Please retry in a moment.';
        this.stopOcrPolling();
        return;
      }
      this.scheduleNextOcrRefresh(delays[this.ocrPollAttempts]);
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Failed to fetch OCR text';
      this.ocrErrorMessage = message;
      if (this.ocrPollAttempts >= 4) {
        this.stopOcrPolling();
      } else {
        const delays = [1200, 2000, 3000, 5000];
        this.scheduleNextOcrRefresh(delays[this.ocrPollAttempts]);
      }
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
    const seq = ++this.setUploadedFileUrlSeq;

    this.revokeObjectUrls();
    this.rawUploadedFileUrl = url;
    this.uploadedFileUrl = null;
    this.uploadedFileIsPdf = false;
    this.pdfMediaState = 'idle';

    if (!url) {
      return Promise.resolve();
    }

    const lowered = url.toLowerCase().split('?')[0];
    this.uploadedFileIsPdf = lowered.endsWith('.pdf');
    if (this.uploadedFileIsPdf) this.pdfMediaState = 'fetching';

    const normalizedUrl = this.normalizeUploadsUrl(url);

    if (seq === this.setUploadedFileUrlSeq) {
      this.uploadedFileUrl = normalizedUrl;
    }

    return this.fetchAsObjectUrl(normalizedUrl, true)
      .then((objectUrl) => {
        if (seq === this.setUploadedFileUrlSeq) {
          this.uploadedFileUrl = objectUrl;
          if (this.uploadedFileIsPdf) this.pdfMediaState = 'loaded';
        } else {
          this.removeObjectUrl(objectUrl);
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch(() => {
        if (seq === this.setUploadedFileUrlSeq) {
          this.uploadedFileUrl = normalizedUrl;
          if (this.uploadedFileIsPdf) this.pdfMediaState = 'error';
        }
      });
  }

  retryUploadedPdf(): void {
    if (!this.rawUploadedFileUrl) return;
    void this.setUploadedFileUrl(this.rawUploadedFileUrl);
  }
  isRetryingAnalysis = false;

  async retryCanonicalAnalysis(): Promise<void> {
    const submissionId = this.submission?._id;
    if (!submissionId || this.isRetryingAnalysis || !this.canonicalResultState?.manualRetryAllowed) return;
    this.isRetryingAnalysis = true;
    try {
      await this.submissionApi.regenerateCanonicalCorrections(submissionId);
      this.canonicalResultState = normalizeCanonicalResult({ correctionStatus: 'processing', correctionStage: 'semantic',
        processingActive: true, automaticPollingAllowed: true, manualRetryAllowed: false, terminal: false,
        statisticsStatus: 'partial', statisticsCompleteness: 'language_only', evaluationStatus: 'pending', detailedFeedbackStatus: 'pending' }, this.canonicalResultState);
      this.scoreState = 'processing';
      this.aiFeedbackState = 'processing';
      this.feedbackState = 'processing';
      this.resultCoordinator.start(submissionId, (id) => this.refreshCanonicalResult(id, 0));
    } catch (err: any) {
      this.alert.showError('Retry failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRetryingAnalysis = false;
    }
  }

}
