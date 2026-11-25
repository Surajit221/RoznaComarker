import { CommonModule } from '@angular/common';
import { Component, EventEmitter, InjectionToken, Input, type OnDestroy, Output, inject } from '@angular/core';
import { SpeakingUploadPicker } from '../../student/speaking-upload-picker/speaking-upload-picker';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import type { SpeakingLimits } from '../../../api/speaking-api.service';

/** One practice recording ready to send: recorded in the browser, or a chosen file. */
export interface PracticeRecording { blob: Blob; filename: string; durationSeconds: number | null; source: 'microphone' | 'file'; }

/** The browser's microphone and recorder, behind a token so tests (and browsers without them) can supply their own. */
export interface MediaRecording {
  supported(): boolean;
  getUserMedia(): Promise<MediaStream>;
  isTypeSupported(type: string): boolean;
  create(stream: MediaStream, mimeType?: string): MediaRecorder;
}
const browserMediaRecording: MediaRecording = {
  supported: () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function',
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  isTypeSupported: type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type),
  create: (stream, mimeType) => (mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream))
};
export const MEDIA_RECORDING = new InjectionToken<MediaRecording>('MEDIA_RECORDING', { providedIn: 'root', factory: () => browserMediaRecording });

// Chrome, Edge and Firefox record WebM/Opus (Firefox may say Ogg); Safari (iOS and macOS) records MP4/AAC. All are upload formats the server accepts.
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const EXTENSION: Readonly<Record<string, string>> = { 'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg' };
const UNSAVED_KEY = 'speaking-coach-recording';
const UNSAVED_MESSAGE = 'Your practice recording has not been sent yet. Leave and lose it?';
const TICK_MS = 250;

type RecorderState = 'idle' | 'requesting' | 'recording' | 'recorded';

/**
 * Recording one practice answer in the browser (Speaking Coach), with a file upload as the alternative (and the only way where the browser
 * cannot record or the microphone is blocked). Record is a toggle button (aria-pressed); a timer; it stops by itself at the task's longest
 * recording; the answer can be heard before it is sent. While a recording is in progress or not yet sent, the page counts as having unsaved
 * work. Fixed text only.
 */
@Component({
  selector: 'app-speaking-recorder',
  imports: [CommonModule, SpeakingUploadPicker],
  templateUrl: './speaking-recorder.html',
  styleUrl: './speaking-recorder.css'
})
export class SpeakingRecorder implements OnDestroy {
  private readonly media = inject(MEDIA_RECORDING);
  private readonly unsaved = inject(UnsavedWorkRegistry);

  @Input() maxSeconds = 90;
  @Input() minSeconds = 5;
  @Input() maxFileBytes = 20 * 1024 * 1024;
  @Input() disabled = false;
  @Output() recordingChange = new EventEmitter<PracticeRecording | null>();

  readonly supported = this.media.supported();
  state: RecorderState = 'idle';
  elapsedSeconds = 0;
  error: string | null = null;
  notice: string | null = null;
  announcement = '';
  previewUrl: string | null = null;
  showUpload = !this.supported;

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private baseType = '';

  get limits(): SpeakingLimits { return { maxRecordingSeconds: this.maxSeconds, minDurationSeconds: this.minSeconds, maxFileBytes: this.maxFileBytes }; }
  get recording(): boolean { return this.state === 'recording'; }
  get clock(): string { return format(this.elapsedSeconds); }
  get limitText(): string { return format(this.maxSeconds); }

  async toggle(): Promise<void> {
    if (this.disabled) return;
    if (this.state === 'recording') { this.stop(); return; }
    if (this.state === 'requesting') return;
    await this.start();
  }

