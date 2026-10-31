import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Output,
  OnDestroy,
  Input,
  ViewChild,
} from '@angular/core';
import { ImageCrop } from '../../../../../components/image-crop/image-crop';
import { AppliedCrop, compressOversizedOriginal, CropRect, UPLOAD_MAX_BYTES } from '../../../../../components/image-crop/image-crop.util';
import { Subscription } from 'rxjs';
import { ImagePreflightResult, ImagePreflightService } from '../../../../../services/image-preflight.service';
import { ImageQualityChecklist } from '../../../../../components/image-quality-checklist/image-quality-checklist';
import { DeviceService } from '../../../../../services/device.service';

interface UploadEntry {
  file: File; name: string; size: number; preview?: string;
  original?: File; crop?: CropRect;
  // 'preparing' = an image over the upload limit is being compressed. An entry with no state is waiting for its crop step.
  qualityState?: 'preparing' | 'queued' | 'checking' | 'done' | 'unavailable';
  quality?: ImagePreflightResult; qualityError?: string;
}

@Component({
  selector: 'app-upload-essay-form',
  imports: [CommonModule, ImageQualityChecklist, ImageCrop],
  templateUrl: './upload-essay-form.html',
  styleUrl: './upload-essay-form.css',
})
export class UploadEssayForm implements OnDestroy {
  @Input() disabled = false;
  @Input() assignmentId: string | null = null;
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
  editingEntry?: UploadEntry;
  // True while the editor shows the automatic first-time crop step, false when re-cropping a finished item.
  reviewing = false;
  // Images still waiting for their crop step, in selection order ("Image 1 of 3").
  private reviewQueue: UploadEntry[] = [];
  private reviewTotal = 0;
  private reviewDone = 0;
  private cropTrigger?: HTMLElement;
  validationError: string | null = null;

  private readonly maxFileSizeBytes = UPLOAD_MAX_BYTES;
  // Photos over the upload limit are compressed; refuse anything absurd before decoding it.
  private readonly maxCompressibleBytes = 50 * 1024 * 1024;
  private readonly unsupportedMessage = 'Only JPG, PNG, and PDF files are allowed. PDFs must be 10MB or smaller; large photos are compressed automatically.';
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
    const oversized: UploadEntry[] = [];

