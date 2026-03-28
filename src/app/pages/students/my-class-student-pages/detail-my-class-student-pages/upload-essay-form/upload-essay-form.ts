import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  NgZone,
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
  private zone = inject(NgZone);

  isDragging = false;
  files: { file: File; name: string; size: number; preview?: string }[] = [];
  validationError: string | null = null;

  private readonly maxFileSizeBytes = 10 * 1024 * 1024;
  private readonly allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
  private readonly allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

  // Debounce guard — prevents double-fire on mobile (touchend + click both firing)
  private _lastOpenTime = 0;

  private openFilePicker(): void {
    const now = Date.now();
    // Ignore if picker was opened within the last 600ms
    if (now - this._lastOpenTime < 600) return;
    this._lastOpenTime = now;

    // Run outside Angular zone so the picker doesn't trigger change detection / navigation
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        this.fileInput.nativeElement.value = '';
        this.fileInput.nativeElement.click();
      }, 0);
    });
  }

  onDropZoneClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // On mobile, touchend already handles this — skip the redundant click
    if (this.device.isMobile() || this.device.isTablet()) return;

    this.openFilePicker();
  }

  onDropZoneTouchEnd(event: TouchEvent): void {
    event.preventDefault(); // Prevents the ghost click that follows touchend
    event.stopPropagation();
    this.openFilePicker();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles?.length) {
      this.handleFiles(droppedFiles);
    }
  }

  onFilesSelected(event: Event): void {
    // Run back inside Angular zone since this fires outside it
    this.zone.run(() => {
      const input = event.target as HTMLInputElement;
      const selectedFiles = input.files;
      if (selectedFiles?.length) {
        this.handleFiles(selectedFiles);
      }
      // Reset so the same file can be re-selected if removed
      input.value = '';
    });
  }

  handleFiles(fileList: FileList): void {
    this.validationError = null;

    Array.from(fileList).forEach((file) => {
      if (!this.isFileAllowed(file)) {
        this.validationError = 'Only JPG, PNG, and PDF files up to 10MB are allowed.';
        return;
      }

      // Avoid duplicates (same name + size)
      const isDuplicate = this.files.some(
        (f) => f.name === file.name && f.size === file.size
      );
      if (isDuplicate) return;

      const entry: { file: File; name: string; size: number; preview?: string } = {
        file,
        name: file.name,
        size: file.size,
      };

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          entry.preview = e.target?.result as string;
          this.cdr.detectChanges();
        };
        reader.readAsDataURL(file);
      }

      this.files.push(entry);
    });

    this.filesSelected.emit(this.files.map((f) => f.file));
    this.cdr.detectChanges();
  }

  removeFile(event: Event, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.files.splice(index, 1);
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.cdr.detectChanges();
  }

  reset(): void {
    this.files = [];
    this.validationError = null;
    this.isDragging = false;
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    this.filesSelected.emit([]);
    this.cdr.detectChanges();
  }

  private isFileAllowed(file: File): boolean {
    if (!file) return false;
    if (file.size > this.maxFileSizeBytes) return false;

    const typeOk = file.type ? this.allowedMimeTypes.has(file.type) : false;
    const ext =
      file.name.lastIndexOf('.') >= 0
        ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        : '';
    const extOk = ext ? this.allowedExtensions.has(ext) : false;

    return typeOk || extOk;
  }
}