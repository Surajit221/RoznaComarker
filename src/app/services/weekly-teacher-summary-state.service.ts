import { Injectable } from '@angular/core';
import { BehaviorSubject, shareReplay } from 'rxjs';
import { TeacherActivityApiService, type WeeklyTeacherSummary } from '../api/teacher-activity-api.service';
import { NotificationRealtimeService } from './notification-realtime.service';

export type WeeklySummaryState = { data: WeeklyTeacherSummary | null; loading: boolean; error: boolean };

@Injectable({ providedIn: 'root' })
export class WeeklyTeacherSummaryStateService {
  private readonly subject = new BehaviorSubject<WeeklySummaryState>({ data: null, loading: false, error: false });
  private inFlight: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  readonly state$ = this.subject.asObservable().pipe(shareReplay(1));

  constructor(private api: TeacherActivityApiService, realtime: NotificationRealtimeService) {
    realtime.notifications$.subscribe((notification) => {
      if (!['assignment_submitted', 'adaptive_completed'].includes(notification?.type || '')) return;
      this.scheduleRefresh();
    });
    realtime.events$.subscribe((event) => {
      if (event?.type === 'teacher_activity_invalidated') this.scheduleRefresh();
    });
  }

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.subject.next({ ...this.subject.value, loading: true, error: false });
    this.inFlight = this.api.getWeeklySummary().then((data) => this.subject.next({ data, loading: false, error: false }))
      .catch(() => this.subject.next({ ...this.subject.value, loading: false, error: true }))
      .finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private scheduleRefresh(): void {
    if (!this.subject.value.data || this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => { this.refreshTimer = null; void this.refresh(); }, 750);
  }
}