    for (const file of incoming) {
      if (this.files.length + toAdd.length >= this.maxFiles) {
        this.validationError = 'You can select up to 20 files.';
        break;
      }
      const kind = this.fileKind(file);
      if (!kind || (kind === 'pdf' && file.size > this.maxFileSizeBytes)) {
        this.validationError = this.unsupportedMessage;
        continue;
      }
      if (kind === 'image' && file.size > this.maxCompressibleBytes) {
        this.validationError = 'This image is too large to process. Choose a smaller photo.';
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

      if (kind === 'image') {
        entry.preview = URL.createObjectURL(file);
        entry.original = file;
        // Every image goes through the crop step automatically, one at a time.
        this.reviewQueue.push(entry); this.reviewTotal++;
        if (file.size > this.maxFileSizeBytes) { entry.qualityState = 'preparing'; oversized.push(entry); }
      } else entry.qualityState = 'queued';
    }

    this.files = [...this.files, ...toAdd];
    this.filesSelected.emit(this.files.map((f) => f.file));
    oversized.forEach(entry => void this.compressEntry(entry));
    this.advanceReview();
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  /** An uncropped photo over the limit is compressed, not rejected. */
  private async compressEntry(entry: UploadEntry): Promise<void> {
    try {
      const compressed = await compressOversizedOriginal(entry.file);
      if (this.destroyed || !this.files.includes(entry)) return;
      if (entry.preview) URL.revokeObjectURL(entry.preview);
      entry.file = compressed; entry.original = compressed; entry.name = compressed.name; entry.size = compressed.size;
      entry.preview = URL.createObjectURL(compressed); entry.qualityState = undefined;
      this.filesSelected.emit(this.files.map((f) => f.file));
    } catch (error) {
      if (this.destroyed || !this.files.includes(entry)) return;
      this.dropEntry(entry);
      this.validationError = error instanceof Error ? error.message : 'This image could not be prepared. Choose another photo.';
      this.cdr.detectChanges();
      return;
    }
    this.advanceReview();
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  removeFile(event: Event, index: number): void {
    if (this.disabled || this.destroyed) return;
    event.preventDefault();
    event.stopPropagation();
    const removed = this.files[index];
    if (removed) this.dropEntry(removed);
  }

  private dropEntry(removed: UploadEntry): void {
    if (this.editingEntry === removed) {
      this.editingEntry = undefined;
      if (this.reviewing) { this.reviewing = false; this.reviewTotal--; }
    }
    const queued = this.reviewQueue.indexOf(removed);
    if (queued >= 0) { this.reviewQueue.splice(queued, 1); this.reviewTotal--; }
    if (removed.preview) URL.revokeObjectURL(removed.preview);
    if (this.active?.entry === removed) { this.active.request.unsubscribe(); this.active = undefined; }
    this.files = this.files.filter((entry) => entry !== removed);
    this.filesSelected.emit(this.files.map((f) => f.file));
    this.advanceReview();
    this.updateReadiness();
    this.cdr.detectChanges();
  }

  /** Opens the crop editor for the next image waiting for its crop step, if no editor is open. */
  private advanceReview(): void {
    if (this.destroyed || this.editingEntry) return;
    const next = this.reviewQueue[0];
    if (next?.qualityState === 'preparing') return; // wait for its compression to finish
    if (!next) { this.reviewTotal = 0; this.reviewDone = 0; return; }
    this.reviewQueue.shift();
    this.editingEntry = next; this.reviewing = true;
    this.readinessChange.emit(false);
  }

  isAwaitingReview(entry: UploadEntry): boolean { return this.reviewQueue.includes(entry); }

  get editorHeading(): string {
    if (!this.reviewing) return 'Crop Image';
    return this.reviewTotal > 1 ? `Image ${this.reviewDone + 1} of ${this.reviewTotal}` : 'Crop your image';
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
    this.editingEntry = undefined;
    this.reviewing = false; this.reviewQueue = []; this.reviewTotal = 0; this.reviewDone = 0;
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

  get handwritingChecking(): boolean {
    return this.files.some(entry => entry.qualityState === 'checking' && entry.quality?.sourceReadStatus === 'CHECKING');
  }

  get ready(): boolean {
    return !this.editingEntry && this.files.length > 0 && this.files.every(entry => (entry.qualityState === 'done' && entry.quality?.ready === true
        && entry.quality.checks.every(check => !check.required || check.status === 'pass')
        && (!entry.quality.sourceReadRequired || entry.quality.sourceReadStatus === 'PASSED' && entry.quality.canSubmit === true)));
  }

  /** "Use full image": keep the picture as selected and start its check; ends the crop step for this image. */
  useFullImage(entry: UploadEntry): void {
    if (this.disabled || this.destroyed || this.editingEntry !== entry || !this.files.includes(entry)) return;
    const wasReview = this.reviewing;
    entry.qualityState = 'queued';
    this.editingEntry = undefined; this.reviewing = false;
    if (wasReview) this.reviewDone++;
    this.advanceReview();
    this.updateReadiness();
    this.cropTrigger?.focus();
  }

  openCrop(entry: UploadEntry, event?: Event): void {
    if (this.disabled || this.destroyed || this.editingEntry || !entry.original || !this.files.includes(entry)) return;
    this.cropTrigger = event?.currentTarget as HTMLElement | undefined;
    this.reviewing = false;
    this.editingEntry = entry;
    this.readinessChange.emit(false);
  }

  /** Cancelling the first-time crop step keeps the original image and still runs its check. */
  cancelCrop(): void {
    if (this.reviewing && this.editingEntry) { this.useFullImage(this.editingEntry); return; }
    this.editingEntry = undefined;
    this.updateReadiness();
    this.cropTrigger?.focus();
  }

  applyCrop(entry: UploadEntry, crop: AppliedCrop): void {
    if (this.editingEntry !== entry) return;
    const wasReview = this.reviewing;
    if (!this.replaceCandidate(entry, crop.file, crop.rect)) return;
    if (wasReview) { this.reviewing = false; this.reviewDone++; this.advanceReview(); }
  }

  resetCrop(entry: UploadEntry): void {
    if (entry.original && !this.editingEntry) this.replaceCandidate(entry, entry.original);
  }

  private replaceCandidate(entry: UploadEntry, file: File, rect?: CropRect): boolean {
    if (this.disabled || this.destroyed || !this.files.includes(entry)) return false;
    if (!this.isFileAllowed(file) || file.size === 0) {
      this.validationError = 'The cropped image could not be prepared. Please try again.'; return false;
    }
    // Invalidate before notifying parents. Old task identity cannot accept a late response.
    if (this.active?.entry === entry) { this.active.request.unsubscribe(); this.active = undefined; }
    this.readinessChange.emit(false);
    if (entry.preview) URL.revokeObjectURL(entry.preview);
    entry.file = file; entry.name = file.name; entry.size = file.size;
    entry.preview = URL.createObjectURL(file); entry.crop = rect;
    entry.quality = undefined; entry.qualityError = undefined; entry.qualityState = 'queued';
    this.editingEntry = undefined; this.validationError = null;
    this.filesSelected.emit(this.files.map(item => item.file));
    this.updateReadiness();
    this.cropTrigger?.focus();
    return true;
  }

  retryQuality(entry: UploadEntry): void {
    if (this.disabled || this.destroyed || this.editingEntry === entry || this.active?.entry === entry || !this.files.includes(entry)
      || entry.quality?.sourceReadStatus === 'FAILED_IMAGE') return;
    entry.quality = undefined;
    entry.qualityError = undefined;
    entry.qualityState = 'queued';
    this.updateReadiness();
  }

  private updateReadiness(): void {
    if (this.destroyed) return;
    this.readinessChange.emit(this.ready);
    if (this.active) return;
    const entry = this.files.find(file => file.qualityState === 'queued' && file !== this.editingEntry);
    if (!entry) return;
    entry.qualityState = 'checking';
    const task = { entry, request: new Subscription() };
    this.active = task;
    task.request.add(this.preflight.check(entry.file, this.assignmentId).subscribe({
      next: result => {
        if (this.destroyed || this.active !== task || !this.files.includes(entry)) return;
        entry.quality = result;
        entry.qualityState = result.sourceReadStatus === 'CHECKING' ? 'checking' : 'done';
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
    if (task.entry.qualityState === 'checking') task.entry.qualityState = 'done';
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
    return !!file && file.size <= this.maxFileSizeBytes && this.fileKind(file) !== null;
  }

  private fileKind(file: File): 'image' | 'pdf' | null {
    if (!file) return null;
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    if (!this.allowedMimeTypes.has(file.type) && !this.allowedExtensions.has(ext)) return null;
    return file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name) ? 'image' : 'pdf';
  }
}
