import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, shareReplay, type Observable } from 'rxjs';

import type { BackendAssignment } from '../api/assignment-api.service';
import type { BackendMe } from '../auth/auth.service';
import type { BackendMembership } from '../api/membership-api.service';
import type { BackendSubmission } from '../api/submission-api.service';
import type { SubmissionFeedback } from '../models/submission-feedback.model';
import { StudentDashboardDataService, type StudentDashboardData } from './student-dashboard-data.service';

export type StudentDashboardStats = {
  essaysDone: number;
  avgScore: number;
  activeClasses: number;
};

export type StudentDashboardLatestFeedback = {
  classId: string;
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  previewText: string;
  score: number;
  timestampLabel: string;
};

export type StudentDashboardClassCard = {
  classId: string;
  classTitle: string;
  teacherName: string;
  progressPct: number;
};

export type StudentDashboardUpcomingDeadline = {
  assignmentId: string;
  assignmentTitle: string;
  classTitle: string;
  dayLabel: string;
  timeLabel: string;
  isUrgent: boolean;
};

type StudentDashboardState = {
  me: BackendMe | null;
  memberships: BackendMembership[];
  assignments: BackendAssignment[];
  submissions: BackendSubmission[];
  feedbackBySubmissionId: Record<string, SubmissionFeedback | null>;
  isLoaded: boolean;
};

const initialState: StudentDashboardState = {
  me: null,
  memberships: [],
  assignments: [],
  submissions: [],
  feedbackBySubmissionId: {},
  isLoaded: false
};

@Injectable({ providedIn: 'root' })
export class StudentDashboardStateService {
  private readonly stateSubject = new BehaviorSubject<StudentDashboardState>(initialState);

  readonly state$: Observable<StudentDashboardState> = this.stateSubject.asObservable().pipe(shareReplay(1));

