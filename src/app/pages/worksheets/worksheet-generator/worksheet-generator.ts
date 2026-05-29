import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorksheetDocumentApiService } from '../../../api/worksheet-document-api.service';
import { WorksheetRendererComponent } from '../../../components/worksheet/worksheet-renderer';
import { AuthService } from '../../../auth/auth.service';
import { exportWorksheetToPdf, printWorksheet } from '../../../utils/worksheet-export.util';
import type { WorksheetDocument, ActivityType } from '../../../models/worksheet-document.model';
import { ACTIVITY_TYPE_META, MAX_ACTIVITY_TYPES } from '../../../models/worksheet-document.model';
import {
  CEFR_LEVELS,
  SUBJECTS,
  GRADE_CATEGORIES,
  GRADE_LEVELS_BY_CATEGORY,
  DIFFICULTIES,
  LANGUAGES,
  THEMES,
} from '../../../constants/worksheet-options';

// ── Progress step ─────────────────────────────────────────────────────────────
interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

const FILE_STEPS: ProgressStep[] = [
  { id: 'read', label: 'Reading file', status: 'pending' },
  { id: 'ocr', label: 'Extracting text (OCR)', status: 'pending' },
  { id: 'structure', label: 'Detecting layout structure', status: 'pending' },
  { id: 'generate', label: 'Generating worksheet content', status: 'pending' },
];

