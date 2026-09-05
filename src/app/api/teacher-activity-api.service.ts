import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TeacherActivitySummary {
  since: string | null;
  viewedAt: string;
  isFirstVisit: boolean;
  sinceLastVisit: { newSubmissions: number; revisedDrafts: number; adaptiveCompletions: number };
  current: { waitingForReview: number };
  ackToken: string;
}
export interface ProfessionalMilestoneItem { key: string; title: string; description: string; achieved: boolean;
  achievedAt: string | null; rewardGranted: boolean; current: number; target: number; percent: number; }
export interface ProfessionalMilestoneSummary { achieved: ProfessionalMilestoneItem[]; inProgress: ProfessionalMilestoneItem[];
  nextMilestone: ProfessionalMilestoneItem | null; }
export interface WeeklyTeacherSummary {
  window: { start: string; end: string; label: string }; headline: string;
  activity: { newSubmissions: number; revisedDrafts: number; adaptiveCompletions: number; successfulAssessments: number };
  progress: { studentsImproved: number; improvedRevisions: number; averageRevisionScoreDelta: number | null;
    issuesCorrected: number; strongestImprovedCategory: { name: string; averageDelta: number; comparisonCount: number } | null };
  current: { waitingForReview: number; classesWithPendingReview: number };
  classes: Array<{ id: string; name: string; newSubmissions: number; revisedDrafts: number;
    adaptiveCompletions: number; successfulAssessments: number; waitingForReview: number; studentsImproved: number }>;
}

type BackendResponse<T> = { success: boolean; data: T };

@Injectable({ providedIn: 'root' })
export class TeacherActivityApiService {
  constructor(private http: HttpClient) {}

  async getSummary(): Promise<TeacherActivitySummary> {
    const response = await firstValueFrom(this.http.get<BackendResponse<TeacherActivitySummary>>(
      `${environment.apiUrl}/teacher/activity-summary`
    ));
    return response.data;
  }

  async acknowledge(ackToken: string): Promise<void> {
    await firstValueFrom(this.http.post<BackendResponse<{ viewedAt: string }>>(
      `${environment.apiUrl}/teacher/activity-summary/acknowledge`, { ackToken }
    ));
  }

  async getMilestones(): Promise<ProfessionalMilestoneSummary> {
    const response = await firstValueFrom(this.http.get<BackendResponse<ProfessionalMilestoneSummary>>(
      `${environment.apiUrl}/teacher/milestones`));
    return response.data;
  }

  async getWeeklySummary(end?: string): Promise<WeeklyTeacherSummary> {
    const response = await firstValueFrom(this.http.get<BackendResponse<WeeklyTeacherSummary>>(
      `${environment.apiUrl}/teacher/weekly-summary`, { params: end ? { end } : {} }));
    return response.data;
  }
}
