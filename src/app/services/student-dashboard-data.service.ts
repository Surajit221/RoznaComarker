import { Injectable } from '@angular/core';

import { AssignmentApiService, type BackendAssignment } from '../api/assignment-api.service';
import { FeedbackApiService } from '../api/feedback-api.service';
import { MembershipApiService, type BackendMembership } from '../api/membership-api.service';
import { SubmissionApiService, type BackendSubmission } from '../api/submission-api.service';
import { AuthService, type BackendMe } from '../auth/auth.service';

import type { SubmissionFeedback } from '../models/submission-feedback.model';

export type StudentDashboardData = {
  me: BackendMe | null;
  memberships: BackendMembership[];
  assignments: BackendAssignment[];
  submissions: BackendSubmission[];
  feedbackBySubmissionId: Record<string, SubmissionFeedback | null>;
};

@Injectable({ providedIn: 'root' })
export class StudentDashboardDataService {
  private readonly feedbackCache = new Map<string, SubmissionFeedback | null>();
  private readonly feedbackInFlight = new Map<string, Promise<SubmissionFeedback | null>>();

  constructor(
    private auth: AuthService,
    private membershipApi: MembershipApiService,
    private assignmentApi: AssignmentApiService,
    private submissionApi: SubmissionApiService,
    private feedbackApi: FeedbackApiService
  ) {}

  async fetchDashboardData(): Promise<StudentDashboardData> {
    const [me, memberships, assignments, submissions] = await Promise.all([
      this.safeGetMe(),
      this.safeGetMemberships(),
      this.safeGetMyAssignments(),
      this.safeGetMySubmissions()
    ]);

    const submissionIdsNeedingFeedback = (submissions || [])
      .map((s) => s?._id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter((id) => {
        const cached = this.feedbackCache.get(id);
        return typeof cached === 'undefined';
      });

    await Promise.all(submissionIdsNeedingFeedback.map((id) => this.getFeedbackCached(id)));

    const feedbackBySubmissionId: Record<string, SubmissionFeedback | null> = {};
    for (const s of submissions || []) {
      const id = s?._id;
      if (!id) continue;
      feedbackBySubmissionId[id] = this.feedbackCache.get(id) ?? null;
    }

    return {
      me,
      memberships: Array.isArray(memberships) ? memberships : [],
      assignments: Array.isArray(assignments) ? assignments : [],
      submissions: Array.isArray(submissions) ? submissions : [],
      feedbackBySubmissionId
    };
  }

  private async safeGetMe(): Promise<BackendMe | null> {
    try {
      return await this.auth.getMeProfile();
    } catch {
      return null;
    }
  }

  private async safeGetMemberships(): Promise<BackendMembership[]> {
    try {
      return await this.membershipApi.getMyMemberships();
    } catch {
      return [];
    }
  }

  private async safeGetMyAssignments(): Promise<BackendAssignment[]> {
    try {
      return await this.assignmentApi.getMyAssignments();
    } catch {
      return [];
    }
  }

  private async safeGetMySubmissions(): Promise<BackendSubmission[]> {
    try {
      return await this.submissionApi.getMySubmissions();
    } catch {
      return [];
    }
  }

  private getFeedbackCached(submissionId: string): Promise<SubmissionFeedback | null> {
    if (!submissionId) return Promise.resolve(null);

    const cached = this.feedbackCache.get(submissionId);
    if (typeof cached !== 'undefined') {
      return Promise.resolve(cached);
    }

    const inFlight = this.feedbackInFlight.get(submissionId);
    if (inFlight) return inFlight;

    const p = (async () => {
      try {
        const fb = await this.feedbackApi.getSubmissionFeedback(submissionId);
        this.feedbackCache.set(submissionId, fb || null);
        return fb || null;
      } catch {
        this.feedbackCache.set(submissionId, null);
        return null;
      } finally {
        this.feedbackInFlight.delete(submissionId);
      }
    })();

    this.feedbackInFlight.set(submissionId, p);
    return p;
  }

  clearFeedbackCache(): void {
    this.feedbackCache.clear();
    this.feedbackInFlight.clear();
  }
}
