import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, shareReplay } from 'rxjs';
import { TeacherActivityApiService, type TeacherActivitySummary } from '../api/teacher-activity-api.service';
import { NotificationRealtimeService } from './notification-realtime.service';

export type TeacherActivityState = {
  data: TeacherActivitySummary | null;
  loading: boolean;
  error: boolean;
};

@Injectable({ providedIn: 'root' })
export class TeacherActivityStateService {
  private readonly subject = new BehaviorSubject<TeacherActivityState>({ data: null, loading: false, error: false });
  private readonly handledNotifications = new Set<string>();
  private readonly handledReviews = new Set<string>();
  private readonly handledAdaptiveCompletions = new Set<string>();
  private loadedAckToken: string | null = null;
  private readonly acknowledgedTokens = new Set<string>();
  private acknowledgementInFlight: Promise<boolean> | null = null;
  private acknowledgementInFlightToken: string | null = null;
  private inFlight: Promise<void> | null = null;
  readonly state$ = this.subject.asObservable().pipe(shareReplay(1));
  readonly hasActivity$ = this.state$.pipe(map(({ data }) => Boolean(data && (
    data.sinceLastVisit.newSubmissions || data.sinceLastVisit.revisedDrafts || data.sinceLastVisit.adaptiveCompletions
  ))), distinctUntilChanged(), shareReplay(1));

  constructor(private api: TeacherActivityApiService, realtime: NotificationRealtimeService) {
    realtime.notifications$.subscribe((notification) => {
      if (notification?.type !== 'assignment_submitted' || !this.subject.value.data) return;
      if (notification._id && this.handledNotifications.has(notification._id)) return;
      if (notification._id) this.handledNotifications.add(notification._id);
      const data = this.subject.value.data;
      const revised = Number(notification.data?.['draftNumber'] || 1) > 1;
      this.subject.next({ ...this.subject.value, data: {
        ...data,
        sinceLastVisit: {
          ...data.sinceLastVisit,
          newSubmissions: data.sinceLastVisit.newSubmissions + (revised ? 0 : 1),
          revisedDrafts: data.sinceLastVisit.revisedDrafts + (revised ? 1 : 0)
        },
        current: { waitingForReview: data.current.waitingForReview + (notification.data?.['waitingReviewAdded'] === false ? 0 : 1) }
      } });
    });
    realtime.events$.subscribe((event) => {
      if (event?.type !== 'teacher_activity_invalidated') return;
      if (event.data?.type === 'review_completed') {
        this.markReviewed(String(event.data?.submissionId || ''));
        return;
      }
      if (event.data?.type !== 'adaptive_completion') return;
      const completionId = String(event.data?.sessionId || '').trim();
      if (!completionId || !this.rememberBounded(this.handledAdaptiveCompletions, completionId)) return;
      const data = this.subject.value.data;
      if (!data) return;
      this.subject.next({ ...this.subject.value, data: { ...data, sinceLastVisit: {
        ...data.sinceLastVisit, adaptiveCompletions: data.sinceLastVisit.adaptiveCompletions + 1
      } } });
    });
  }

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.subject.next({ ...this.subject.value, loading: true, error: false });
    this.inFlight = (async () => {
      try {
        const data = await this.api.getSummary();
        this.loadedAckToken = data.ackToken;
        this.subject.next({ data, loading: false, error: false });
      } catch {
        this.subject.next({ ...this.subject.value, loading: false, error: true });
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  acknowledgeDisplayedSummary(): Promise<boolean> {
    const token = this.loadedAckToken;
    if (!token) return Promise.resolve(false);
    if (this.acknowledgedTokens.has(token)) return Promise.resolve(true);
    if (this.acknowledgementInFlight && this.acknowledgementInFlightToken === token) {
      return this.acknowledgementInFlight;
    }

    this.acknowledgementInFlightToken = token;
    this.acknowledgementInFlight = this.api.acknowledge(token)
      .then(() => {
        this.rememberBounded(this.acknowledgedTokens, token, 20);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (this.acknowledgementInFlightToken === token) {
          this.acknowledgementInFlight = null;
          this.acknowledgementInFlightToken = null;
        }
      });
    return this.acknowledgementInFlight;
  }

  private rememberBounded(set: Set<string>, key: string, maximum = 200): boolean {
    if (set.has(key)) return false;
    set.add(key);
    while (set.size > maximum) {
      const oldest = set.values().next().value as string | undefined;
      if (!oldest) break;
      set.delete(oldest);
    }
    return true;
  }

  markReviewed(submissionId = ''): void {
    if (submissionId && this.handledReviews.has(submissionId)) return;
    if (submissionId) this.handledReviews.add(submissionId);
    const data = this.subject.value.data;
    if (!data || data.current.waitingForReview < 1) return;
    this.subject.next({ ...this.subject.value, data: { ...data,
      current: { waitingForReview: data.current.waitingForReview - 1 }
    } });
  }
}
