import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { BackendNotification } from '../api/notification-api.service';

@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private source: EventSource | null = null;
  private readonly notificationSubject = new Subject<BackendNotification>();

  constructor(private auth: AuthService) {}

  get notifications$(): Observable<BackendNotification> {
    return this.notificationSubject.asObservable();
  }

  connect(): void {
    if (this.source) return;

    const token = this.auth.getBackendJwt();
    if (!token) return;

    // Exchange the long-lived JWT for a one-time SSE token via Authorization
    // header so the JWT never appears in URLs, logs, or browser history.
    fetch(`${environment.apiUrl}/api/auth/sse-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(resp.status)))
      .then((data: { sseToken?: string }) => {
        if (this.source) return; // reconnect raced
        const sseToken = data && data.sseToken;
        if (!sseToken) return;
        const url = `${environment.apiUrl}/api/notifications/stream?sseToken=${encodeURIComponent(sseToken)}`;
        this.openEventSource(url);
      })
      .catch(() => {
        // Silent fail; UI will operate without realtime updates.
      });
  }

  private openEventSource(url: string): void {
    this.source = new EventSource(url);

    this.source.addEventListener('notification', (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed && typeof parsed === 'object') {
          this.notificationSubject.next(parsed as BackendNotification);
        }
      } catch {
        // ignore
      }
    });

    this.source.addEventListener('error', () => {
      // Browser will auto-retry; if it gets stuck, allow manual reconnect
    });
  }

  disconnect(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