  private async start(): Promise<void> {
    this.clearRecording();
    this.error = null;
    this.notice = null;
    this.state = 'requesting';
    try {
      this.stream = await this.media.getUserMedia();
    } catch (error) {
      this.state = 'idle';
      this.error = microphoneMessage(error);
      this.showUpload = true;
      return;
    }
    const chosen = CANDIDATE_TYPES.find(type => this.media.isTypeSupported(type));
    try {
      this.recorder = this.media.create(this.stream, chosen);
    } catch {
      this.release();
      this.state = 'idle';
      this.error = 'Recording could not start in this browser. Upload a recording instead.';
      this.showUpload = true;
      return;
    }
    this.baseType = String(chosen || this.recorder.mimeType || '').split(';')[0].trim().toLowerCase();
    this.chunks = [];
    this.recorder.ondataavailable = event => { if (event.data && event.data.size > 0) this.chunks.push(event.data); };
    this.recorder.onstop = () => this.finish();
    this.recorder.start();
    this.startedAt = Date.now();
    this.elapsedSeconds = 0;
    this.state = 'recording';
    this.announcement = 'Recording started.';
    this.unsaved.register(UNSAVED_KEY, UNSAVED_MESSAGE);
    this.timer = setInterval(() => {
      const ms = Date.now() - this.startedAt;
      this.elapsedSeconds = Math.min(this.maxSeconds, Math.floor(ms / 1000));
      if (ms >= this.maxSeconds * 1000) {
        this.notice = `You reached the longest recording for this task (${this.limitText}).`;
        this.stop();
      }
    }, TICK_MS);
  }

  stop(): void {
    if (this.state !== 'recording' || !this.recorder) return;
    this.elapsedSeconds = Math.min(this.maxSeconds, Math.round((Date.now() - this.startedAt) / 1000));
    this.stopTimer();
    this.recorder.stop();
  }

  private finish(): void {
    this.release();
    const seconds = this.elapsedSeconds;
    const extension = EXTENSION[this.baseType];
    const blob = new Blob(this.chunks, { type: this.baseType });
    this.chunks = [];
    this.recorder = null;
    if (!extension) return this.reject('This browser records in a format we cannot use. Upload a recording instead.', true);
    if (seconds < this.minSeconds) return this.reject(`Your recording is too short. Record at least ${this.minSeconds} seconds.`);
    if (blob.size > this.maxFileBytes) return this.reject('Your recording is too large. Record a shorter answer.');
    this.state = 'recorded';
    this.previewUrl = URL.createObjectURL(blob);
    this.announcement = `Recording stopped, ${format(seconds)}. Listen to it, then send it or record again.`;
    this.recordingChange.emit({ blob, filename: `practice${extension}`, durationSeconds: seconds, source: 'microphone' });
  }

  private reject(message: string, offerUpload = false): void {
    this.state = 'idle';
    this.error = message;
    this.announcement = message;
    if (offerUpload) this.showUpload = true;
    this.unsaved.clear(UNSAVED_KEY);
  }

  /** A file chosen in the upload picker (already checked against the upload rules), or null. */
  onFile(file: File | null): void {
    this.clearRecording();
    if (!file) { this.recordingChange.emit(null); return; }
    this.recordingChange.emit({ blob: file, filename: file.name, durationSeconds: null, source: 'file' });
  }

  /** Ready for a new answer (after sending, or "Record again"). */
  reset(): void {
    this.clearRecording();
    this.error = null;
    this.notice = null;
    this.recordingChange.emit(null);
  }

  private clearRecording(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    if (this.state === 'recorded') this.state = 'idle';
    this.elapsedSeconds = 0;
    this.unsaved.clear(UNSAVED_KEY);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private release(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.recorder && this.state === 'recording') {
      this.recorder.onstop = null;
      try { this.recorder.stop(); } catch { /* already stopped */ }
    }
    this.release();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.unsaved.clear(UNSAVED_KEY);
  }
}

function format(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function microphoneMessage(error: unknown): string {
  const name = (error as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow the microphone for this site in your browser settings, or upload a recording instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, or upload a recording instead.';
  return 'The microphone could not be started. Try again, or upload a recording instead.';
}