// ── All 7 activity types as an ordered array (for the card grid) ──────────────
const ALL_ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_META) as ActivityType[];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-worksheet-generator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, WorksheetRendererComponent],
  styleUrl: './worksheet-generator.css',
  template: `
    <div class="wg-wrapper">
      <div class="wg-header no-print">
        <h1 class="wg-title">Worksheet Generator</h1>
        <p class="wg-subtitle">
          Create printable worksheets in seconds — from a topic or an uploaded file.
        </p>
      </div>

      <!-- ── Tabs ── -->
      @if (!worksheet()) {
        <div class="wg-tabs no-print">
          <button class="wg-tab" [class.active]="activeTab() === 'text'" (click)="setTab('text')">
            📝 Create from Topic
          </button>
          <button class="wg-tab" [class.active]="activeTab() === 'file'" (click)="setTab('file')">
            📄 Create from File
          </button>
        </div>
      }

      <!-- ── Error banner ── -->
      @if (errorMsg()) {
        <div class="wg-error no-print">
          ⚠️ {{ errorMsg() }}
          <button class="wg-error-close" (click)="clearError()">✕</button>
        </div>
      }

      <!-- ════ TAB 1: CREATE FROM TOPIC ════ -->
      @if (!worksheet() && activeTab() === 'text') {
        <div style="display:flex;flex-direction:column;gap:20px" class="no-print">
          <!-- Title -->
          <div>
            <label class="wg-label">Title *</label>
            <input class="wg-input" [(ngModel)]="title" placeholder="Enter worksheet title..." />
          </div>

          <!-- Description -->
          <div>
            <label class="wg-label">
              Description
              <span style="color:#999;font-weight:400">(optional)</span>
            </label>
            <textarea
              class="wg-input"
              [(ngModel)]="description"
              placeholder="Short description of this worksheet..."
              rows="3"
              style="resize:vertical;font-family:inherit"
              (ngModelChange)="onDescriptionChange($event)"
            ></textarea>
            <div style="text-align:right;font-size:12px;color:#999;margin-top:2px">
              {{ description.length }}/500
            </div>
          </div>

          <!-- Subject + CEFR Level -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <label class="wg-label">Subject</label>
              <select class="wg-input" [(ngModel)]="subject">
                @for (s of subjects; track s.value) {
                  <option [value]="s.value">{{ s.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="wg-label">CEFR Level</label>
              <select class="wg-input" [(ngModel)]="cefrLevel">
                @for (c of cefrLevels; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Grade Category + Grade Level (cascading) -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <label class="wg-label">Grade Category</label>
              <select
                class="wg-input"
                [(ngModel)]="gradeCategory"
                (ngModelChange)="onGradeCategoryChange($event)"
              >
                @for (c of gradeCategories; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="wg-label">Grade Level</label>
              <select
                class="wg-input"
                [(ngModel)]="gradeLevel"
                [disabled]="!gradeCategory"
                [style.opacity]="gradeCategory ? '1' : '0.5'"
                [style.cursor]="gradeCategory ? 'pointer' : 'not-allowed'"
              >
                <option value="">
                  {{ gradeCategory ? 'Select grade level...' : 'Pick category first' }}
                </option>
                @for (g of availableGradeLevels; track g.value) {
                  <option [value]="g.value">{{ g.label }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Difficulty + Language + Theme -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
            <div>
              <label class="wg-label">Difficulty</label>
              <select class="wg-input" [(ngModel)]="difficulty">
                @for (d of difficulties; track d.value) {
                  <option [value]="d.value">{{ d.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="wg-label">Language</label>
              <select class="wg-input" [(ngModel)]="language">
                @for (l of languages; track l.value) {
                  <option [value]="l.value">{{ l.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="wg-label">Theme</label>
              <select class="wg-input" [(ngModel)]="theme">
                @for (t of themes; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Activity Types -->
          <div>
            <!-- Header row: label + Custom Selection toggle -->
            <div
              style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"
            >
              <label class="wg-label" style="margin:0">Activity Types</label>
              <div style="display:flex;align-items:center;gap:8px">
                <div
                  class="wg-toggle"
                  [class.on]="customSelection()"
                  (click)="toggleCustomSelection()"
                ></div>
                <span style="font-size:13px;font-weight:600;color:#333">Custom Selection</span>
              </div>
            </div>

            <!-- Card grid — 3 columns -->
            <div class="wg-activity-grid">
              @for (type of allActivityTypes; track type) {
                @let meta = activityMeta[type];
                @let selected = selectedTypes().includes(type);
                @let atMax = selectedTypes().length >= maxTypes && !selected;
                <div
                  class="wg-activity-card"
                  [class.selected]="selected"
                  [class.disabled]="atMax || !customSelection()"
                  (click)="toggleActivityType(type)"
                >
                  <div class="wg-activity-check" [class.checked]="selected">
                    @if (selected) {
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path
                          d="M1 5L4.5 8.5L11 1.5"
                          stroke="white"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    }
                  </div>
                  <div style="padding-left:30px">
                    <div class="wg-activity-label">{{ meta.label }}</div>
                    <div class="wg-activity-desc">{{ meta.description }}</div>
                  </div>
                </div>
              }
            </div>

            <!-- Counter -->
            <div style="text-align:right;font-size:13px;color:#777;margin-top:10px">
              Select {{ selectedTypes().length }}/{{ maxTypes }} activity types
            </div>
          </div>

          <!-- Validation warning -->
          @if (selectedTypes().length === 0) {
            <div style="color:#c62828;font-size:13px">
              ⚠️ Please select at least one activity type.
            </div>
          }

          <!-- Generate button -->
          <button
            class="wg-btn-generate"
            [disabled]="isLoading() || selectedTypes().length === 0 || !gradeCategory"
            (click)="generateFromText()"
          >
            ✨ {{ isLoading() ? 'Generating worksheet…' : 'Generate Worksheet' }}
          </button>
        </div>
      }

      <!-- ════ TAB 2: CREATE FROM FILE ════ -->
      @if (!worksheet() && activeTab() === 'file') {
        <div style="display:flex;flex-direction:column;gap:16px" class="no-print">
          @if (!uploadedFile()) {
            <div
              class="wg-dropzone"
              [class.dragover]="isDragging()"
              (dragover)="onDragOver($event)"
              (dragleave)="isDragging.set(false)"
              (drop)="onDrop($event)"
              (click)="fileInput.click()"
            >
              <input
                #fileInput
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style="display:none"
                (change)="onFileSelected($event)"
              />
              <span class="wg-dropzone-icon">📄</span>
              <p class="wg-dropzone-title">
                {{ isDragging() ? 'Drop your file here…' : 'Drag & drop PDF or image here' }}
              </p>
              <p class="wg-dropzone-sub">or click to browse — PDF, JPG, PNG, WEBP — max 10 MB</p>
            </div>
          } @else {
            <div class="wg-file-row">
              <!-- Thumbnail -->
              <div class="wg-thumb">
                @if (filePreviewUrl()) {
                  <img [src]="filePreviewUrl()!" alt="preview" class="wg-thumb-img" />
                } @else {
                  <div class="wg-thumb-pdf">
                    <span style="font-size:2rem">📄</span>
                    <span class="wg-thumb-name">{{ uploadedFile()!.name }}</span>
                  </div>
                }
              </div>

              <div class="wg-file-opts">
                <div class="wg-file-badge">
                  ✓ {{ uploadedFile()!.name }} ({{ (uploadedFile()!.size / 1024).toFixed(0) }} KB)
                  <button class="wg-remove-btn" (click)="clearFile()">Remove</button>
                </div>

                <label class="wg-checkbox-label">
                  <input
                    type="checkbox"
                    [ngModel]="keepOriginalTopic()"
                    (ngModelChange)="keepOriginalTopic.set($event)"
                  />
                  Keep original topic (AI detects from file)
                </label>

                @if (!keepOriginalTopic()) {
                  <div>
                    <label class="wg-label">New Topic</label>
                    <input
                      class="wg-input"
                      [(ngModel)]="newTopic"
                      placeholder="e.g. Mango Tree, Solar System"
                    />
                  </div>
                }

                <div>
                  <label class="wg-label">Grade Level</label>
                  <input class="wg-input" [(ngModel)]="fileGradeLevel" placeholder="e.g. Grade 4" />
                </div>

                <div>
                  <label class="wg-label">Subject (optional — AI detects if blank)</label>
                  <select class="wg-input" [(ngModel)]="fileSubject">
                    <option value="">Auto-detect</option>
                    @for (s of subjects; track s.value) {
                      @if (s.value) {
                        <option [value]="s.value">{{ s.label }}</option>
                      }
                    }
                  </select>
                </div>

                <button
                  class="wg-btn-generate"
                  [disabled]="isLoading()"
                  (click)="generateFromFile()"
                >
                  {{ isLoading() ? '⏳ Analyzing…' : '🔍 Analyze & Generate' }}
                </button>
              </div>
            </div>
          }

          @if (isLoading()) {
            <div class="wg-progress">
              <p class="wg-progress-title">Analyzing your worksheet…</p>
              @for (step of progressSteps(); track step.id) {
                <div class="wg-step" [class]="'wg-step--' + step.status">
                  <span class="wg-step-icon">
                    {{
                      step.status === 'done'
                        ? '✓'
                        : step.status === 'active'
                          ? '⟳'
                          : step.status === 'error'
                            ? '✗'
                            : '○'
                    }}
                  </span>
                  <span>{{ step.label }}</span>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ════ PREVIEW ════ -->
      @if (worksheet(); as ws) {
        <div class="wg-action-bar no-print">
          <button class="wg-action-btn" (click)="clearWorksheet()">← Create Another</button>
          <button
            class="wg-action-btn wg-action-btn--answer"
            [class.active]="showAnswerKey()"
            (click)="toggleAnswerKey()"
          >
            {{ showAnswerKey() ? 'Hide Answer Key' : 'Show Answer Key' }}
          </button>
          <button class="wg-action-btn" (click)="print()">🖨️ Print</button>
          <button
            class="wg-action-btn wg-action-btn--pdf"
            [disabled]="exportingPdf()"
            (click)="downloadPdf()"
          >
            {{ exportingPdf() ? 'Exporting…' : '⬇️ Download PDF' }}
          </button>
        </div>

        <div style="overflow-x:auto">
          <app-worksheet-renderer
            [worksheet]="ws"
            mode="preview"
            [showAnswerKey]="showAnswerKey()"
          />
        </div>
      }
    </div>
  `,
})
export class WorksheetGeneratorComponent implements OnDestroy {
  private readonly api = inject(WorksheetDocumentApiService);
  private readonly auth = inject(AuthService);

