import { Injectable } from '@angular/core';

import { AssignmentApiService } from '../api/assignment-api.service';
import { ClassApiService, type BackendClassSummary } from '../api/class-api.service';
import { FeedbackApiService } from '../api/feedback-api.service';
import { SubmissionApiService, type BackendSubmission } from '../api/submission-api.service';

import type {
  DashboardSubmission,
  TeacherDashboardClassCard,
  TeacherDashboardNeedsAttentionItem,
  TeacherDashboardStats
} from '../models/dashboard-submission.model';

type TeacherDashboardData = {
  submissions: DashboardSubmission[];
  stats: TeacherDashboardStats;
  classCards: TeacherDashboardClassCard[];
  needsAttention: TeacherDashboardNeedsAttentionItem[];
};

@Injectable({ providedIn: 'root' })
export class TeacherDashboardDataService {
  constructor(
    private assignmentApi: AssignmentApiService,
    private classApi: ClassApiService,
    private submissionApi: SubmissionApiService,
    private feedbackApi: FeedbackApiService
  ) {}

  async fetchDashboardData(): Promise<TeacherDashboardData> {
    const classes = await this.classApi.getMyTeacherClasses();
    const classIds = (classes || []).map((c) => c._id).filter(Boolean);

    const classSummaries: BackendClassSummary[] = await Promise.all(
      classIds.map(async (classId) => {
        try {
          return await this.classApi.getClassSummary(classId);
        } catch {
          return null as any;
        }
      })
    ).then((arr) => arr.filter(Boolean));

    const assignmentsByClass = await Promise.all(
      (classes || []).map(async (c: any) => {
        const classId = c?._id;
        if (!classId) return null;

        try {
          const list = await this.assignmentApi.getClassAssignments(classId);
          return {
            classId,
            classTitle: typeof c?.name === 'string' ? c.name : (typeof c?.title === 'string' ? c.title : ''),
            assignments: list || []
          };
        } catch {
          return {
            classId,
            classTitle: typeof c?.name === 'string' ? c.name : (typeof c?.title === 'string' ? c.title : ''),
            assignments: []
          };
        }
      })
    ).then((arr) => arr.filter(Boolean) as Array<{ classId: string; classTitle: string; assignments: any[] }>);

    const submissionsByAssignment: DashboardSubmission[][] = await Promise.all(
      assignmentsByClass.flatMap((bucket) =>
        (bucket.assignments || []).map(async (a: any) => {
          const assignmentId = a?._id;
          if (!assignmentId) return [];

          const meta = {
            assignmentId: assignmentId,
            assignmentTitle: typeof a?.title === 'string' ? a.title : '',
            classId: bucket.classId,
            classTitle: bucket.classTitle
          };

          let list: BackendSubmission[] = [];
          try {
            list = await this.submissionApi.getSubmissionsByAssignment(assignmentId);
          } catch {
            list = [];
          }

          return this.mapSubmissionsForAssignment(list || [], meta);
        })
      )
    );

    const submissions = submissionsByAssignment.flat();

    const classSummaryById = new Map<string, BackendClassSummary>();
    for (const s of classSummaries || []) {
      const id = (s as any)?._id;
      if (typeof id === 'string' && id) {
        classSummaryById.set(id, s);
      }
    }

    const todayKey = (() => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    const classCards: TeacherDashboardClassCard[] = (assignmentsByClass || []).map((bucket) => {
      const studentsCountRaw = classSummaryById.get(bucket.classId)?.studentsCount;
      const studentsCount = Number.isFinite(studentsCountRaw as any) ? Number(studentsCountRaw) : 0;

      const deadlinesTodayCount = (bucket.assignments || []).filter((a: any) => {
        const deadline = a?.deadline;
        if (!deadline) return false;
        const d = new Date(deadline);
        if (!Number.isFinite(d.getTime())) return false;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` === todayKey;
      }).length;

      return {
        id: bucket.classId,
        title: bucket.classTitle,
        studentsCount,
        deadlinesTodayCount
      } satisfies TeacherDashboardClassCard;
    });

    const MIN_SCORE_NEEDS_ATTENTION = 60;
    const reviewedByStudent = new Map<string, { name: string; scores: number[] }>();
    for (const s of submissions) {
      if (s.status !== 'reviewed') continue;
      const studentId = s.student?.id;
      if (!studentId) continue;
      const score = Number(s.score);
      if (!Number.isFinite(score)) continue;

      const prev = reviewedByStudent.get(studentId);
      if (prev) {
        prev.scores.push(score);
      } else {
        reviewedByStudent.set(studentId, {
          name: s.student?.name || 'Student',
          scores: [score]
        });
      }
    }

    const needsAttention: TeacherDashboardNeedsAttentionItem[] = Array.from(reviewedByStudent.entries())
      .map(([studentId, v]) => {
        const avg = v.scores.length ? v.scores.reduce((a, b) => a + b, 0) / v.scores.length : 0;
        const avgScore = Math.round(avg);
        const trimmedName = (v.name || '').trim();
        const initial = trimmedName ? trimmedName[0].toUpperCase() : 'S';
        return {
          studentId,
          studentName: trimmedName || 'Student',
          studentInitial: initial,
          avgScore
        } satisfies TeacherDashboardNeedsAttentionItem;
      })
      .filter((x) => x.avgScore < MIN_SCORE_NEEDS_ATTENTION)
      .sort((a, b) => a.avgScore - b.avgScore);

    const activeClasses = classIds.length;
    const totalStudents = classSummaries.reduce((acc, s) => acc + (Number.isFinite(s?.studentsCount) ? s.studentsCount : 0), 0);

    const reviewed = submissions.filter((s) => s.status === 'reviewed');
    const avgScoreBase = reviewed.length ? reviewed.reduce((acc, s) => acc + (Number.isFinite(s.score) ? s.score : 0), 0) / reviewed.length : 0;

    const stats: TeacherDashboardStats = {
      pendingCount: submissions.filter((s) => s.status === 'submitted').length,
      totalStudents,
      avgScore: Math.round(avgScoreBase * 10) / 10,
      activeClasses
    };

    return { submissions, stats, classCards, needsAttention };
  }

  private async mapSubmissionsForAssignment(
    list: BackendSubmission[],
    assignmentMeta: {
      assignmentId: string;
      assignmentTitle: string;
      classId: string;
      classTitle: string;
    }
  ): Promise<DashboardSubmission[]> {
    const mapped = await Promise.all(
      (list || []).map(async (s) => {
        const student: any = s && (s as any).student;
        const submissionId = s._id;

        let status: 'submitted' | 'reviewed' = 'submitted';
        let score = 0;

        if (submissionId) {
          try {
            const fb = await this.feedbackApi.getSubmissionFeedback(submissionId);
            const n = Number((fb as any)?.overallScore);
            score = Number.isFinite(n) ? n : 0;

            const reviewed = !!fb && (fb as any).overriddenByTeacher === true;
            if (reviewed) {
              status = 'reviewed';
            }
          } catch {
            status = 'submitted';
            score = 0;
          }
        }

        const studentId = typeof student === 'string' ? student : (student && (student._id || student.id)) || '';
        const studentName = (student && typeof student === 'object' ? (student.displayName || student.email) : '') || 'Student';
        const studentImage = (student && typeof student === 'object' ? student.photoURL : '') || 'img/default-img.png';

        return {
          id: submissionId,
          student: {
            id: studentId,
            name: studentName,
            image: studentImage
          },
          class: {
            id: assignmentMeta.classId,
            title: assignmentMeta.classTitle
          },
          assignment: {
            id: assignmentMeta.assignmentId,
            title: assignmentMeta.assignmentTitle
          },
          score,
          status,
          submittedAt: s.submittedAt || s.createdAt
        } satisfies DashboardSubmission;
      })
    );

    return mapped.filter((x) => !!x && typeof x.id === 'string' && x.id.length > 0);
  }
}
