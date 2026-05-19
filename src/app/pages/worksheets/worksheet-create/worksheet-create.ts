/**
 * WorksheetCreatePage
 * Route: /worksheets/create?returnToClassId=
 *
 * Teacher enters a topic, picks options, generates a worksheet via AI,
 * reviews/edits the draft, then saves it. After saving, navigates back
 * to the class detail with openWorksheetAssignModal=true so the
 * assign modal auto-opens.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';
import {
  WorksheetApiService,
  type Worksheet,
  type WorksheetDraft,
} from '../../../api/worksheet-api.service';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';
import { WorksheetAssignInlineModal } from '../../../components/teacher/worksheet-assign-inline-modal/worksheet-assign-inline-modal';

type Difficulty = 'easy' | 'medium' | 'hard';

const GRADE_MAP: Record<string, string[]> = {
  'Early Learning': ['Pre-K', 'K'],
  Elementary: ['1st', '2nd', '3rd', '4th', '5th'],
  'Middle School': ['6th', '7th', '8th'],
  'High School': ['9th', '10th', '11th', '12th'],
  University: ['University', 'Adult'],
};

@Component({
  selector: 'app-worksheet-create',
  standalone: true,
  imports: [CommonModule, FormsModule, ErrorModal, SuccessModal, WorksheetAssignInlineModal],
  templateUrl: './worksheet-create.html',
  styleUrl: './worksheet-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorksheetCreatePage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(WorksheetApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy$ = new Subject<void>();

  /* ── Form fields ─────────────────────────── */
  topic = '';
  language = 'English';
  difficulty: Difficulty = 'medium';
  subject = '';
  cefrLevel = '';
  gradeCategory = '';
  gradeLevel = '';
  description = '';
  selectedTheme = '';
  assignmentDeadline = '';

  /* ── Activity Selection ───────────────────── */
  availableActivityTypes = [
    { id: 'ordering', label: 'Ordering/Sequencing', description: 'Arrange items in correct order' },
    { id: 'classification', label: 'Classification', description: 'Categorize items into groups' },
    {
      id: 'multipleChoice',
      label: 'Multiple Choice',
      description: 'Answer multiple choice questions',
    },
    {
      id: 'fillBlanks',
      label: 'Fill in the Blanks',
      description: 'Complete sentences with missing words',
    },
    { id: 'matching', label: 'Matching Pairs', description: 'Match related items together' },
    {
      id: 'trueFalse',
      label: 'True/False',
      description: 'Determine if statements are true or false',
    },
    { id: 'shortAnswer', label: 'Short Answer', description: 'Write brief responses to questions' },
  ];
  selectedActivityTypes: string[] = ['ordering', 'classification', 'multipleChoice', 'fillBlanks'];
  useCustomActivities = false;

  /* ── State ───────────────────────────────── */
  isGenerating = false;
  isSaving = false;
  errorModal = { open: false, title: '', message: '' };
  successModal = { open: false, title: '', message: '' };
  isRegeneratingTheme = false;
  draft: WorksheetDraft | null = null;
  savedWorksheet: Worksheet | null = null;
  sourceContent = '';
  gradeOptions: string[] = [];
  selectedFile: File | null = null;
  isUploading = false;
  showAssignModal = false;

  /* ── Gemini HTML Worksheet state ─────────────────────────
   * These fields are ONLY for the new file→Gemini→HTML flow.
   * They do NOT interact with the existing topic→JSON flow.
   * ──────────────────────────────────────────────────────── */
  htmlWorksheet: string | null = null; // raw HTML string from Gemini
  htmlWorksheetTitle = ''; // extracted <h1> / <title> from HTML
  htmlPreviewUrl: SafeResourceUrl | null = null; // blob: URL for the iframe
  isGeneratingHtml = false; // spinner for Gemini call
  isDownloadingPdf = false; // spinner for PDF export
  private _blobUrl: string | null = null; // kept so we can revoke on destroy

  readonly languages = ['English', 'Arabic', 'French', 'Spanish'];
  readonly difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
  readonly subjects = [
    '',
    'Math',
    'Science',
    'Social Studies',
    'English Language',
    'ESL',
    'History',
    'Geography',
    'Arts',
    'Music',
    'Physical Education',
    'Technology',
    'Other',
  ];
  readonly cefrLevels = [
    { value: '', label: 'CEFR Level' },
    { value: 'A1', label: 'A1 — Beginner' },
    { value: 'A2', label: 'A2 — Elementary' },
    { value: 'B1', label: 'B1 — Intermediate' },
    { value: 'B2', label: 'B2 — Upper Intermediate' },
    { value: 'C1', label: 'C1 — Advanced' },
    { value: 'C2', label: 'C2 — Proficient' },
  ];
  readonly gradeCategories = [
    '',
    'Early Learning',
    'Elementary',
    'Middle School',
    'High School',
    'University',
  ];
  readonly themes = [
    { value: '', label: 'Default Theme' },
    { value: 'modern', label: 'Modern' },
    { value: 'classic', label: 'Classic' },
    { value: 'corporate', label: 'Corporate' },
    { value: 'academic', label: 'Academic' },
    { value: 'futuristic', label: 'Futuristic' },
  ];

  activitySummary(): { label: string; count: number }[] {
    if (!this.draft) return [];

    // Check if new activities array exists
    if (
      this.draft.activities &&
      Array.isArray(this.draft.activities) &&
      this.draft.activities.length > 0
    ) {
      return this.draft.activities.map((activity) => {
        const data = activity.data || {};
        let count = 0;
        if (
          activity.type === 'ordering' ||
          activity.type === 'classification' ||
          activity.type === 'matching' ||
          activity.type === 'dragDrop' ||
          activity.type === 'sorting'
        ) {
          count = data.items?.length || 0;
        } else if (
          activity.type === 'multipleChoice' ||
          activity.type === 'trueFalse' ||
          activity.type === 'shortAnswer'
        ) {
          count = data.questions?.length || 0;
        } else if (activity.type === 'fillBlanks') {
          count = data.sentences?.length || 0;
        } else if (activity.type === 'labeling') {
          count = data.labels?.length || 0;
        } else if (activity.type === 'wordSearch' || activity.type === 'crossword') {
          count = data.words?.length || 0;
        }
        return { label: activity.title || activity.type, count };
      });
    }

    // Fallback to legacy activity1-4 fields
    return [
      { label: 'Ordering items', count: this.draft.activity1?.items?.length ?? 0 },
      { label: 'Classification items', count: this.draft.activity2?.items?.length ?? 0 },
      { label: 'Quiz questions', count: this.draft.activity3?.questions?.length ?? 0 },
      { label: 'Fill-blank sentences', count: this.draft.activity4?.sentences?.length ?? 0 },
    ];
  }

  generate(): void {
    if (this.isGenerating) return;

    if (this.selectedFile) {
      this.generateFromFile();
      return;
    }

    const topic = this.topic.trim();
    if (!topic) {
      this.errorModal = {
        open: true,
        title: 'Topic Required',
        message: 'Please enter a topic or paste text before generating.',
      };
      this.cdr.markForCheck();
      return;
    }
    this.isGenerating = true;
    this.draft = null;
    this.cdr.markForCheck();

    const activityTypesParam = this.useCustomActivities ? this.selectedActivityTypes : null;

    this.api
      .generate({
        inputType: 'topic',
        content: topic,
        language: this.language,
        difficulty: this.difficulty,
        activityTypes: activityTypesParam,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.draft = res.worksheet ?? null;
          this.sourceContent = res.sourceContent ?? topic;
          this.isGenerating = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.isGenerating = false;
          this.errorModal = {
            open: true,
            title: 'Generation Failed',
            message: err?.error?.message ?? err?.message ?? 'Please try again.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  generateFromFile(): void {
    if (!this.selectedFile || this.isUploading) return;

    this.isUploading = true;
    this.isGenerating = true;
    this.draft = null;
    this.cdr.markForCheck();

    const activityTypesParam = this.useCustomActivities ? this.selectedActivityTypes : null;

    this.api
      .uploadAndGenerate(this.selectedFile, {
        language: this.language,
        difficulty: this.difficulty,
        activityTypes: activityTypesParam,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.draft = res.worksheet ?? null;
          this.sourceContent = res.sourceContent ?? this.selectedFile?.name ?? 'Uploaded file';
          this.isUploading = false;
          this.isGenerating = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.isUploading = false;
          this.isGenerating = false;
          this.errorModal = {
            open: true,
            title: 'Upload Failed',
            message: err?.error?.message ?? err?.message ?? 'Please try again.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // Validate file type — extended to include images for Gemini vision
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];
    if (!allowedTypes.includes(file.type)) {
      this.errorModal = {
        open: true,
        title: 'Unsupported File Type',
        message: 'Please upload a PDF, DOCX, TXT, PNG, or JPG file.',
      };
      this.cdr.markForCheck();
      return;
    }

    // Validate file size (10 MB max)
    if (file.size > 10 * 1024 * 1024) {
      this.errorModal = {
        open: true,
        title: 'File Too Large',
        message: 'File too large. Max size is 10 MB.',
      };
      this.cdr.markForCheck();
      return;
    }

    // Clear any previous Gemini HTML result when a new file is chosen
    this.htmlWorksheet = null;
    this.htmlPreviewUrl = null;
    this.htmlWorksheetTitle = '';
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }

    this.selectedFile = file;
    this.topic = `File: ${file.name}`;
    this.cdr.markForCheck();
  }

  removeFile(): void {
    this.selectedFile = null;
    this.topic = '';
    // Also clear Gemini HTML state
    this.htmlWorksheet = null;
    this.htmlPreviewUrl = null;
    this.htmlWorksheetTitle = '';
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
    this.cdr.markForCheck();
  }

  toggleActivityType(typeId: string): void {
    if (this.selectedActivityTypes.includes(typeId)) {
      // Don't allow deselecting if only 1 selected
      if (this.selectedActivityTypes.length > 1) {
        this.selectedActivityTypes = this.selectedActivityTypes.filter((t) => t !== typeId);
      }
    } else {
      // Don't allow more than 6 activities
      if (this.selectedActivityTypes.length < 6) {
        this.selectedActivityTypes = [...this.selectedActivityTypes, typeId];
      }
    }
    this.cdr.markForCheck();
  }

  toggleCustomActivities(): void {
    // NOTE: [(ngModel)] on the checkbox already updated useCustomActivities to the new
    // checked state before this (change) handler fires. Do NOT flip it again here —
    // that was the double-toggle bug causing two clicks to be required.
    if (!this.useCustomActivities) {
      // Reset to default when disabling custom selection
      this.selectedActivityTypes = ['ordering', 'classification', 'multipleChoice', 'fillBlanks'];
    }
    this.cdr.markForCheck();
  }

  generateThemeFromSelection(themeSelection: string): any {
    const themes = {
      modern: {
        primaryColor: '#008081',
        accentColor: '#e0f7f7',
        backgroundColor: '#f8fafc',
        headerGradient: 'linear-gradient(135deg, #008081 0%, #00a8a8 100%)',
        patternType: 'modern-dots',
        fontStyle: 'modern',
        headerStyle: 'bold',
        darkHeader: true,
        colorPalette: {
          correct: '#22c55e',
          wrong: '#ef4444',
          highlight: '#fbbf24',
          cardBackground: '#ffffff',
          borderColor: '#e2e8f0',
        },
      },
      classic: {
        primaryColor: '#1e293b',
        accentColor: '#f1f5f9',
        backgroundColor: '#ffffff',
        headerGradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        patternType: 'classic-lines',
        fontStyle: 'serif',
        headerStyle: 'classic',
        darkHeader: true,
        colorPalette: {
          correct: '#059669',
          wrong: '#dc2626',
          highlight: '#d97706',
          cardBackground: '#fafafa',
          borderColor: '#d1d5db',
        },
      },
      corporate: {
        primaryColor: '#1e40af',
        accentColor: '#dbeafe',
        backgroundColor: '#f9fafb',
        headerGradient: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        patternType: 'corporate-grid',
        fontStyle: 'professional',
        headerStyle: 'corporate',
        darkHeader: true,
        colorPalette: {
          correct: '#059669',
          wrong: '#dc2626',
          highlight: '#2563eb',
          cardBackground: '#ffffff',
          borderColor: '#e5e7eb',
        },
      },
      academic: {
        primaryColor: '#7c3aed',
        accentColor: '#ede9fe',
        backgroundColor: '#fefefe',
        headerGradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
        patternType: 'academic-pattern',
        fontStyle: 'academic',
        headerStyle: 'formal',
        darkHeader: true,
        colorPalette: {
          correct: '#059669',
          wrong: '#dc2626',
          highlight: '#7c3aed',
          cardBackground: '#ffffff',
          borderColor: '#e5e7eb',
        },
      },
      futuristic: {
        primaryColor: '#06b6d4',
        accentColor: '#cffafe',
        backgroundColor: '#0f172a',
        headerGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
        patternType: 'futuristic-circuit',
        fontStyle: 'tech',
        headerStyle: 'futuristic',
        darkHeader: true,
        colorPalette: {
          correct: '#10b981',
          wrong: '#ef4444',
          highlight: '#06b6d4',
          cardBackground: '#1e293b',
          borderColor: '#334155',
        },
      },
    };

    return themes[themeSelection as keyof typeof themes] || themes.modern;
  }

  onGradeCategoryChange(): void {
    this.gradeOptions = GRADE_MAP[this.gradeCategory] ?? [];
    this.gradeLevel = '';
  }

  get themePatternLabel(): string {
    const p = this.savedWorksheet?.theme?.patternType ?? 'none';
    return p === 'none'
      ? 'No pattern'
      : p.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  save(): void {
    if (!this.draft || this.isSaving) return;
    if (!this.draft.title?.trim()) {
      this.errorModal = {
        open: true,
        title: 'Title Required',
        message: 'Please give the worksheet a title.',
      };
      this.cdr.markForCheck();
      return;
    }

    if (!this.assignmentDeadline) {
      this.errorModal = {
        open: true,
        title: 'Deadline Required',
        message: 'Please select an assignment deadline.',
      };
      this.cdr.markForCheck();
      return;
    }

    const d = new Date(this.assignmentDeadline);
    if (isNaN(d.getTime())) {
      this.errorModal = {
        open: true,
        title: 'Invalid Deadline',
        message: 'Please select a valid deadline date/time.',
      };
      this.cdr.markForCheck();
      return;
    }
    if (d.getTime() <= Date.now()) {
      this.errorModal = {
        open: true,
        title: 'Invalid Deadline',
        message: 'Deadline must be a future date/time.',
      };
      this.cdr.markForCheck();
      return;
    }
    const assignmentDeadlineIso = d.toISOString();

    this.isSaving = true;
    this.cdr.markForCheck();

    // Prepare worksheet data with backward compatibility
    const worksheetData: any = {
      ...this.draft,
      generationSource: this.selectedFile ? 'file' : 'topic',
      sourceContent: this.sourceContent,
      language: this.language,
      subject: this.subject,
      cefrLevel: this.cefrLevel,
      gradeLevel: this.gradeLevel,
      gradeCategory: this.gradeCategory,
      description: this.description,
      difficulty: this.difficulty,
      assignmentDeadline: assignmentDeadlineIso,
      theme: this.selectedTheme ? this.generateThemeFromSelection(this.selectedTheme) : undefined,
    };

    // Ensure activities array is included if present in draft
    if (this.draft.activities && Array.isArray(this.draft.activities)) {
      worksheetData.activities = this.draft.activities;
    }

    this.api
      .create(worksheetData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSaving = false;
          this.savedWorksheet = res.worksheet ?? null;
          this.draft = null;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.isSaving = false;
          this.errorModal = {
            open: true,
            title: 'Save Failed',
            message:
              err?.error?.message ?? err?.message ?? 'Could not save worksheet. Please try again.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  regenerateTheme(): void {
    if (!this.savedWorksheet || this.isRegeneratingTheme) return;
    this.isRegeneratingTheme = true;
    this.cdr.markForCheck();
    this.api
      .regenerateTheme(this.savedWorksheet._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.savedWorksheet && res?.data?.theme) {
            this.savedWorksheet = { ...this.savedWorksheet, theme: res.data.theme };
          }
          this.isRegeneratingTheme = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isRegeneratingTheme = false;
          this.errorModal = {
            open: true,
            title: 'Theme Error',
            message: 'Could not regenerate theme. Please try again.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  proceedToAssign(): void {
    if (!this.savedWorksheet) return;
    this.showAssignModal = true;
    this.cdr.markForCheck();
  }

  onWorksheetAssigned(result: { classId: string; assignmentId: string }): void {
    this.showAssignModal = false;
    this.cdr.markForCheck();
    // Navigate to class details page
    this.router.navigate(['/teacher/my-classes/detail', result.classId]);
  }

  onAssignModalClosed(): void {
    this.showAssignModal = false;
    this.cdr.markForCheck();
  }

  cancel(): void {
    const returnToClassId = this.route.snapshot.queryParamMap.get('returnToClassId');
    this.router.navigate(
      returnToClassId ? ['/teacher/my-classes/detail', returnToClassId] : ['/teacher/my-classes'],
    );
  }

  // ── Gemini HTML Worksheet Methods ───────────────────────────────────────────
  // These methods are NEW. They are completely independent of the existing
  // topic-based generate() / generateFromFile() flow above.

  /** Call Gemini 1.5 Flash to generate a printable HTML worksheet from the file. */
  generateHtmlFromFile(): void {
    if (!this.selectedFile || this.isGeneratingHtml) return;

    this.isGeneratingHtml = true;
    this.htmlWorksheet = null;
    this.htmlPreviewUrl = null;
    this.htmlWorksheetTitle = '';
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
    this.cdr.markForCheck();

    const activityTypesParam = this.useCustomActivities ? this.selectedActivityTypes : null;

    this.api
      .geminiHtmlGenerate(this.selectedFile, {
        subject: this.subject,
        gradeLevel: this.gradeLevel,
        gradeCategory: this.gradeCategory,
        difficulty: this.difficulty,
        language: this.language,
        cefrLevel: this.cefrLevel,
        activityTypes: activityTypesParam,
        theme: this.selectedTheme || 'modern',
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.htmlWorksheet = res.html;
          this.htmlWorksheetTitle = res.title || 'Generated Worksheet';
          this._blobUrl = URL.createObjectURL(new Blob([res.html], { type: 'text/html' }));
          this.htmlPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this._blobUrl);
          this.isGeneratingHtml = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.isGeneratingHtml = false;
          this.errorModal = {
            open: true,
            title: 'Generation Failed',
            message:
              err?.error?.message ??
              err?.message ??
              'Failed to generate worksheet. Please try again.',
          };
          this.cdr.markForCheck();
        },
      });
  }

  /** Re-send the same file to Gemini to get a fresh worksheet. */
  regenerateHtmlWorksheet(): void {
    if (!this.selectedFile) return;
    this.generateHtmlFromFile();
  }

  /** Export the generated HTML worksheet as a PDF using html2canvas + jsPDF. */
  async downloadHtmlAsPdf(): Promise<void> {
    if (!this.htmlWorksheet || this.isDownloadingPdf) return;
    this.isDownloadingPdf = true;
    this.cdr.markForCheck();

    // Dynamically import to keep initial bundle lean
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    // Build a hidden, off-screen container with the raw HTML
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      top: '0',
      left: '-9999px',
      width: '794px',
      backgroundColor: '#ffffff',
      zIndex: '-9999',
    });
    container.innerHTML = this.htmlWorksheet;
    document.body.appendChild(container);

    // Brief pause so browser can apply styles / load fonts
    await new Promise<void>((r) => setTimeout(r, 600));

    try {
      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: 794,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let yPos = 0;

      pdf.addImage(imgData, 'PNG', 0, yPos, pageW, imgH);
      heightLeft -= pageH;

      while (heightLeft > 0) {
        yPos -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, yPos, pageW, imgH);
        heightLeft -= pageH;
      }

      const date = new Date().toISOString().split('T')[0];
      const titleSlug = this.htmlWorksheetTitle
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .slice(0, 30);
      pdf.save(`worksheet_${titleSlug}_${date}.pdf`);
    } finally {
      document.body.removeChild(container);
      this.isDownloadingPdf = false;
      this.cdr.markForCheck();
    }
  }

  // ── End Gemini Methods ───────────────────────────────────────────────────

  ngOnDestroy(): void {
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