  // ── Static data ────────────────────────────────────────────────────────────
  readonly cefrLevels = CEFR_LEVELS;
  readonly subjects = SUBJECTS;
  readonly gradeCategories = GRADE_CATEGORIES;
  readonly difficulties = DIFFICULTIES;
  readonly languages = LANGUAGES;
  readonly themes = THEMES;
  readonly allActivityTypes = ALL_ACTIVITY_TYPES;
  readonly activityMeta = ACTIVITY_TYPE_META;
  readonly maxTypes = MAX_ACTIVITY_TYPES;

  // ── UI state ───────────────────────────────────────────────────────────────
  readonly activeTab = signal<'text' | 'file'>('text');
  readonly worksheet = signal<WorksheetDocument | null>(null);
  readonly isLoading = signal(false);
  readonly exportingPdf = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly showAnswerKey = signal(false);

  // ── Tab 1 form state ───────────────────────────────────────────────────────
  title = '';
  description = '';
  subject = '';
  cefrLevel = '';
  gradeCategory = '';
  gradeLevel = '';
  difficulty = 'medium';
  language = 'en';
  theme = 'default';

  readonly selectedTypes = signal<ActivityType[]>([
    'ordering_sequencing',
    'classification',
    'multiple_choice',
    'fill_in_blanks',
  ]);
  readonly customSelection = signal(true);

