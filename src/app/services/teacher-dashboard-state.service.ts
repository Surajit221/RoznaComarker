import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, shareReplay, type Observable } from 'rxjs';

import type { SubmissionFeedback } from '../models/submission-feedback.model';
import type {
  DashboardSubmission,
  TeacherDashboardClassCard,
  TeacherDashboardNeedsAttentionItem,
  TeacherDashboardStats
} from '../models/dashboard-submission.model';
import { TeacherDashboardDataService } from './teacher-dashboard-data.service';

type TeacherDashboardState = {
  submissions: DashboardSubmission[];
  stats: TeacherDashboardStats;
  classCards: TeacherDashboardClassCard[];
  needsAttention: TeacherDashboardNeedsAttentionItem[];
  isLoaded: boolean;
};

const initialState: TeacherDashboardState = {
  submissions: [],
  stats: {
    pendingCount: 0,
    totalStudents: 0,
    avgScore: 0,
    activeClasses: 0
  },
  classCards: [],
  needsAttention: [],
  isLoaded: false
};

@Injectable({ providedIn: 'root' })
export class TeacherDashboardStateService {
  private readonly stateSubject = new BehaviorSubject<TeacherDashboardState>(initialState);

  readonly state$: Observable<TeacherDashboardState> = this.stateSubject.asObservable().pipe(shareReplay(1));

  readonly submissions$: Observable<DashboardSubmission[]> = this.state$.pipe(
    map((s) => s.submissions),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly pendingSubmissions$: Observable<DashboardSubmission[]> = this.submissions$.pipe(
    map((items) => (items || []).filter((x) => x.status === 'submitted')),
    shareReplay(1)
  );

  readonly pendingCount$: Observable<number> = this.pendingSubmissions$.pipe(
    map((items) => (items || []).length),
    shareReplay(1)
  );

  readonly pendingTodayCount$: Observable<number> = this.pendingSubmissions$.pipe(
    map((items) => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const todayKey = `${yyyy}-${mm}-${dd}`;

      return (items || []).filter((x) => {
        const raw = (x as any)?.submittedAt;
        if (!raw) return false;
        const t = new Date(raw);
        if (!Number.isFinite(t.getTime())) return false;
        const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        return key === todayKey;
      }).length;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly dashboardStats$: Observable<TeacherDashboardStats> = this.state$.pipe(
    map((s) => ({
      ...s.stats,
      pendingCount: (s.submissions || []).filter((x) => x.status === 'submitted').length
    })),
    shareReplay(1)
  );

  readonly classCards$: Observable<TeacherDashboardClassCard[]> = this.state$.pipe(
    map((s) => s.classCards || []),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly needsAttention$: Observable<TeacherDashboardNeedsAttentionItem[]> = this.state$.pipe(
    map((s) => s.needsAttention || []),
    distinctUntilChanged(),
    shareReplay(1)
  );

  private inFlightRefresh: Promise<void> | null = null;

  constructor(private data: TeacherDashboardDataService) {}

  ensureLoaded(): Promise<void> {
    const state = this.stateSubject.value;
    if (state.isLoaded) return Promise.resolve();
    return this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    this.inFlightRefresh = (async () => {
      try {
        const resp = await this.data.fetchDashboardData();
        const next: TeacherDashboardState = {
          submissions: Array.isArray(resp?.submissions) ? [...resp.submissions] : [],
          stats: resp?.stats || initialState.stats,
          classCards: Array.isArray((resp as any)?.classCards) ? [...(resp as any).classCards] : [],
          needsAttention: Array.isArray((resp as any)?.needsAttention) ? [...(resp as any).needsAttention] : [],
          isLoaded: true
        };
        this.stateSubject.next(next);
      } finally {
        this.inFlightRefresh = null;
      }
    })();

    return this.inFlightRefresh;
  }

  markReviewed(submissionId: string, feedback: SubmissionFeedback): void {
    if (!submissionId) return;

    const reviewed = !!feedback && (feedback as any).overriddenByTeacher === true;
    if (!reviewed) return;

    const scoreRaw = Number((feedback as any).overallScore);
    const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

    const state = this.stateSubject.value;
    const items = state.submissions || [];
    const idx = items.findIndex((x) => x.id === submissionId);
    if (idx < 0) {
      return;
    }

    const updated: DashboardSubmission = {
      ...items[idx],
      status: 'reviewed',
      score
    };

    const nextSubmissions = [...items.slice(0, idx), updated, ...items.slice(idx + 1)];

    const reviewedItems = nextSubmissions.filter((x) => x.status === 'reviewed');
    const avgScoreBase = reviewedItems.length
      ? reviewedItems.reduce((acc, s) => acc + (Number.isFinite(s.score) ? s.score : 0), 0) / reviewedItems.length
      : 0;

    const next: TeacherDashboardState = {
      ...state,
      submissions: nextSubmissions,
      stats: {
        ...state.stats,
        pendingCount: nextSubmissions.filter((x) => x.status === 'submitted').length,
        avgScore: Math.round(avgScoreBase * 10) / 10
      }
    };

    this.stateSubject.next(next);
  }
}
