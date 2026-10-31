import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

// 'unavailable' = the status call failed, timed out or returned something malformed.
// Only an explicit backend answer produces 'enabled' or 'disabled'.
export type GuestFeatureState = 'unknown' | 'enabled' | 'disabled' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class GuestSubmissionFeature {
  private http = inject(HttpClient);
  // Last known availability. Not reset while a refresh is pending or when it fails, so a form that is
  // already showing the option never loses it mid-edit.
  readonly enabled = signal(false);
  readonly state = signal<GuestFeatureState>('unknown');
  private pending: Promise<boolean> | null = null;

  /** Refreshes availability. Resolves false on any failure (fail closed for guest entry). */
  load(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.pending = firstValueFrom(this.http.get<{ data: { enabled: boolean } }>(`${environment.apiUrl}/guest/status`).pipe(timeout(5000)))
      .then(response => {
        const enabled = response?.data?.enabled;
        if (typeof enabled !== 'boolean') { this.state.set('unavailable'); return false; }
        this.enabled.set(enabled); this.state.set(enabled ? 'enabled' : 'disabled');
        return enabled;
      }, () => { this.state.set('unavailable'); return false; })
      .finally(() => { this.pending = null; });
    return this.pending;
  }

  /** Waits for an in-flight check, or retries once when availability is not yet confirmed. */
  async settled(): Promise<GuestFeatureState> {
    if (this.pending) await this.pending;
    else if (this.state() === 'unknown' || this.state() === 'unavailable') await this.load();
    return this.state();
  }
}
