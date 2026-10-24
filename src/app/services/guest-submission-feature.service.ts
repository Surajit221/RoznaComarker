import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class GuestSubmissionFeature {
  private http = inject(HttpClient);
  readonly enabled = signal(false);
  private pending: Promise<boolean> | null = null;
  load(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.enabled.set(false);
    this.pending = firstValueFrom(this.http.get<{ data: { enabled: boolean } }>(`${environment.apiUrl}/guest/status`).pipe(timeout(5000)))
      .then(response => response?.data?.enabled === true, () => false)
      .then(enabled => { this.enabled.set(enabled); return enabled; })
      .finally(() => { this.pending = null; });
    return this.pending;
  }
}
