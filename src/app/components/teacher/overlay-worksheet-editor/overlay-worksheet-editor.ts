import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import {
  WorksheetApiService,
  type WorksheetActivity9Field,
} from '../../../api/worksheet-api.service';
import { ErrorModal } from '../../../shared/ui/error-modal/error-modal';
import { SuccessModal } from '../../../shared/ui/success-modal/success-modal';

@Component({
  selector: 'app-overlay-worksheet-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, ErrorModal, SuccessModal],
  templateUrl: './overlay-worksheet-editor.html',
  styleUrl: './overlay-worksheet-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayWorksheetEditorComponent {
  private readonly api = inject(WorksheetApiService);

  @Input() file: File | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ worksheetId: string }>();

  isLoading = true;
  isAnalyzing = true;
  isSaving = false;
  errorModal = { open: false, title: '', message: '' };
  successModal = { open: false, title: '', message: '' };

  imageUrl = '';
  originalFileUrl = '';
  detectedFields: WorksheetActivity9Field[] = [];
  worksheetTitle = '';
  subject = '';
  
  // Editable fields
  title = '';
  subjectInput = '';
  gradeLevel = '';
  language = 'English';
  
  selectedFieldIndex: number | null = null;
  
  readonly gradeOptions = [
    '',
    'Pre-K',
    'K',
    '1st',
    '2nd',
    '3rd',
    '4th',
    '5th',
    '6th',
    '7th',
    '8th',
    '9th',
    '10th',
    '11th',
    '12th',
    'University',
    'Adult',
  ];

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

  ngOnInit(): void {
    if (this.file) {
      this.analyzeFile();
    } else {
      this.close();
    }
  }

  async analyzeFile(): Promise<void> {
    if (!this.file) return;

    try {
      const response = await firstValueFrom(this.api.detectFields(this.file));
      
      if (response.success) {
        this.imageUrl = response.imageUrl;
        this.originalFileUrl = response.imageUrl; // Use the same URL for now
        this.detectedFields = response.fields || [];
        this.worksheetTitle = response.worksheetTitle || '';
        this.subject = response.subject || '';
        
        // Initialize editable fields
        this.title = this.worksheetTitle || 'Untitled Worksheet';
        this.subjectInput = this.subject || '';
        
        this.isAnalyzing = false;
        this.isLoading = false;
      }
    } catch (error: any) {
      this.errorModal = {
        open: true,
        title: 'Analysis Failed',
        message: error?.error?.message || error?.message || 'Could not analyze the file. Please try again.',
      };
      this.isLoading = false;
      this.isAnalyzing = false;
    }
  }

  selectField(index: number): void {
    this.selectedFieldIndex = index;
  }

  updateField(index: number, field: Partial<WorksheetActivity9Field>): void {
    this.detectedFields[index] = { ...this.detectedFields[index], ...field };
  }

  deleteField(index: number): void {
    this.detectedFields = this.detectedFields.filter((_, i) => i !== index);
    if (this.selectedFieldIndex === index) {
      this.selectedFieldIndex = null;
    } else if (this.selectedFieldIndex !== null && this.selectedFieldIndex > index) {
      this.selectedFieldIndex--;
    }
  }

  addField(): void {
    const newField: WorksheetActivity9Field = {
      id: `field_${this.detectedFields.length + 1}`,
      label: `Field ${this.detectedFields.length + 1}`,
      x: 50,
      y: 50,
      width: 15,
      height: 5,
      type: 'text',
      expectedAnswer: '',
      hint: '',
    };
    this.detectedFields = [...this.detectedFields, newField];
  }

  onFieldDrop(event: CdkDragDrop<WorksheetActivity9Field[]>): void {
    moveItemInArray(this.detectedFields, event.previousIndex, event.currentIndex);
    if (this.selectedFieldIndex === event.previousIndex) {
      this.selectedFieldIndex = event.currentIndex;
    }
  }

  async save(): Promise<void> {
    if (!this.title.trim()) {
      this.errorModal = {
        open: true,
        title: 'Title Required',
        message: 'Please enter a worksheet title.',
      };
      return;
    }

    if (!this.subjectInput) {
      this.errorModal = {
        open: true,
        title: 'Subject Required',
        message: 'Please select a subject.',
      };
      return;
    }

    if (this.detectedFields.length === 0) {
      this.errorModal = {
        open: true,
        title: 'No Fields',
        message: 'Please add at least one field to the worksheet.',
      };
      return;
    }

    this.isSaving = true;

    try {
      const response = await firstValueFrom(
        this.api.saveOverlayWorksheet({
          title: this.title,
          subject: this.subjectInput,
          backgroundImageUrl: this.imageUrl,
          originalFileUrl: this.originalFileUrl,
          fields: this.detectedFields,
          gradeLevel: this.gradeLevel || undefined,
          language: this.language,
        }),
      );

      if (response.success && response.worksheet) {
        this.successModal = {
          open: true,
          title: 'Worksheet Saved',
          message: 'Your overlay worksheet has been saved successfully.',
        };
        
        // Emit saved event with worksheet ID
        this.saved.emit({ worksheetId: response.worksheet._id });
        
        // Close after a short delay
        setTimeout(() => this.close(), 1500);
      }
    } catch (error: any) {
      this.errorModal = {
        open: true,
        title: 'Save Failed',
        message: error?.error?.message || error?.message || 'Could not save the worksheet. Please try again.',
      };
    } finally {
      this.isSaving = false;
    }
  }

  close(): void {
    this.closed.emit();
  }

  get selectedField(): WorksheetActivity9Field | null {
    if (this.selectedFieldIndex === null || this.selectedFieldIndex >= this.detectedFields.length) {
      return null;
    }
    return this.detectedFields[this.selectedFieldIndex];
  }
}