  /** Grade levels available for the currently selected grade category. */
  get availableGradeLevels(): { value: string; label: string }[] {
    return this.gradeCategory ? (GRADE_LEVELS_BY_CATEGORY[this.gradeCategory] ?? []) : [];
  }

  // ── Tab 2 form state ───────────────────────────────────────────────────────
  readonly uploadedFile = signal<File | null>(null);
  readonly filePreviewUrl = signal<string | null>(null);
  readonly isDragging = signal(false);
  readonly keepOriginalTopic = signal(true);
  readonly progressSteps = signal<ProgressStep[]>(FILE_STEPS.map((s) => ({ ...s })));
  newTopic = '';
  fileGradeLevel = 'Grade 4';
  fileSubject = '';

  // ── Form helpers ───────────────────────────────────────────────────────────
  setTab(tab: 'text' | 'file'): void {
    this.activeTab.set(tab);
    this.errorMsg.set(null);
  }

  clearError(): void {
    this.errorMsg.set(null);
  }

  onDescriptionChange(val: string): void {
    if (val.length > 500) this.description = val.slice(0, 500);
  }

  onGradeCategoryChange(cat: string): void {
    this.gradeCategory = cat;
    this.gradeLevel = ''; // reset child dropdown
  }

  toggleActivityType(type: ActivityType): void {
    if (!this.customSelection()) return;
    this.selectedTypes.update((prev) => {
      if (prev.includes(type)) return prev.filter((t) => t !== type);
      if (prev.length >= MAX_ACTIVITY_TYPES) return prev;
      return [...prev, type];
    });
  }

  toggleCustomSelection(): void {
    this.customSelection.update((v) => !v);
    if (!this.customSelection()) {
      this.selectedTypes.set(['multiple_choice', 'fill_in_blanks', 'true_false', 'short_answer']);
    }
  }

