import { Injectable, computed, inject, signal } from '@angular/core';
import { SpeakingApiService, type AudioConfig } from '../api/speaking-api.service';

/**
 * Whether speaking assignments are switched on (backend AUDIO_STT_ENABLED), for teacher pages. Off until loaded and whenever the
 * backend says so, so every page looks exactly as before while the feature is off. Loaded once.
 */
@Injectable({ providedIn: 'root' })
export class AudioConfigService {
  private readonly api = inject(SpeakingApiService);
  private readonly config = signal<AudioConfig>({ enabled: false });
  private loading: Promise<void> | null = null;

  readonly enabled = computed(() => this.config().enabled === true);
  /** The policy maximum in whole minutes (7 by default), never below 1. */
  readonly maxMinutes = computed(() => Math.max(1, Math.floor((this.config().maxDurationSeconds ?? 420) / 60)));
  readonly maxFileBytes = computed(() => this.config().maxFileBytes ?? 40 * 1024 * 1024);

  load(): Promise<void> {
    if (!this.loading) this.loading = this.api.getAudioConfig().then(config => this.config.set(config));
    return this.loading;
  }
}
