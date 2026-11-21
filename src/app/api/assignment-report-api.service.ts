import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/** GET /api/assignments/:id/report (teacher only). Already-computed numbers for one essay assignment. */
export type ReportSource = 'class' | 'guest' | 'teacher_upload';
export type ReportBand = 'on_track' | 'needs_revision' | 'needs_attention';
export type ReportAssessment = 'scored' | 'in_progress' | 'not_scored';

export interface AssignmentReportStudent {
  submissionId: string;
  name: string;
  source: ReportSource;
  score: number | null;
  band: ReportBand | null;
  assessment: ReportAssessment;
  notScoredReason: string | null;
  reviewed: boolean;
  topIssue: { symbol: string; label: string; count: number } | null;
  submittedAt: string | null;
  isLate: boolean;
  draftNumber: number;
  needsAttention: boolean;
  attentionReasons: string[];
}

/** A part of a student's sentence: plain text, a mistake (with its correction, may be empty), or a gap where a long sentence was cut. */
export type ExampleSentencePart = { text: string; error?: false } | { text: string; error: true; corrected: string } | { gap: true };
/** The student's sentence around the mistake(s), cut from the stored transcript (teacher report only). cutStart/cutEnd: shortened there. */
export interface ExampleSentence { parts: ExampleSentencePart[]; cutStart: boolean; cutEnd: boolean }
/**
 * One anonymous example of a common mistake: the student's words, the correction (may be empty) and the explanation (may be empty);
 * the sentence when it could be cut from the transcript (older backends and unreadable text send none). Up to 5 per type.
 */
export interface CommonMistakeExample { original: string; corrected: string; explanation: string; sentence?: ExampleSentence }
export interface CommonMistakeType {
  typeCode: string;
  label: string;
  category: string | null;
  /** Distinct students who made it, out of totalStudents. */
  studentCount: number;
  totalStudents: number;
  occurrenceCount: number;
  /** Made by at least minStudents students; only these rows are shown, and only these carry examples. */
  isCommon: boolean;
  examples: CommonMistakeExample[];
}
/** "Common mistakes": counted from the corrections students see (removed ones left out). partial: some edited essays were left out. */
export interface CommonMistakes {
  basis: 'visible_corrections';
  totalStudents: number;
  minStudents: number;
  state: 'ok' | 'not_enough_students' | 'none_shared';
  partial: boolean;
  types: CommonMistakeType[];
}

export interface AssignmentReport {
  version: string;
  generatedAt: string;
  timeZone: string;
  assignment: { id: string; title: string; className: string; deadline: string | null; writingType: string | null };
  counts: { total: number; bySource: { class: number; guest: number; teacherUpload: number }; scored: number; inProgress: number;
    notScored: number; reviewed: number; late: number; skippedRows: number; capped: boolean };
  scores: { average: number | null; median: number | null; highest: number | null; lowest: number | null;
    bands: { key: string; label: string; min: number; max: number; count: number }[];
    onTrack: number; needsRevision: number; needsAttention: number;
    needsRevisionPct: number | null; needsAttentionPct: number | null; reviewedPct: number | null };
  rubric: { kind: 'builtin' | 'custom'; criteria: { key: string; label: string; averagePct: number; count: number }[];
    strongestKey: string | null; weakestKey: string | null };
  errors: { basis: 'ai_analysis'; total: number; symbolTotal: number; submissionsWithCorrections: number;
    categories: { key: string; label: string; color: string | null; count: number; pct: number }[];
    symbols: { symbol: string; label: string; category: string | null; count: number; pct: number }[] };
  /** Mistakes made by several students (from the corrections students see). Absent from an older backend. */
  commonMistakes?: CommonMistakes;
  timeline: { granularity: 'day' | 'week'; points: { date: string; count: number }[] };
  students: AssignmentReportStudent[];
  insights: { code: string; text: string }[];
  smallData: { distributionHidden: boolean; timelineHidden: boolean };
  /** AI summary block (Stage 4). Absent or { enabled: false } when the feature is off. */
  summary?: ReportSummaryBlock;
}

export interface ReportSummaryContent {
  headline: string;
  findings: string[];
  nextSteps: string[];
  caution: string;
  generatedAt: string;
  label: string;
}
export type ReportSummaryState = 'disabled' | 'not_enough_data' | 'none' | 'fresh' | 'stale';
export type ReportSummaryBlock =
  | { enabled: false; state: 'disabled' }
  | { enabled: true; state: Exclude<ReportSummaryState, 'disabled'>; minimumScored: number; dailyLimit: number; remainingToday: number;
      current: ReportSummaryContent | null };
/** POST /report/summary: an AI summary (fresh, maybe cached) or the deterministic fallback. */
export type SummaryGenerateResult =
  | { source: 'ai'; cached: boolean; state: 'fresh'; current: ReportSummaryContent; remainingToday: number }
  | { source: 'fallback'; reason: string; insights: { code: string; text: string }[]; state: 'none' | 'stale';
      current: ReportSummaryContent | null; remainingToday: number };

export type ReportErrorState = 'not_found' | 'unsupported' | 'busy' | 'error';

/** The browser's IANA time zone, or 'UTC' when it cannot be read. */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The page state for a failed load. Never the server's own message. */
export function reportErrorState(error: unknown): ReportErrorState {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 404) return 'not_found';
  if (status === 409) return 'unsupported';
  if (status === 429 || status === 503) return 'busy';
  return 'error';
}

@Injectable({ providedIn: 'root' })
export class AssignmentReportApiService {
  private readonly http = inject(HttpClient);

  async getReport(assignmentId: string, timeZone: string = browserTimeZone()): Promise<AssignmentReport> {
    const params = new HttpParams().set('tz', timeZone);
    const resp = await firstValueFrom(this.http.get<{ success: boolean; data: AssignmentReport }>(
      `${environment.apiUrl}/assignments/${encodeURIComponent(assignmentId)}/report`, { params }));
    return resp.data;
  }

  /** Asks for the AI summary (teacher only). Never automatic: only on the teacher's click. */
  async generateSummary(assignmentId: string): Promise<SummaryGenerateResult> {
    const resp = await firstValueFrom(this.http.post<{ success: boolean; data: SummaryGenerateResult }>(
      `${environment.apiUrl}/assignments/${encodeURIComponent(assignmentId)}/report/summary`, {}));
    return resp.data;
  }
}

/** A fixed message for a failed summary request. Only the server's code is read, never its text. */
export function summaryErrorMessage(error: unknown): { message: string; limitReached: boolean; notEnoughData: boolean } {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  const code = error instanceof HttpErrorResponse && error.error && typeof error.error === 'object' ? String((error.error as { code?: unknown }).code || '') : '';
  if (status === 429 && code === 'SUMMARY_DAILY_LIMIT')
    return { message: 'You have reached today\'s summary limit for this assignment. Please try again tomorrow.', limitReached: true, notEnoughData: false };
  if (status === 429 || status === 503) return { message: 'Too many requests, try again in a minute', limitReached: false, notEnoughData: false };
  if (status === 422) return { message: 'A summary needs at least 3 scored submissions.', limitReached: false, notEnoughData: true };
  if (status === 404) return { message: 'Summaries are not available for this report.', limitReached: false, notEnoughData: false };
  if (status === 409) return { message: 'Reports are only available for essay assignments', limitReached: false, notEnoughData: false };
  return { message: 'The summary could not be created. Please try again.', limitReached: false, notEnoughData: false };
}