  // ── File handling ──────────────────────────────────────────────────────────
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.applyFile(file);
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.applyFile(file);
  }

  private applyFile(file: File): void {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.errorMsg.set('Unsupported file type. Please upload PDF, JPG, PNG, or WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorMsg.set('File must be under 10 MB.');
      return;
    }
    this.uploadedFile.set(file);
    this.errorMsg.set(null);
    this.filePreviewUrl.set(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  clearFile(): void {
    const url = this.filePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.uploadedFile.set(null);
    this.filePreviewUrl.set(null);
  }

  // ── Generate from text ─────────────────────────────────────────────────────
  async generateFromText(): Promise<void> {
    if (!this.title.trim()) {
      this.errorMsg.set('Please enter a worksheet title.');
      return;
    }
    if (!this.subject) {
      this.errorMsg.set('Please select a subject.');
      return;
    }
    if (!this.gradeCategory) {
      this.errorMsg.set('Please select a grade category.');
      return;
    }
    if (!this.gradeLevel) {
      this.errorMsg.set('Please select a grade level.');
      return;
    }
    if (this.selectedTypes().length === 0) {
      this.errorMsg.set('Please select at least one activity type.');
      return;
    }

    this.isLoading.set(true);
    this.errorMsg.set(null);
    this.worksheet.set(null);

    try {
      const ws = await this.api.generateFromText({
        topic: this.title.trim(),
        description: this.description.trim() || undefined,
        subject: this.subject,
        cefrLevel: this.cefrLevel || undefined,
        gradeCategory: this.gradeCategory,
        gradeLevel: this.gradeLevel,
        teacherId: this.teacherId,
        questionTypes: this.selectedTypes() as string[],
        questionCount: 10,
        difficulty: this.difficulty as 'easy' | 'medium' | 'hard',
        language: this.language,
        colorPreference: this.theme,
        // Phase 6 new fields sent under their new names too
        ...({ activityTypes: this.selectedTypes(), theme: this.theme } as Record<string, unknown>),
      });
      this.worksheet.set(ws);
    } catch (err: unknown) {
      this.errorMsg.set(this.extractMsg(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Generate from file ─────────────────────────────────────────────────────
  async generateFromFile(): Promise<void> {
    const file = this.uploadedFile();
    if (!file) {
      this.errorMsg.set('Please upload a file first.');
      return;
    }

    this.isLoading.set(true);
    this.errorMsg.set(null);
    this.worksheet.set(null);
    this.progressSteps.set(FILE_STEPS.map((s) => ({ ...s, status: 'pending' as const })));

    try {
      this.updateStep('read', 'active');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('gradeLevel', this.fileGradeLevel);
      formData.append('teacherId', this.teacherId);
      if (!this.keepOriginalTopic() && this.newTopic.trim())
        formData.append('topic', this.newTopic.trim());
      if (this.fileSubject.trim()) formData.append('subject', this.fileSubject.trim());

      const apiPromise = this.api.generateFromFile(formData);

      await this.delay(400);
      this.updateStep('read', 'done');
      this.updateStep('ocr', 'active');
      await this.delay(1200);
      this.updateStep('ocr', 'done');
      this.updateStep('structure', 'active');
      await this.delay(1500);
      this.updateStep('structure', 'done');
      this.updateStep('generate', 'active');

      const ws = await apiPromise;
      this.updateStep('generate', 'done');
      this.worksheet.set(ws);
    } catch (err: unknown) {
      this.progressSteps.update((steps) =>
        steps.map((s) => (s.status === 'active' ? { ...s, status: 'error' as const } : s)),
      );
      this.errorMsg.set(this.extractMsg(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Export / Print ─────────────────────────────────────────────────────────
  async downloadPdf(): Promise<void> {
    const ws = this.worksheet();
    if (!ws) return;
    this.exportingPdf.set(true);
    try {
      await exportWorksheetToPdf(ws);
    } catch (err: unknown) {
      this.errorMsg.set('PDF export failed: ' + this.extractMsg(err));
    } finally {
      this.exportingPdf.set(false);
    }
  }

  print(): void {
    printWorksheet();
  }

  toggleAnswerKey(): void {
    this.showAnswerKey.update((v) => !v);
  }

  clearWorksheet(): void {
    this.worksheet.set(null);
    this.errorMsg.set(null);
    this.showAnswerKey.set(false);
  }

  ngOnDestroy(): void {
    const url = this.filePreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private get teacherId(): string {
    return (
      (this.auth as unknown as { currentUser?: { uid?: string } })?.currentUser?.uid ??
      'teacher_demo'
    );
  }

  private updateStep(id: string, status: ProgressStep['status']): void {
    this.progressSteps.update((steps) => steps.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const e = err as { error?: { message?: string } };
      return e.error?.message ?? 'Something went wrong.';
    }
    return 'Something went wrong. Please try again.';
  }
}
