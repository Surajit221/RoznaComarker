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
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';



import { AlertService } from '../../../../../services/alert.service';



import { ClassApiService } from '../../../../../api/class-api.service';



import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';



import { firstValueFrom } from 'rxjs';



import { environment } from '../../../../../../environments/environment';



import { WritingCorrectionsApiService, type WritingCorrectionIssue } from '../../../../../api/writing-corrections-api.service';



import type { CorrectionLegend } from '../../../../../models/correction-legend.model';



import { buildWritingCorrectionsHtml } from '../../../../../utils/writing-corrections-highlight.util';



import { applyLegendToAnnotations, applyLegendToIssues } from '../../../../../utils/correction-legend-mapping.util';



import { buildLegendAlignedFeedback, type LegendAlignedFeedback } from '../../../../../utils/legend-aligned-feedback.util';



import { ImageAnnotationOverlayComponent } from '../../../../../components/image-annotation-overlay/image-annotation-overlay';



import { TokenizedTranscript } from '../../../../../components/submission-details/tokenized-transcript/tokenized-transcript';



import { TeacherDashboardStateService } from '../../../../../services/teacher-dashboard-state.service';



import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';



import type { OcrWord } from '../../../../../models/ocr-token.model';



import { ModalDialog } from '../../../../../shared/modal-dialog/modal-dialog';



import { DialogViewSubmissions } from '../dialog-view-submissions/dialog-view-submissions';



import { RubricDesignerModal } from '../../../../../components/teacher/rubric-designer-modal/rubric-designer-modal';



import { rubricScoresToFeedbackItems, type RubricFeedbackItem } from '../../../../../utils/dynamic-ai-feedback.util';



import { formatGradingDisplay, type GradingScale } from '../../../../../utils/grading-display.util';

import { DEFAULT_CORRECTION_LEGEND } from '../../../../../constants/correction-legend.default';



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



    DialogViewSubmissions,

    RubricDesignerModal



  ],



  templateUrl: './student-submission-pages.html',



  styleUrl: './student-submission-pages.css',



})



export class StudentSubmissionPages {







  showDialog = false;



  openSheetSubmission = false;

  isRubricDialogOpen = false;

  rubricDesignerForModal: RubricDesigner | null = null;



  @Output() closed = new EventEmitter<void>();



  isUploadedFile = true;



  device = inject(DeviceService);



  activeTab = 'uploaded-file';







  private route = inject(ActivatedRoute);



  private submissionApi = inject(SubmissionApiService);



  private feedbackApi = inject(FeedbackApiService);



  private pdfApi = inject(PdfApiService);

  private assignmentApi = inject(AssignmentApiService);



  private alert = inject(AlertService);



  private classApi = inject(ClassApiService);



  private http = inject(HttpClient);



  private sanitizer = inject(DomSanitizer);



  private writingCorrectionsApi = inject(WritingCorrectionsApiService);



  private teacherDashboardState = inject(TeacherDashboardStateService);







  private readonly defaultCorrectionLegend: any = DEFAULT_CORRECTION_LEGEND;



  private normalizeLegendKey(value: any): string {

    return String(value || '')

      .trim()

      .toUpperCase()

      .replace(/\s+/g, '_');

  }

  private async hydrateRubricDesignerFromAssignmentThenFeedback(): Promise<void> {
    const submission: any = this.currentSubmission;
    const assignmentRaw: any = submission && submission.assignment;
    const assignmentId = typeof assignmentRaw === 'string'
      ? assignmentRaw
      : (assignmentRaw && typeof assignmentRaw === 'object' ? String(assignmentRaw._id || assignmentRaw.id || '') : '');

    if (assignmentId && assignmentId.trim().length) {
      try {
        const a: BackendAssignment = await this.assignmentApi.getAssignmentByIdForTeacher(assignmentId.trim());
        const d = this.parseRubricDesignerFromRubricsField((a as any)?.rubrics, (a as any)?.title)
          || this.parseLegacyRubricDesigner((a as any)?.rubric, (a as any)?.title);
        if (d) {
          this.applyRubricDesignerToState(d);
          return;
        }
      } catch (err: any) {
        const msg = err?.error?.message || err?.message || 'Please try again';
        this.alert.showError('Failed to load assignment rubric', msg);
      }
    }

    // fallback for legacy submission-based rubric designer
    this.hydrateRubricDesignerFromFeedback();
  }

