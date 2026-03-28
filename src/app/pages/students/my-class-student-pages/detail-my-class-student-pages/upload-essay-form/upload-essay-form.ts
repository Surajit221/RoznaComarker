import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Output,
  ViewChild,
} from '@angular/core';
import { DeviceService } from '../../../../../services/device.service';

@Component({
  selector: 'app-upload-essay-form',
  imports: [CommonModule],
  templateUrl: './upload-essay-form.html',
  styleUrl: './upload-essay-form.css',
})
export class UploadEssayForm {
  @Output() filesSelected = new EventEmitter<File[]>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  device = inject(DeviceService);
  private cdr = inject(ChangeDetectorRef);

  isDragging = false;
  files: { file: File; name: string; size: number; preview?: string }[] = [];
  validationError: string | null = null;

  private readonly maxFileSizeBytes = 10 * 1024 * 1024;
  private readonly allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
  private readonly allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

  // Prevents touchend + click both firing the picker on mobile
  private _pickerOpen = false;

  openFilePicker(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this._pickerOpen) return;
    this._pickerOpen = true;

    // Small delay so the browser doesn't treat it as a blocked popup
    setTimeout(() => {
      this.fileInput.nativeElement.value = '';
      this.fileInput.nativeElement.click();
      // Reset guard after picker closes (no reliable event, so use a timeout)
      setTimeout(() => {
        this._pickerOpen = false;
      }, 1000);
    }, 10);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles?.length) {
      this.processFiles(droppedFiles);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files;
    if (selected?.length) {
      this.processFiles(selected);
    }
    // Always reset so same file can be picked again
    input.value = '';
  }

  private processFiles(fileList: FileList): void {
    this.validationError = null;
    const incoming = Array.from(fileList);
    const toAdd: { file: File; name: string; size: number; preview?: string }[] = [];

    for (const file of incoming) {
      if (!this.isFileAllowed(file)) {
        this.validationError = 'Only JPG, PNG, and PDF files up to 10MB are allowed.';
        continue;
      }

      const isDuplicate = this.files.some(
        (f) => f.name === file.name && f.size === file.size
      );
      if (isDuplicate) continue;

      const entry: { file: File; name: string; size: number; preview?: string } = {
        file,
        name: file.name,
        size: file.size,
      };
      toAdd.push(entry);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          entry.preview = e.target?.result as string;
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      }
    }

    this.files = [...this.files, ...toAdd];
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.cdr.detectChanges();
  }

  removeFile(event: Event, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.files = this.files.filter((_, i) => i !== index);
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.cdr.detectChanges();
  }

  reset(): void {
    this.files = [];
    this.validationError = null;
    this.isDragging = false;
    this._pickerOpen = false;
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    this.filesSelected.emit([]);
    this.cdr.detectChanges();
  }

  private isFileAllowed(file: File): boolean {
    if (!file || file.size > this.maxFileSizeBytes) return false;
    const typeOk = this.allowedMimeTypes.has(file.type);
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    const extOk = this.allowedExtensions.has(ext);
    return typeOk || extOk;
  }
}