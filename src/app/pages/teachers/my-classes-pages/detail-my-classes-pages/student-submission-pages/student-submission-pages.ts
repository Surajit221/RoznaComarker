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

@Component({
  selector: 'app-student-submission-pages',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppBarBackButton
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

  submissions: BackendSubmission[] = [];
  currentSubmission: BackendSubmission | null = null;
  currentFeedback: BackendFeedback | null = null;

  writingCorrectionsLegend: CorrectionLegend | null = null;
  writingCorrectionsIssues: WritingCorrectionIssue[] = [];
  writingCorrectionsHtml: SafeHtml | null = null;
  writingCorrectionsError: string | null = null;
  isWritingCorrectionsLoading = false;
  private lastWritingCorrectionsText: string | null = null;

  essayImageUrl: string | null = null;
  private objectUrls: string[] = [];

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

    try {
      const pdfUrl = await this.pdfApi.getPdfUrl(submission._id);
      if (!pdfUrl) {
        this.alert.showError('PDF not available', 'Please try again');
        return;
      }
      const objectUrl = await this.fetchAsEphemeralObjectUrl(pdfUrl);
      window.open(objectUrl, '_blank', 'noopener');
    } catch (err: any) {
      this.alert.showError('Failed to generate PDF', err?.error?.message || err?.message || 'Please try again');
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

      if (this.currentSubmission?._id && this.isProbablyPdfUrl(url)) {
        const previewUrl = this.buildSubmissionPreviewUrl(this.currentSubmission._id);
        this.essayImageUrl = await this.fetchAsObjectUrl(previewUrl);
      } else if (this.isProbablyImageUrl(url) && url) {
        this.essayImageUrl = await this.fetchAsObjectUrl(url);
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
        message: fb?.textFeedback || ''
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

    try {
      const existingFeedbackId = submission && (submission as any).feedback;
      if (existingFeedbackId && typeof existingFeedbackId === 'string') {
        const updated = await this.feedbackApi.updateFeedback({
          feedbackId: existingFeedbackId,
          textFeedback
        });
        this.currentFeedback = updated;
      } else {
        const created = await this.feedbackApi.createFeedback({
          submissionId: submission._id,
          textFeedback
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
