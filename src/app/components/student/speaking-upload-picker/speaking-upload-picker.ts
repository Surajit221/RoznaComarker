import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { DeviceService } from '../../../services/device.service';
import type { SpeakingLimits } from '../../../api/speaking-api.service';
import { RECORDING_ACCEPT, checkRecordingFile } from '../../../utils/speaking-file-check';

/**
 * Choosing one recording (stage 7d): the essay drop zone's look and keyboard behaviour, for audio. The file is checked against the upload rules
 * at once (fixed messages); the checked file (neutral name) is emitted, or null when the choice is not usable.
 */
@Component({
  selector: 'app-speaking-upload-picker',
  imports: [CommonModule],
  templateUrl: './speaking-upload-picker.html',
  styleUrl: './speaking-upload-picker.css'
})
export class SpeakingUploadPicker {
  readonly device = inject(DeviceService);
  @Input() disabled = false;
  @Input() limits: SpeakingLimits | null = null;
  @Output() fileChosen = new EventEmitter<File | null>();
  @ViewChild('fileInput', { static: true }) fileInput!: ElementRef<HTMLInputElement>;

  readonly accept = RECORDING_ACCEPT;
  dragging = false;
  chosenName = '';
  chosenSize = '';
  error: string | null = null;

  open(event?: Event): void {
    event?.preventDefault();
    if (this.disabled) return;
    this.fileInput.nativeElement.click();
  }

  onInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) this.choose(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled) this.dragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file && !this.disabled) this.choose(file);
  }

  reset(): void {
    this.chosenName = '';
    this.chosenSize = '';
    this.error = null;
    this.dragging = false;
    this.fileInput.nativeElement.value = '';
  }

  private choose(file: File): void {
    const check = checkRecordingFile(file, { maxFileBytes: this.limits?.maxFileBytes, maxRecordingSeconds: this.limits?.maxRecordingSeconds });
    if (!check.ok) {
      this.chosenName = '';
      this.chosenSize = '';
      this.error = check.message;
      this.fileChosen.emit(null);
      return;
    }
    this.error = null;
    this.chosenName = file.name;
    this.chosenSize = file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    this.fileChosen.emit(check.file);
  }
}
