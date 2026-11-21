import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, type OnChanges, type OnDestroy, Output, type SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import type { Subscription } from 'rxjs';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';
import { BottomsheetDialog } from '../../../shared/bottomsheet-dialog/bottomsheet-dialog';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { SpeakingApiService, newRecordingRequestId, type SpeakingLimits, type StudentSpeakingSubmission } from '../../../api/speaking-api.service';
import { SPEAKING_GENERIC_MESSAGE, speakingErrorMessage } from '../../../utils/speaking-messages';
import { SpeakingUploadPicker } from '../speaking-upload-picker/speaking-upload-picker';

export interface SpeakingUploadTarget { id: string; title: string; instructions?: string; deadline?: string; }

/** The notice approved for the upload dialog (stage 7a, question 9). */
export const SPEAKING_UPLOAD_NOTICE = 'Your recording is saved with this assignment so your teacher can listen to it. It is turned into text by a '
  + 'speech-to-text service and marked with AI to help your teacher. Only you and your teacher can play it.';
const UNSAVED_KEY = 'speaking-upload';
const UNSAVED_MESSAGE = 'Your recording is still uploading. Leave and cancel the upload?';

/**
 * Uploading (or replacing) a speaking recording (stage 7d): the essay upload dialog's layout, as a modal on desktop and a bottom sheet on
 * phones and tablets. One upload reference per chosen file, reused when the same file is tried again (the server then answers with the stored
 * result instead of saving it twice). While the upload runs the page counts as having unsaved work, and the dialog cannot be dismissed by
 * the backdrop; Cancel aborts it.
 */
@Component({
  selector: 'app-speaking-upload-dialog',
  imports: [CommonModule, ModalDialog, BottomsheetDialog, SpeakingUploadPicker],
  templateUrl: './speaking-upload-dialog.html',
  styleUrl: './speaking-upload-dialog.css'
})
export class SpeakingUploadDialog implements OnChanges, OnDestroy {
  readonly device = inject(DeviceService);
  private readonly api = inject(SpeakingApiService);
  private readonly alert = inject(AlertService);
  private readonly unsaved = inject(UnsavedWorkRegistry);

  @Input() open = false;
  @Input() assignment: SpeakingUploadTarget | null = null;
  @Input() limits: SpeakingLimits | null = null;
  @Input() replacing = false;
  @Output() closed = new EventEmitter<void>();
  @Output() uploaded = new EventEmitter<StudentSpeakingSubmission>();
  @ViewChild(SpeakingUploadPicker) picker?: SpeakingUploadPicker;

  readonly notice = SPEAKING_UPLOAD_NOTICE;
  file: File | null = null;
  uploading = false;
  progress: number | null = null;
  error: string | null = null;
  private requestId: string | null = null;
  private subscription: Subscription | null = null;
  private sheetLocked = false;

  get sheet(): boolean { return this.device.isMobile() || this.device.isTablet(); }
  get title(): string { return this.replacing ? 'Replace Recording' : 'Upload Recording'; }
  get limitsLine(): string {
    const megabytes = Math.round((this.limits?.maxFileBytes ?? 40 * 1024 * 1024) / (1024 * 1024));
    const minutes = Math.max(1, Math.round((this.limits?.maxRecordingSeconds ?? 420) / 60));
    return `MP3, M4A, WebM, Ogg or WAV · Maximum ${megabytes} MB · Up to ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) this.lockPage(this.open && this.sheet);
  }

  ngOnDestroy(): void {
    this.abort();
    this.lockPage(false);
  }

  onFile(file: File | null): void {
    if (this.uploading) return;
    if (file !== this.file) this.requestId = null;
    this.file = file;
    this.error = null;
    this.progress = null;
  }

  upload(): void {
    const assignmentId = this.assignment?.id;
    if (!this.file || !assignmentId || this.uploading) return;
    this.requestId ??= newRecordingRequestId();
    this.uploading = true;
    this.error = null;
    this.progress = 0;
    this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE);
    this.subscription = this.api.uploadRecording(assignmentId, this.file, this.requestId).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progress = event.total ? Math.min(100, Math.max(0, Math.round((100 * event.loaded) / event.total))) : 0;
        } else if (event.type === HttpEventType.Response) {
          const saved = event.body?.success === true ? event.body.data : null;
          this.finish();
          if (!saved) { this.error = SPEAKING_GENERIC_MESSAGE; this.progress = null; return; }
          this.progress = 100;
          this.alert.showToast('Recording uploaded', 'success');
          this.uploaded.emit(saved);
          this.resetChoice();
        }
      },
      error: error => {
        this.finish();
        this.progress = null;
        this.error = speakingErrorMessage(error, { maxFileBytes: this.limits?.maxFileBytes, maxRecordingSeconds: this.limits?.maxRecordingSeconds });
      }
    });
  }

  /** Cancel, the close button, Escape or the backdrop: aborts a running upload and closes. */
  cancel(): void {
    this.abort();
    this.resetChoice();
    this.closed.emit();
  }

  private finish(): void {
    this.uploading = false;
    this.subscription = null;
    this.unsaved.clear(UNSAVED_KEY);
  }

  private abort(): void {
    this.subscription?.unsubscribe();
    if (this.uploading) this.finish();
  }

  private resetChoice(): void {
    this.file = null;
    this.requestId = null;
    this.error = null;
    this.progress = null;
    this.picker?.reset();
  }

  private lockPage(lock: boolean): void {
    if (lock === this.sheetLocked || typeof document === 'undefined') return;
    this.sheetLocked = lock;
    document.body.classList.toggle('overflow-hidden', lock);
  }
}