  readonly me$: Observable<BackendMe | null> = this.state$.pipe(
    map((s) => s.me),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly greetingName$: Observable<string> = this.me$.pipe(
    map((me) => (me?.displayName || me?.email || '').trim()),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly greetingFirstName$: Observable<string> = this.greetingName$.pipe(
    map((name) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return '';
      return trimmed.split(/\s+/)[0] || '';
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly memberships$: Observable<BackendMembership[]> = this.state$.pipe(
    map((s) => s.memberships || []),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly assignments$: Observable<BackendAssignment[]> = this.state$.pipe(
    map((s) => s.assignments || []),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly submissions$: Observable<BackendSubmission[]> = this.state$.pipe(
    map((s) => s.submissions || []),
    distinctUntilChanged(),
    shareReplay(1)
  );

  readonly stats$: Observable<StudentDashboardStats> = this.state$.pipe(
    map((s) => {
      const submissions = s.submissions || [];
      const essaysDone = submissions.filter((x) => {
        const status = (x as any)?.status;
        return status === 'submitted' || status === 'late';
      }).length;

      const feedbackList: SubmissionFeedback[] = Object.values(s.feedbackBySubmissionId || {}).filter(
        (fb): fb is SubmissionFeedback => !!fb
      );

      const scoreValues = feedbackList
        .map((fb) => Number((fb as any)?.overallScore))
        .filter((n) => Number.isFinite(n));

      const avgScoreBase = scoreValues.length ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;
      const avgScore = Math.round(avgScoreBase * 10) / 10;

      const activeClasses = (s.memberships || []).filter((m) => {
        const cls: any = (m as any)?.class;
        return !!cls && cls.isActive !== false;
      }).length;

      return {
        essaysDone,
        avgScore,
        activeClasses
      } satisfies StudentDashboardStats;
    }),
    shareReplay(1)
  );

  readonly latestFeedback$: Observable<StudentDashboardLatestFeedback | null> = this.state$.pipe(
    map((s) => {
      const submissions = s.submissions || [];
      const feedbackById = s.feedbackBySubmissionId || {};

      const candidates = submissions
        .map((sub) => {
          const id = sub?._id;
          if (!id) return null;
          const fb = feedbackById[id] || null;
          if (!fb) return null;

          const classRaw: any = (sub as any)?.class;
          const classId = typeof classRaw === 'string' ? classRaw : classRaw?._id;

          const createdAt = (fb as any)?.createdAt || (fb as any)?.updatedAt || null;
          const createdTs = createdAt ? new Date(createdAt).getTime() : NaN;

          const assignment: any = (sub as any)?.assignment;
          const assignmentId = typeof assignment === 'string' ? assignment : assignment?._id;
          const assignmentTitle = typeof assignment === 'object' && assignment ? assignment.title : '';

          const previewText =
            (typeof fb.teacherComments === 'string' && fb.teacherComments.trim()) ||
            (typeof fb.overallComments === 'string' && fb.overallComments.trim()) ||
            (typeof (fb as any)?.aiFeedback?.overallComments === 'string' && (fb as any).aiFeedback.overallComments.trim()) ||
            (typeof (fb as any)?.detailedFeedback === 'string' && String((fb as any).detailedFeedback).trim()) ||
            '';

          const scoreRaw = Number((fb as any)?.overallScore);
          const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

          return {
            classId: typeof classId === 'string' ? classId : '',
            submissionId: id,
            assignmentId: typeof assignmentId === 'string' ? assignmentId : '',
            assignmentTitle: typeof assignmentTitle === 'string' ? assignmentTitle : '',
            previewText,
            score,
            createdTs
          };
        })
        .filter(Boolean) as Array<{
        classId: string;
        submissionId: string;
        assignmentId: string;
        assignmentTitle: string;
        previewText: string;
        score: number;
        createdTs: number;
      }>;

      candidates.sort((a, b) => (Number.isFinite(b.createdTs) ? b.createdTs : 0) - (Number.isFinite(a.createdTs) ? a.createdTs : 0));

      const top = candidates[0];
      if (!top) return null;

      return {
        classId: top.classId,
        submissionId: top.submissionId,
        assignmentId: top.assignmentId,
        assignmentTitle: top.assignmentTitle,
        previewText: top.previewText,
        score: top.score,
        timestampLabel: this.toRelativeLabel(top.createdTs)
      } satisfies StudentDashboardLatestFeedback;
    }),
    shareReplay(1)
  );

  readonly classCards$: Observable<StudentDashboardClassCard[]> = this.state$.pipe(
    map((s) => {
      const memberships = s.memberships || [];
      const assignments = s.assignments || [];
      const submissions = s.submissions || [];

      const submittedAssignmentIds = new Set<string>();
      for (const sub of submissions) {
        const assignment: any = (sub as any)?.assignment;
        const assignmentId = typeof assignment === 'string' ? assignment : assignment?._id;
        if (typeof assignmentId !== 'string' || !assignmentId) continue;

        const status = (sub as any)?.status;
        if (status === 'submitted' || status === 'late') {
          submittedAssignmentIds.add(assignmentId);
        }
      }

      const assignmentsByClass = new Map<string, string[]>();
      for (const a of assignments) {
        const cls: any = (a as any)?.class;
        const classId = typeof cls === 'string' ? cls : cls?._id;
        if (typeof classId !== 'string' || !classId) continue;

        const list = assignmentsByClass.get(classId);
        const id = (a as any)?._id;
        if (!id) continue;

        if (list) {
          list.push(String(id));
        } else {
          assignmentsByClass.set(classId, [String(id)]);
        }
      }

      const cards: StudentDashboardClassCard[] = memberships
        .map((m) => {
          const cls: any = (m as any)?.class;
          const classId = cls?._id;
          if (!classId) return null;

          const classTitle = typeof cls?.name === 'string' ? cls.name : '';
          const teacher = cls?.teacher;
          const teacherName = (teacher && (teacher.displayName || teacher.email)) || '';

          const assignmentIds = assignmentsByClass.get(String(classId)) || [];
          const total = assignmentIds.length;
          const submitted = assignmentIds.filter((id) => submittedAssignmentIds.has(id)).length;
          const progressPctBase = total > 0 ? (submitted / total) * 100 : 0;
          const progressPct = Math.max(0, Math.min(100, Math.round(progressPctBase)));

          return {
            classId: String(classId),
            classTitle,
            teacherName,
            progressPct
          } satisfies StudentDashboardClassCard;
        })
        .filter(Boolean) as StudentDashboardClassCard[];

      return cards;
    }),
    shareReplay(1)
  );

  readonly upcomingDeadlines$: Observable<StudentDashboardUpcomingDeadline[]> = this.state$.pipe(
    map((s) => {
      const now = Date.now();
      const submissions = s.submissions || [];
      const assignments = s.assignments || [];

      const submittedAssignmentIds = new Set<string>();
      for (const sub of submissions) {
        const assignment: any = (sub as any)?.assignment;
        const assignmentId = typeof assignment === 'string' ? assignment : assignment?._id;
        if (typeof assignmentId === 'string' && assignmentId) {
          const status = (sub as any)?.status;
          if (status === 'submitted' || status === 'late') {
            submittedAssignmentIds.add(assignmentId);
          }
        }
      }

      const upcoming = assignments
        .map((a) => {
          const deadlineRaw = (a as any)?.deadline;
          const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
          if (!deadline || !Number.isFinite(deadline.getTime())) return null;

          if (deadline.getTime() <= now) return null;

          const assignmentId = (a as any)?._id;
          if (!assignmentId) return null;

          if (submittedAssignmentIds.has(String(assignmentId))) return null;

          const assignmentTitle = typeof (a as any)?.title === 'string' ? (a as any).title : '';

          const cls: any = (a as any)?.class;
          const classTitle = typeof cls?.name === 'string' ? cls.name : '';

          const diffMs = deadline.getTime() - now;
          const isUrgent = diffMs <= 24 * 60 * 60 * 1000;

          const { dayLabel, timeLabel } = this.toDayTimeLabel(deadline);

          return {
            assignmentId: String(assignmentId),
            assignmentTitle,
            classTitle,
            dayLabel,
            timeLabel,
            isUrgent,
            ts: deadline.getTime()
          };
        })
        .filter(Boolean) as Array<StudentDashboardUpcomingDeadline & { ts: number }>;

      upcoming.sort((a, b) => a.ts - b.ts);

      return upcoming.map(({ ts, ...rest }) => rest);
    }),
    shareReplay(1)
  );

  private inFlightRefresh: Promise<void> | null = null;

  constructor(private data: StudentDashboardDataService) {}

  ensureLoaded(): Promise<void> {
    const state = this.stateSubject.value;
    if (state.isLoaded) return Promise.resolve();
    return this.refresh();
  }

  refresh(): Promise<void> {
    if (this.inFlightRefresh) return this.inFlightRefresh;

    this.inFlightRefresh = (async () => {
      try {
        const resp: StudentDashboardData = await this.data.fetchDashboardData();

        const next: StudentDashboardState = {
          me: resp?.me || null,
          memberships: Array.isArray(resp?.memberships) ? [...resp.memberships] : [],
          assignments: Array.isArray(resp?.assignments) ? [...resp.assignments] : [],
          submissions: Array.isArray(resp?.submissions) ? [...resp.submissions] : [],
          feedbackBySubmissionId: resp?.feedbackBySubmissionId || {},
          isLoaded: true
        };

        this.stateSubject.next(next);
      } finally {
        this.inFlightRefresh = null;
      }
    })();

    return this.inFlightRefresh;
  }

  private toRelativeLabel(ts: number): string {
    if (!Number.isFinite(ts)) return '';

    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  }

  private toDayTimeLabel(date: Date): { dayLabel: string; timeLabel: string } {
    const now = new Date();

    const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const todayKey = toKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = toKey(tomorrow);

    const targetKey = toKey(date);

    let dayLabel = date.toLocaleDateString(undefined, { weekday: 'short' });
    dayLabel = (dayLabel || '').slice(0, 3);

    if (targetKey === todayKey) dayLabel = 'Today';
    else if (targetKey === tomorrowKey) dayLabel = 'Tom';

    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');

    return { dayLabel, timeLabel: `${hh}:${mm}` };
  }
}
