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

    const url = `${environment.apiUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`;

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
