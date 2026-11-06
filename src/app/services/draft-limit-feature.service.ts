import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DraftLimitConfig { enabled: boolean; min: number; max: number; default: number; }
const OFF: DraftLimitConfig = { enabled: false, min: 2, max: 10, default: 3 };

/**
 * Whether the teacher's assignment form offers "Maximum drafts" (backend DRAFT_LIMIT_ENABLED), and its bounds. Fails closed: any error or
 * malformed answer keeps the field hidden, so the form sends exactly what it sent before.
 */
@Injectable({ providedIn: 'root' })
export class DraftLimitFeature {
  private http = inject(HttpClient);
  readonly config = signal<DraftLimitConfig>(OFF);
  private pending: Promise<DraftLimitConfig> | null = null;

  load(): Promise<DraftLimitConfig> {
    if (this.pending) return this.pending;
    this.pending = firstValueFrom(this.http.get<{ data: DraftLimitConfig }>(`${environment.apiUrl}/assignments/draft-limit/config`).pipe(timeout(5000)))
      .then(response => {
        const data = response?.data;
        const valid = data && typeof data.enabled === 'boolean' && Number.isInteger(data.min) && Number.isInteger(data.max) && Number.isInteger(data.default);
        this.config.set(valid ? data : OFF);
        return this.config();
      }, () => { this.config.set(OFF); return OFF; })
      .finally(() => { this.pending = null; });
    return this.pending;
  }
}
