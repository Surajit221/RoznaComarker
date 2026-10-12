import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Output,
  Input,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ImagePreflightResult, ImagePreflightService } from '../../../../../services/image-preflight.service';
import { ImageQualityChecklist } from '../../../../../components/image-quality-checklist/image-quality-checklist';
import { DeviceService } from '../../../../../services/device.service';

interface UploadEntry {
  file: File; name: string; size: number; preview?: string;
  qualityState?: 'queued' | 'checking' | 'done' | 'unavailable';
  quality?: ImagePreflightResult; qualityError?: string;
}

@Component({
  selector: 'app-upload-essay-form',
  imports: [CommonModule, ImageQualityChecklist],
  templateUrl: './upload-essay-form.html',
  styleUrl: './upload-essay-form.css',
})
export class UploadEssayForm {
  @Input() disabled = false;
  @Output() readinessChange = new EventEmitter<boolean>();
  @Output() filesSelected = new EventEmitter<File[]>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imageInput') imageInput!: ElementRef<HTMLInputElement>;

  device = inject(DeviceService);
  private cdr = inject(ChangeDetectorRef);

  private preflight = inject(ImagePreflightService);
  private active?: { entry: UploadEntry; request: Subscription };
  private destroyed = false;

  isDragging = false;
  files: UploadEntry[] = [];
  validationError: string | null = null;

  private readonly maxFileSizeBytes = 10 * 1024 * 1024;
  readonly maxFiles = 20;
  private readonly allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
  private readonly allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

  // Prevents touchend + click both firing the picker on mobile
  private _pickerOpen = false;

  openImagePicker(): void {
    if (this.disabled || this.destroyed) return;
    // Keep this click synchronous with the student's button press. Mobile
    // browsers may reject file pickers opened from a later timer callback.
    this.imageInput.nativeElement.value = '';
    this.imageInput.nativeElement.click();
  }

  openFilePicker(event: Event): void {
    if (this.disabled || this.destroyed) return;
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
    if (this.disabled || this.destroyed) return;
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

  onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files || []);
    if (selected.length) {
      const images = selected.filter((file) => {
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        return ['image/jpeg', 'image/png'].includes(file.type)
          || ['.jpg', '.jpeg', '.png'].includes(extension);
      });
      this.processFiles(images);
      if (images.length !== selected.length) {
        this.validationError = 'Upload Image accepts JPG and PNG files only. Use the file area for PDFs.';
      }
    }
    input.value = '';
  }

  private processFiles(fileList: FileList | File[]): void {
    if (this.disabled || this.destroyed) return;
    this.validationError = null;
    const incoming = Array.from(fileList);
    const toAdd: UploadEntry[] = [];

    for (const file of incoming) {
      if (this.files.length + toAdd.length >= this.maxFiles) {
        this.validationError = 'You can select up to 20 files.';
        break;
      }
      if (!this.isFileAllowed(file)) {
        this.validationError = 'Only JPG, PNG, and PDF files up to 10MB are allowed.';
        continue;
      }

      const isDuplicate = this.files.some(
        (f) => f.name === file.name && f.size === file.size
      ) || toAdd.some((f) => f.name === file.name && f.size === file.size);
      if (isDuplicate) continue;

      const entry: UploadEntry = {
        file,
        name: file.name,
        size: file.size,
      };
      toAdd.push(entry);

      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);
      if (isImage) {
        entry.preview = URL.createObjectURL(file);
        entry.qualityState = 'queued';
      }
    }

    this.files = [...this.files, ...toAdd];
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  removeFile(event: Event, index: number): void {
    if (this.disabled || this.destroyed) return;
    event.preventDefault();
    event.stopPropagation();
    const removed = this.files[index];
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    if (this.active?.entry === removed) { this.active.request.unsubscribe(); this.active = undefined; }
    this.files = this.files.filter((_, i) => i !== index);
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  moveFile(event: Event, index: number, direction: -1 | 1): void {
    if (this.disabled || this.destroyed) return;
    event.preventDefault();
    event.stopPropagation();
    const target = index + direction;
    if (target < 0 || target >= this.files.length) return;
    const reordered = [...this.files];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    this.files = reordered;
    this.filesSelected.emit(this.files.map((entry) => entry.file));
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  reset(): void {
    this.cancelChecks();
    this.files = [];
    this.validationError = null;
    this.isDragging = false;
    this._pickerOpen = false;
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    if (this.imageInput?.nativeElement) {
      this.imageInput.nativeElement.value = '';
    }
    this.filesSelected.emit([]);
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  get ready(): boolean {
    return this.files.length > 0 && this.files.every(entry => !entry.qualityState
      || (entry.qualityState === 'done' && entry.quality?.ready === true));
  }

  retryQuality(entry: UploadEntry): void {
    if (this.disabled || this.destroyed || this.active?.entry === entry || !this.files.includes(entry)) return;
    entry.quality = undefined;
    entry.qualityError = undefined;
    entry.qualityState = 'queued';
    this.updateReadiness();
  }

  private updateReadiness(): void {
    if (this.destroyed) return;
    this.readinessChange.emit(this.ready);
    if (this.active) return;
    const entry = this.files.find(file => file.qualityState === 'queued');
    if (!entry) return;
    entry.qualityState = 'checking';
    const task = { entry, request: new Subscription() };
    this.active = task;
    task.request.add(this.preflight.check(entry.file).subscribe({
      next: result => {
        if (this.destroyed || this.active !== task || !this.files.includes(entry)) return;
        entry.quality = result;
        entry.qualityState = 'done';
      },
      error: () => {
        if (this.destroyed || this.active !== task || !this.files.includes(entry)) return;
        entry.qualityState = 'unavailable';
        entry.qualityError = 'We could not check this image. Please retry the check.';
        this.finishCheck(task);
      },
      complete: () => this.finishCheck(task),
    }));
  }

  private finishCheck(task: { entry: UploadEntry; request: Subscription }): void {
    if (this.destroyed || this.active !== task) return;
    this.active = undefined;
    this.updateReadiness();
    this.cdr.markForCheck();
  }

  private cancelChecks(): void {
    this.active?.request.unsubscribe();
    this.active = undefined;
    for (const entry of this.files) if (entry.preview) URL.revokeObjectURL(entry.preview);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancelChecks();
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
