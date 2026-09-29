import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { BackendNotification } from '../api/notification-api.service';

@Injectable({ providedIn: 'root' })
export class NotificationRealtimeService {
  private source: EventSource | null = null;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private enabled = false;
  private readonly notificationSubject = new Subject<BackendNotification>();
  private readonly eventSubject = new Subject<{ type: string; data: any }>();

  constructor(private auth: AuthService) {}

  get notifications$(): Observable<BackendNotification> {
    return this.notificationSubject.asObservable();
  }

  get events$(): Observable<{ type: string; data: any }> {
    return this.eventSubject.asObservable();
  }

  connect(): void {
    this.enabled = true;
    if (this.source || this.connecting || this.reconnectTimer) return;

    const token = this.auth.getBackendJwt();
    if (!token) return;

    // Exchange the long-lived JWT for a one-time SSE token via Authorization
    // header so the JWT never appears in URLs, logs, or browser history.
    this.connecting = true;
    fetch(`${environment.apiUrl}/auth/sse-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(resp.status)))
      .then((data: { sseToken?: string }) => {
        if (this.source || !this.enabled) return;
        const sseToken = data && data.sseToken;
        if (!sseToken) { this.scheduleReconnect(); return; }
        const url = `${environment.apiUrl}/notifications/stream?sseToken=${encodeURIComponent(sseToken)}`;
        this.openEventSource(url);
      })
      .catch(() => this.scheduleReconnect())
      .finally(() => { this.connecting = false; });
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer) return;
    const delay = Math.min(60_000, 2_000 * (2 ** Math.min(this.reconnectAttempt++, 5)));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(); // Always obtain a fresh one-time token.
    }, delay);
  }

  private openEventSource(url: string): void {
    const source = new EventSource(url);
    this.source = source;
    source.addEventListener('open', () => { if (this.source === source) this.reconnectAttempt = 0; });

    source.addEventListener('notification', (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed && typeof parsed === 'object') {
          this.notificationSubject.next(parsed as BackendNotification);
        }
      } catch {
        // ignore
      }
    });

    for (const type of ['credits_updated', 'assignment_report_updated', 'teacher_activity_invalidated', 'institution_updated', 'pricing_config_updated']) {
      source.addEventListener(type, (ev: MessageEvent) => {
        try {
          this.eventSubject.next({ type, data: JSON.parse(ev.data) });
        } catch {
          // Ignore malformed event payloads.
        }
      });
    }

    source.addEventListener('error', () => {
      // EventSource would retry the already-consumed one-time token forever.
      if (this.source !== source) return;
      source.close();
      this.source = null;
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    this.enabled = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
