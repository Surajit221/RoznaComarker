import { Injectable, inject } from '@angular/core';
import { HttpClient, type HttpEvent } from '@angular/common/http';
import { firstValueFrom, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { BackendAssignment } from './assignment-api.service';

/** GET /api/audio/config (teacher). { enabled: false } while the backend feature is off (it answers 404) or the call fails. */
export interface AudioConfig {
  enabled: boolean;
  maxFileBytes?: number;
  maxDurationSeconds?: number;
  minDurationSeconds?: number;
  dailyMinutesPerTeacher?: number;
  monthlyMinutesPerTeacher?: number;
}

export interface SpeakingAssignmentInput {
  classId: string;
  title: string;
  instructions: string;
  deadline: string;
  showMarksToStudent: boolean;
  maxRecordingSeconds: number;
  rubricRef: string | null;
}
export type SpeakingAssignmentUpdate = Omit<SpeakingAssignmentInput, 'classId' | 'rubricRef'>;

interface Envelope<T> { success: boolean; data: T }

/** The student's own speaking submission (GET /api/speaking/:assignmentId/my and the upload response). */
export interface StudentSpeakingSubmission {
  id: string;
  assignmentId: string;
  status: string;
  submittedAt: string | null;
  isLate: boolean;
  /** Not marked yet and before the due date: a new recording may replace this one. */
  canReplace: boolean;
  recording: { state: 'processing' | 'ready' | 'failed'; durationSeconds: number | null; contentType: string | null; canRetry: boolean };
}
export interface SpeakingLimits { maxRecordingSeconds: number; minDurationSeconds: number; maxFileBytes: number; }
export interface MySpeakingStatus { submission: StudentSpeakingSubmission | null; limits: SpeakingLimits; }

/** One state for both audiences; a student never gets 'blocked' or 'failed' (both read as 'awaiting_teacher'). */
export type SpeakingResultState = 'transcribing' | 'transcription_failed' | 'assessing' | 'ready' | 'not_enough_speech' | 'not_assessable'
  | 'awaiting_teacher' | 'blocked' | 'failed';
export type SpeakingNotAssessableReason = 'not_english' | 'unintelligible' | 'too_long';
export interface SpeakingCriterionResult { criterionId: string; title: string; level: string; weightPercent: number; points?: number; comment: string; }
export interface SpeakingCategoryResult { key: string; label: string; score?: number; maxScore?: number; comment: string; }
export interface SpeakingResultBlock {
  overallScore?: number; maxScore?: number; grade?: string;
  criteria: SpeakingCriterionResult[]; categories: SpeakingCategoryResult[];
  summary: string; strengths: string[]; improvements: string[]; actionSteps: { priority: number; action: string }[];
  teacherComments: string;
  /** The fixed off-topic note when the score was capped; null otherwise. */
  scoreNote: string | null;
  assessedAt: string | null;
}
export interface SpeakingFluency { wordsPerMinute: number; fillersPer100Words: number; pausesOverOneSecond: number; longestPauseSeconds: number; repetitions: number; }
export interface SpeakingCorrection { id: string; category: string; symbol: string; symbolLabel?: string; quotedText: string; startChar: number; endChar: number;
  message: string; suggestedText?: string; }
/** GET /api/speaking/submissions/:id/result. `message` is the server's text: pages never show it (they map state and reason to fixed text). */
export interface SpeakingResult {
  submissionId: string;
  state: SpeakingResultState;
  reason: SpeakingNotAssessableReason | null;
  message?: string | null;
  marksVisible: boolean;
  assessedText: string | null;
  fluency: SpeakingFluency | null;
  fillers: { offset: number; text: string }[];
  result: SpeakingResultBlock | null;
  corrections: SpeakingCorrection[];
  // The owning teacher only:
  errorCode?: string | null;
  canRetryAssessment?: boolean;
  offTopicCap?: { cap: number; uncappedScore: number } | null;
}

/** A new upload reference (Idempotency-Key): 16 to 80 letters, digits, - or _. One per chosen recording; reused when that upload is retried. */
export function newRecordingRequestId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `rec_${random}`;
}

/** Speaking assignments (audio + speech-to-text). Errors are passed on as they come; callers show fixed text (utils/speaking-messages). */
@Injectable({ providedIn: 'root' })
export class SpeakingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  async getAudioConfig(): Promise<AudioConfig> {
    try {
      const response = await firstValueFrom(this.http.get<Envelope<AudioConfig>>(`${this.base}/audio/config`));
      return response?.data?.enabled === true ? response.data : { enabled: false };
    } catch {
      return { enabled: false };
    }
  }

  async createSpeakingAssignment(input: SpeakingAssignmentInput): Promise<BackendAssignment> {
    const { maxRecordingSeconds, rubricRef, ...rest } = input;
    const response = await firstValueFrom(this.http.post<Envelope<BackendAssignment>>(`${this.base}/assignments`,
      { ...rest, resourceType: 'speaking', speaking: { maxRecordingSeconds, rubricRef } }));
    return response.data;
  }

  async updateSpeakingAssignment(id: string, input: SpeakingAssignmentUpdate): Promise<BackendAssignment> {
    const { maxRecordingSeconds, ...rest } = input;
    const response = await firstValueFrom(this.http.patch<Envelope<BackendAssignment>>(`${this.base}/assignments/${encodeURIComponent(id)}`,
      { ...rest, speaking: { maxRecordingSeconds } }));
    return response.data;
  }

  /** Points the assignment at a saved rubric (the copy made for it). Only the rubric reference changes. */
  async attachRubric(id: string, rubricRef: string): Promise<BackendAssignment> {
    const response = await firstValueFrom(this.http.patch<Envelope<BackendAssignment>>(`${this.base}/assignments/${encodeURIComponent(id)}`,
      { speaking: { rubricRef } }));
    return response.data;
  }

  // ---- Student ------------------------------------------------------------------------------------------------------------------
  async getMyStatus(assignmentId: string): Promise<MySpeakingStatus> {
    const response = await firstValueFrom(this.http.get<Envelope<MySpeakingStatus>>(`${this.base}/speaking/${encodeURIComponent(assignmentId)}/my`));
    return response.data;
  }

  /** Uploads (or replaces) the student's recording: multipart field "audio", with upload progress events. */
  uploadRecording(assignmentId: string, file: File, requestId: string): Observable<HttpEvent<Envelope<StudentSpeakingSubmission>>> {
    const form = new FormData();
    form.append('audio', file, file.name);
    return this.http.post<Envelope<StudentSpeakingSubmission>>(`${this.base}/speaking/${encodeURIComponent(assignmentId)}`, form,
      { headers: { 'Idempotency-Key': requestId }, reportProgress: true, observe: 'events' });
  }

  async getResult(submissionId: string): Promise<SpeakingResult> {
    const response = await firstValueFrom(this.http.get<Envelope<SpeakingResult>>(`${this.base}/speaking/submissions/${encodeURIComponent(submissionId)}/result`));
    return response.data;
  }

  async retryTranscription(submissionId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/speaking/submissions/${encodeURIComponent(submissionId)}/retry-transcription`, {}));
  }
}
