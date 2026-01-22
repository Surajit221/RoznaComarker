import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, inject, Output, ViewChild } from '@angular/core';
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
  device = inject(DeviceService)

  isDragging = false;
  files: { file: File; name: string; size: number; preview?: string }[] = [];
  validationError: string | null = null;

  private readonly maxFileSizeBytes = 10 * 1024 * 1024;
  private readonly allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
  private readonly allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      this.handleFiles(droppedFiles);
    }
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const selectedFiles = input.files;
    if (selectedFiles && selectedFiles.length > 0) {
      this.handleFiles(selectedFiles);
    }
  }

  handleFiles(fileList: FileList) {
    this.validationError = null;
    Array.from(fileList).forEach(file => {
      if (!this.isFileAllowed(file)) {
        this.validationError = 'Only JPG, PNG, and PDF files up to 10MB are allowed.';
        return;
      }

      const newFile = {
        file,
        name: file.name,
        size: file.size,
      };

      // if (file.type.startsWith('image/')) {
      //   const reader = new FileReader();
      //   reader.onload = e => {
      //     newFile['preview'] = e.target?.result as string;
      //   };
      //   reader.readAsDataURL(file);
      // }

      this.files.push(newFile);
    });

    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }

    this.filesSelected.emit(this.files.map(f => f.file));
  }

  removeFile(event: Event, index: number) {
    event.stopPropagation();
    this.files.splice(index, 1);
    this.filesSelected.emit(this.files.map(f => f.file));
  }

  private isFileAllowed(file: File): boolean {
    if (!file) return false;
    if (typeof file.size === 'number' && file.size > this.maxFileSizeBytes) return false;

    const typeOk = file.type ? this.allowedMimeTypes.has(file.type) : false;
    const dot = file.name.lastIndexOf('.') >= 0 ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
    const extOk = dot ? this.allowedExtensions.has(dot) : false;

    return typeOk || extOk;
  }
}