  private tryRevokeObjectUrl(url: string | null | undefined): void {
    const u = typeof url === 'string' ? url : '';
    if (!u.startsWith('blob:')) return;
    try {
      URL.revokeObjectURL(u);
    } catch {
      // ignore
    }
  }

  openRubricDesignerDialog() {
    this.isRubricDialogOpen = true;
    this.showDialog = true;
  }

  private applyRubricDesignerToState(designer: RubricDesigner | null): void {
    if (!designer) {
      this.resetRubricDesigner();
      return;
    }

    const levelsRaw = Array.isArray(designer.levels) ? designer.levels : [];
    const criteriaRaw = Array.isArray(designer.criteria) ? designer.criteria : [];

    this.rubricDesignerTitle = typeof designer.title === 'string' ? designer.title : `Rubric: ${this.submissionTitle}`;
    this.rubricLevels = levelsRaw.length
      ? levelsRaw.map((l: any) => ({
          title: String(l?.title || ''),
          maxPoints: Number(l?.maxPoints) || 0
        }))
      : Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null }));

    this.rubricCriteriaRows = criteriaRaw.length
      ? criteriaRaw.map((c: any) => ({
          title: String(c?.title || ''),
          cells: this.rubricLevels.map((_, i) => String(Array.isArray(c?.cells) ? (c.cells[i] || '') : ''))
        }))
      : [{ title: '', cells: this.rubricLevels.map(() => '') }];

    this.rubricDesignerForModal = this.rubricDesignerFromState;
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

  closeRubricDesignerDialog() {
    this.isRubricDialogOpen = false;
    this.showDialog = false;
  }

  async onRubricDesignerSave(designer: RubricDesigner) {
    const submissionId = this.currentSubmission?._id;
    if (!submissionId) return;

    if (this.isRubricSaving) return;
    if (!designer) return;

    this.isRubricSaving = true;
    try {
      const submission: any = this.currentSubmission;
      const assignmentRaw: any = submission && submission.assignment;
      const assignmentId = typeof assignmentRaw === 'string'
        ? assignmentRaw
        : (assignmentRaw && typeof assignmentRaw === 'object' ? String(assignmentRaw._id || assignmentRaw.id || '') : '');

      if (assignmentId && assignmentId.trim().length) {
        const updated = await this.assignmentApi.updateAssignmentRubrics(assignmentId.trim(), {
          rubricDesigner: designer
        });
        if (updated && updated._id) {
          const state: any = this.teacherDashboardState as any;
          if (!state.assignmentsById || typeof state.assignmentsById !== 'object') {
            state.assignmentsById = {};
          }
          state.assignmentsById[updated._id] = updated as any;
        }
      }

      const base = this.currentFeedback || this.buildEmptyFeedback(submissionId);
      const payload: SubmissionFeedback = {
        ...(base as any),
        submissionId,
        rubricDesigner: designer,
        overriddenByTeacher: true
      };

      const saved = await this.feedbackApi.upsertSubmissionFeedback(submissionId, payload);
      this.currentFeedback = saved;
      void this.hydrateRubricDesignerFromAssignmentThenFeedback();

      this.recomputeRubricFeedbackItems();
      this.alert.showToast('Rubric saved', 'success');
      this.closeRubricDesignerDialog();
    } catch (err: any) {
      this.alert.showError('Save rubric failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRubricSaving = false;
    }
  }

  async onRubricDesignerGenerateAi(prompt: string) {
    const submissionId = this.currentSubmission?._id;
    if (!submissionId) return;
    if (this.isLoading) return;

    const p = String(prompt || '').trim();
    if (!p) {
      this.alert.showWarning('Prompt required', 'Please enter a prompt to generate a rubric.');
      return;
    }

    this.isLoading = true;
    try {
      const updated = await this.feedbackApi.generateRubricDesignerFromPrompt(submissionId, p);
      this.currentFeedback = updated;
      this.hydrateRubricDesignerFromFeedback();
      this.recomputeRubricFeedbackItems();
      this.alert.showToast('Rubric generated', 'success');
    } catch (err: any) {
      this.alert.showError('Generate Rubric failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onRubricDesignerAttachFile(file: File) {
    const submissionId = this.currentSubmission?._id;
    if (!submissionId) return;
    if (!file) return;
    if (this.isRubricUploading) return;

    this.isRubricUploading = true;
    try {
      const updated = await this.feedbackApi.uploadRubricFile(submissionId, file);
      this.currentFeedback = updated;
      this.hydrateRubricDesignerFromFeedback();
      this.recomputeRubricFeedbackItems();
      this.alert.showToast('Rubric attached', 'success');
    } catch (err: any) {
      this.alert.showError('Attach rubric failed', err?.error?.message || err?.message || 'Please try again');
    } finally {
      this.isRubricUploading = false;
    }
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

    const keys = new Set(

      groups

        .map((g: any) => this.normalizeLegendKey(g?.key))

        .filter((k: string) => k.length)

    );

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



    // The backend /writing-corrections/legend currently returns a LanguageTool legend (SP/GR/ST/TY/CK).

    // For the submission "Correction Legend" section, we always want the academic legend (REL/DEV/...).

    const legend: any = this.isAcademicLegend(this.writingCorrectionsLegend)

      ? this.writingCorrectionsLegend

      : DEFAULT_CORRECTION_LEGEND;

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



    const isLegacyAutoSeededTemplate = (() => {



      const levels = levelsRaw;



      const criteria = criteriaRaw;



      const levelSig = (Array.isArray(levels) ? levels : []).map((l: any) => ({



        t: String(l?.title || '').trim(),



        p: Number(l?.maxPoints)



      }));



      const expectedLevels = [



        { t: 'Excellent', p: 10 },



        { t: 'Good', p: 8 },



        { t: 'Fair', p: 6 },



        { t: 'Needs Improvement', p: 4 }



      ];



      const sameLevels = levelSig.length === expectedLevels.length && levelSig.every((x: any, i: number) => x.t === expectedLevels[i].t && x.p === expectedLevels[i].p);



      if (!sameLevels) return false;



      const normalize = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');



      const critTitles = (Array.isArray(criteria) ? criteria : []).map((c: any) => normalize(c?.title));



      const expectedCrit = new Set([



        'grammar & mechanics',



        'structure & organization',



        'content relevance',



        'overall rubric score'



      ]);



      const hasExpectedCrit = critTitles.length && critTitles.every((t: string) => expectedCrit.has(t));



      return hasExpectedCrit;



    })();







    // If rubricDesigner exists but is effectively empty (common case), seed it from



    // the fixed AI rubric content so the modal inputs match the AI Feedback cards.



    if (!hasAnyLevelTitle && !hasAnyCriteriaTitle && !hasAnyCellText) {



      this.resetRubricDesigner();



      return;



    }



    if (isLegacyAutoSeededTemplate) {



      this.resetRubricDesigner();



      return;



    }







    this.rubricDesignerTitle = typeof d.title === 'string' ? d.title : `Rubric: ${this.submissionTitle}`;







    const d2 = (this.currentFeedback as any)?.rubricDesigner || d;



    const levels = Array.isArray(d2.levels) ? d2.levels : [];



    const criteria = Array.isArray(d2.criteria) ? d2.criteria : [];







    this.rubricLevels = levels.length



      ? levels.map((l: any) => {



          const title = String((l as any)?.title || '');



          const rawPoints = this.coercePointsInput((l as any)?.maxPoints);



          const maxPoints = !title.trim().length && rawPoints === 0 ? null : (rawPoints ?? null);



          return { title, maxPoints };



        })



      : Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null }));







    this.rubricCriteriaRows = criteria.length



      ? criteria.map((c: any) => ({



          title: String(c?.title || ''),



          cells: this.rubricLevels.map((_, i) => String(Array.isArray(c?.cells) ? (c.cells[i] || '') : ''))



        }))



      : [{ title: '', cells: this.rubricLevels.map(() => '') }];

    this.rubricDesignerForModal = this.rubricDesignerFromState;



  }



  async saveRubricAndRegenerate() {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;

    if (this.isRubricSaving) return;



    if (this.isRubricDesignerStateEmpty()) {

      this.alert.showWarning('Nothing to save', 'Please add rubric content before saving.');

      return;

    }



    this.isRubricSaving = true;

    try {

      const base = this.currentFeedback || this.buildEmptyFeedback(submissionId);

      const payload: SubmissionFeedback = {

        ...(base as any),

        submissionId,

        rubricDesigner: this.rubricDesignerFromState,

        overriddenByTeacher: true

      };



      const saved = await this.feedbackApi.upsertSubmissionFeedback(submissionId, payload);

      this.currentFeedback = saved;

      this.hydrateRubricDesignerFromFeedback();



      const regenerated = await this.feedbackApi.generateRubricDesignerAi(submissionId);

      this.currentFeedback = regenerated;

      this.hydrateRubricDesignerFromFeedback();

      this.hydrateRubricEditFormFromFeedback();

      this.recomputeRubricFeedbackItems();



      this.alert.showToast('Rubric saved', 'success');

      this.showDialog = false;

    } catch (err: any) {

      this.alert.showError('Save rubric failed', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isRubricSaving = false;

    }

  }







  private buildDefaultRubricDesignerFromFeedback(fb: SubmissionFeedback): RubricDesigner {



    const title = `Rubric: ${this.submissionTitle}`;



    const levels = Array.from({ length: 4 }).map(() => ({ title: '', maxPoints: null as any }));







    const criteriaSeed = [



      { category: '' },



      { category: '' },



      { category: '' },



      { category: '' }



    ];







    const criteria = criteriaSeed.map((x: any) => {



      const cat = typeof x?.category === 'string' ? x.category : 'Criteria';



      return {



        title: cat,



        cells: levels.map(() => '')



      };



    });







    return { title, levels, criteria };



  }







  private syncRubricDesignerStateFromRubricScores(): void {



    const fb: any = this.currentFeedback;



    if (!fb) return;







    this.ensureFixedRubricScoresAndComments();



    return;



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



  classId: string | null = null;







  classTitle: string = '';



  classGradingScale: GradingScale = 'score_0_100';



  private hasLoadedClassSettings = false;







  selectedAssignmentId: string | null = null;







  isLoading = false;







  isPdfDownloading = false;



  isRubricSaving = false;







  submissions: BackendSubmission[] = [];



  currentSubmission: BackendSubmission | null = null;



  currentFeedback: SubmissionFeedback | null = null;







  private autoAiGeneratedFor = new Set<string>();



  private autoRubricGeneratedFor = new Set<string>();



  isRubricContextGenerating = false;







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







  private get effectiveOverallScore100(): number {



    const fb: any = this.currentFeedback;



    const persisted = Number(fb?.overallScore);



    // If a teacher explicitly overrode grading, the persisted score is authoritative.

    if (fb?.overriddenByTeacher && Number.isFinite(persisted)) return persisted;



    if (Number.isFinite(persisted)) return persisted;

    return 0;



  }







  get overallScoreText(): string {



    const score = this.effectiveOverallScore100;



    return formatGradingDisplay(score, this.classGradingScale).displayText;



  }







  get gradeLabel(): string {



    const score = this.effectiveOverallScore100;



    return formatGradingDisplay(score, this.classGradingScale).badgeText;



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







  get mechanicsIssuesCount(): number {



    const n = Number(this.currentFeedback?.correctionStats?.mechanics);



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

uploadData: any = null;

  submissionFileUrls: string[] = [];

  submissionFileIds: string[] = [];

  activeFileIndex = 0;

  private applyCurrentSubmissionSeq = 0;

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

  get activeOcrPages(): Array<{ fileId?: string; pageNumber?: number; text?: string; words?: any }> {
    const pages = Array.isArray(this.currentSubmission?.ocrPages) ? this.currentSubmission!.ocrPages : [];
    if (!pages.length) return [];

    const activeId = this.activeFileId;
    if (!activeId) return pages;

    const filtered = pages.filter((p: any) => {
      const fid = p && p.fileId ? String(p.fileId) : '';
      return fid && fid === activeId;
    });

    return filtered.length ? filtered : pages;
  }

  onSelectSubmissionImage(index: number) {
    const i = Number(index);
    if (!Number.isFinite(i)) return;
    const urls = Array.isArray(this.submissionFileUrls) ? this.submissionFileUrls : [];
    if (i < 0 || i >= urls.length) return;
    if (this.activeFileIndex === i) return;

    this.activeFileIndex = i;

    this.ocrWords = [];
    this.annotations = [];
    this.correctionsError = null;
    this.recomputeLegendAligned();

    void this.applyCurrentSubmission(this.currentSubmission, false);
  }



  private objectUrls: string[] = [];







  private async loadOcrCorrections(submissionId: string): Promise<boolean> {



    if (this.isCorrectionsLoading) return false;



    this.isCorrectionsLoading = true;



    this.correctionsError = null;







    try {



      const apiBaseUrl = `${environment.apiUrl}/api`;



      const resp = await firstValueFrom(



        this.http.post<any>(
          `${apiBaseUrl}/submissions/${encodeURIComponent(submissionId)}/ocr-corrections`,
          this.activeFileId ? { fileId: this.activeFileId } : {}
        )



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



      this.annotations = applyLegendToAnnotations(this.annotations, this.getAcademicLegendForColors());







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



    const activePages = this.activeOcrPages;
    const pageText = activePages
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .map((t: string) => t.trim())
      .filter((t: string) => t.length)
      .join('\n\n');

    if (pageText) return pageText;

    const combined = (s as any).combinedOcrText && String((s as any).combinedOcrText).trim()
      ? String((s as any).combinedOcrText)
      : '';
    if (combined) return combined;

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



      const academicLegend = this.getAcademicLegendForColors();

      this.writingCorrectionsIssues = applyLegendToIssues(rawIssues, academicLegend);



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



      legend: this.getAcademicLegendForColors(),



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

  rubricPromptText = '';



  isRubricUploading = false;







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







    const gmMsg = '';



    const soMsg = '';



    const crMsg = '';



    const overallMsg = '';







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



      maxPoints: null



    }));







    this.rubricCriteriaRows = [



      {



        title: '',



        cells: this.rubricLevels.map(() => '')



      }



    ];

    this.rubricDesignerForModal = null;



  }







  addRubricLevelColumn() {



    if (this.rubricLevels.length >= 5) return;



    this.rubricLevels = [...this.rubricLevels, { title: '', maxPoints: null }];



    this.rubricCriteriaRows = this.rubricCriteriaRows.map((r) => ({ ...r, cells: [...r.cells, ''] }));



  }







  async removeRubricLevelColumn(index: number) {



    if (!Number.isFinite(index)) return;



    if (this.rubricLevels.length <= 1) return;



    if (index < 0 || index >= this.rubricLevels.length) return;







    const ok = await this.alert.showConfirm(



      'Delete column',



      'This will remove the rubric column and all cells in that column. This cannot be undone.',



      'Delete',



      'Cancel'



    );



    if (!ok) return;







    this.rubricLevels = this.rubricLevels.filter((_, i) => i !== index);



    this.rubricCriteriaRows = this.rubricCriteriaRows.map((r) => ({



      ...r,



      cells: (Array.isArray(r.cells) ? r.cells : []).filter((_, i) => i !== index)



    }));



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



    const file = el.files[0];



    const ext = String(file?.name || '').toLowerCase();

    const looksJson = file?.type === 'application/json' || ext.endsWith('.json');



    if (!looksJson) {

      void this.uploadRubricFileToBackend(file, el);

      return;

    }



    const reader = new FileReader();

    reader.onload = () => {

      try {

        const raw = typeof reader.result === 'string' ? reader.result : '';

        const parsed = JSON.parse(raw);

        const d = this.normalizeRubricDesignerFromAny(parsed);

        if (!d) {

          this.alert.showError('Invalid rubric file', 'Please upload a JSON rubric with title, levels, and criteria.');

          return;

        }



        this.rubricDesignerTitle = d.title;

        this.rubricLevels = d.levels.map((l) => ({ title: l.title, maxPoints: l.maxPoints }));

        this.rubricCriteriaRows = d.criteria.map((c) => ({ title: c.title, cells: [...c.cells] }));

        this.alert.showToast('Rubric loaded', 'success');

      } catch (err: any) {

        this.alert.showError('Invalid rubric file', err?.message || 'Please upload a valid JSON rubric.');

      }

    };

    reader.onerror = () => {

      this.alert.showError('Failed to read rubric file', 'Please try again.');

    };

    reader.readAsText(file);



    el.value = '';



  }



  private async uploadRubricFileToBackend(file: File, el: HTMLInputElement) {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;

    if (this.isRubricUploading) return;



    this.isRubricUploading = true;

    try {

      const updated = await this.feedbackApi.uploadRubricFile(submissionId, file);

      this.currentFeedback = updated;

      this.hydrateRubricDesignerFromFeedback();

      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Rubric attached', 'success');

    } catch (err: any) {

      this.alert.showError('Attach rubric failed', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isRubricUploading = false;

      el.value = '';

    }

  }



  private normalizeRubricDesignerFromAny(value: any): RubricDesigner | null {

    const obj = value && typeof value === 'object' ? value : null;

    if (!obj) return null;



    const title = typeof obj.title === 'string' && obj.title.trim().length ? obj.title.trim() : `Rubric: ${this.submissionTitle}`;

    const levelsRaw = Array.isArray(obj.levels) ? obj.levels : null;

    const criteriaRaw = Array.isArray(obj.criteria) ? obj.criteria : null;

    if (!levelsRaw || !criteriaRaw) return null;



    const levels = levelsRaw

      .map((l: any) => {

        const maxPoints = Number(l?.maxPoints);

        return {

          title: String(l?.title || '').trim(),

          maxPoints: Number.isFinite(maxPoints) ? Math.max(0, Math.floor(maxPoints)) : 0

        };

      })

      .filter((l: any) => String(l.title || '').trim().length)

      .slice(0, 6);

    if (!levels.length) return null;



    const levelCount = levels.length;

    const criteria = criteriaRaw

      .map((c: any) => {

        const cellsRaw = Array.isArray(c?.cells) ? c.cells : [];

        const cells = Array.from({ length: levelCount }).map((_, i) => String(cellsRaw[i] || ''));

        return {

          title: String(c?.title || '').trim(),

          cells

        };

      })

      .filter((c: any) => String(c.title || '').trim().length)

      .slice(0, 50);



    if (!criteria.length) return null;



    return { title, levels, criteria };

  }







  coercePointsInput(value: any): number | null {



    if (value === '' || value == null) return null;



    const n = Number(value);



    if (!Number.isFinite(n)) return null;



    return Math.max(0, Math.floor(n));



  }







  async generateRubricUsingAi() {



    const submission = this.currentSubmission;



    if (!submission) {



      this.alert.showWarning('No submission', 'Please select a submission first.');



      return;



    }



    if (this.isLoading) return;



    if (!this.rubricPromptText.trim()) {

      this.alert.showWarning('Prompt required', 'Please enter a prompt to generate a rubric.');

      return;

    }



    this.isLoading = true;



    try {

      const updated = await this.feedbackApi.generateRubricDesignerFromPrompt(submission._id, this.rubricPromptText.trim());

      this.currentFeedback = updated;

      this.hydrateRubricDesignerFromFeedback();

      this.feedbackForm.patchValue({ message: updated?.aiFeedback?.overallComments || '' });

      this.hydrateRubricEditFormFromFeedback();

      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Rubric generated', 'success');

    } catch (err: any) {

      this.alert.showError('Generate Rubric failed', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isLoading = false;

    }



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

    this.classId = classId;



    if (!classId) {



      this.classTitle = '';



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



      this.hasLoadedClassSettings = false;



    }



  }







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







  private isProbablyImageUrl(url: string | null | undefined): boolean {



    if (!url) return false;



    const lowered = url.toLowerCase();



    return lowered.endsWith('.png') || lowered.endsWith('.jpg') || lowered.endsWith('.jpeg');



  }

  isProbablyPdfUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    const lowered = String(url).toLowerCase().split('?')[0];
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



    const seq = ++this.applyCurrentSubmissionSeq;



    this.currentSubmission = submission;



    this.submissionId = submission?._id || null;



    await this.ensureClassSettingsLoadedFromSubmission(submission);





    try {



      const a: any = submission && (submission as any).assignment;
      console.log('[SUBMISSION META] assignment.teacher', a && typeof a === 'object' ? (a.teacher || null) : null, 'assignment.createdAt', a && typeof a === 'object' ? a.createdAt : null);



    } catch {



      // ignore



    }







    this.submissionFileUrls = Array.isArray((submission as any)?.fileUrls)
      ? (submission as any).fileUrls.filter((u: any) => typeof u === 'string' && u.trim().length)
      : (submission?.fileUrl ? [submission.fileUrl] : []);

    const rawFiles: any[] = Array.isArray((submission as any)?.files) ? (submission as any).files : [];
    this.submissionFileIds = rawFiles
      .map((f: any) => (typeof f === 'string' ? f : (f && typeof f === 'object' ? (f._id || f.id) : null)))
      .map((id: any) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id: string) => Boolean(id));

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

    const url = this.activeFileUrlRaw || this.currentSubmission?.fileUrl || null;



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
      const objectUrl = await this.fetchAsObjectUrl(previewUrl);
      if (seq !== this.applyCurrentSubmissionSeq) {
        this.tryRevokeObjectUrl(objectUrl);
        return;
      }

      this.essayImageUrl = objectUrl;



    } else if (this.isProbablyImageUrl(url) && url) {



      const objectUrl = await this.fetchAsObjectUrl(url);
      if (seq !== this.applyCurrentSubmissionSeq) {
        this.tryRevokeObjectUrl(objectUrl);
        return;
      }

      this.essayImageUrl = objectUrl;



    }







    if (this.currentSubmission?._id) {

      await this.loadOcrCorrections(this.currentSubmission._id);
      if (seq !== this.applyCurrentSubmissionSeq) return;

    }







    await this.loadFeedback();
    if (seq !== this.applyCurrentSubmissionSeq) return;

    this.recomputeRubricFeedbackItems();







    await this.ensureAiFeedbackGeneratedOnce();
    if (seq !== this.applyCurrentSubmissionSeq) return;







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







  async onEditRubric() {



    this.showDialog = true;



    this.ensureFixedRubricScoresAndComments();



    await this.hydrateRubricDesignerFromAssignmentThenFeedback();



    this.syncRubricDesignerStateFromRubricScores();



    this.hydrateRubricEditFormFromFeedback();



    // Do not auto-generate rubric on open; assignment.rubrics is the single source of truth.



  }



  private async ensureRubricGeneratedFromContextOnce(): Promise<void> {

    const submissionId = this.currentSubmission?._id;

    if (!submissionId) return;



    if (this.autoRubricGeneratedFor.has(submissionId)) return;

    this.autoRubricGeneratedFor.add(submissionId);



    if (!this.extractedText || !String(this.extractedText).trim().length) return;



    if (!this.isRubricDesignerStateEmpty()) return;



    try {

      await this.generateRubricFromContext();

    } catch {

      return;

    }

  }



  async generateRubricFromContext(forceRegenerate = false) {

    const submission = this.currentSubmission;

    if (!submission) {

      this.alert.showWarning('No submission', 'Please select a submission first.');

      return;

    }



    if (this.isRubricContextGenerating) return;



    if (forceRegenerate) {

      const ok = await this.alert.showConfirm(

        'Regenerate rubric',

        'This will replace the current rubric grid. Your manual edits in the grid will be lost. Continue?',

        'Regenerate',

        'Cancel'

      );

      if (!ok) return;

    }



    this.isRubricContextGenerating = true;

    this.isLoading = true;

    try {

      const updated = await this.feedbackApi.generateRubricDesignerFromContext(submission._id, {

        forceRegenerate

      });

      this.currentFeedback = updated;

      this.hydrateRubricDesignerFromFeedback();

      this.recomputeRubricFeedbackItems();

      this.alert.showToast('Rubric generated', 'success');

    } catch (err: any) {

      this.alert.showError('Generate Rubric failed', err?.error?.message || err?.message || 'Please try again');

    } finally {

      this.isLoading = false;

      this.isRubricContextGenerating = false;

    }

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



