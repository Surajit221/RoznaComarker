import { Component, Input, type OnChanges, type OnDestroy, type SimpleChanges, inject } from '@angular/core';
import { SpeakingApiService } from '../../../api/speaking-api.service';

const EXTENSION: Readonly<Record<string, string>> = Object.freeze({ 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav' });

/**
 * One recording with the browser's own player (stage 7e). The audio is fetched through the signed-in client as a blob (never a public link), so
 * a loading line shows until it has arrived; every object URL made here is revoked when it is replaced or the player goes away. The teacher can
 * also download the file (the private download route).
 */
@Component({
  selector: 'app-speaking-audio-player',
  templateUrl: './speaking-audio-player.html',
  styleUrl: './speaking-audio-player.css'
})
export class SpeakingAudioPlayer implements OnChanges, OnDestroy {
  private readonly api = inject(SpeakingApiService);
  @Input({ required: true }) submissionId!: string;
  /** The player's accessible name: "Your recording" or "Recording by {name}". */
  @Input() label = 'Recording';
  @Input() durationSeconds: number | null = null;
  /** False when the audio is no longer kept. */
  @Input() available = true;
  @Input() downloadable = false;

  state: 'loading' | 'ready' | 'error' = 'loading';
  url: string | null = null;
  downloading = false;
  downloadError = false;
  private generation = 0;

  get durationText(): string {
    const seconds = this.durationSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] || changes['available']) void this.load();
  }

  ngOnDestroy(): void {
    this.generation++;
    this.release();
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.release();
    if (!this.available || !this.submissionId) return;
    this.state = 'loading';
    try {
      const blob = await this.api.getRecordingBlob(this.submissionId);
      if (generation !== this.generation) return;
      this.url = URL.createObjectURL(blob);
      this.state = 'ready';
    } catch {
      if (generation === this.generation) this.state = 'error';
    }
  }

  async download(): Promise<void> {
    if (this.downloading) return;
    this.downloading = true;
    this.downloadError = false;
    try {
      const blob = await this.api.downloadRecordingBlob(this.submissionId);
      const link = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.download = `speaking-recording.${EXTENSION[blob.type] ?? 'audio'}`;
      anchor.click();
      URL.revokeObjectURL(link);
    } catch {
      this.downloadError = true;
    } finally {
      this.downloading = false;
    }
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
