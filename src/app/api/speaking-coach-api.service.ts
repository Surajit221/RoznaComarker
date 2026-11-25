import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, type HttpEvent } from '@angular/common/http';
import { firstValueFrom, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Speaking Coach: practice after a speaking result. The server's DTOs, field by field. A student or guest never receives a level, a score or a
// pass flag: a task is current, done or locked, and an attempt says what comes next.

export type CoachState = 'unavailable' | 'no_practice_needed' | 'idle' | 'generating' | 'ready' | 'completed' | 'capped' | 'failed';
export type CoachTaskType = 'repeat_improve' | 'follow_up' | 'fluency_drill' | 'vocab_swap';
export type CoachTaskStatus = 'current' | 'done' | 'locked';
export type CoachAttemptState = 'processing' | 'ready' | 'not_assessable' | 'failed';
export type CoachNextStep = 'next_task' | 'try_again' | 'finished' | 'practice_ended' | null;
export type CoachNotAssessableReason = 'not_enough_speech' | 'not_english' | 'unintelligible' | 'off_topic' | 'too_long';

export interface CoachTask {
  taskId: string; order: number; type: CoachTaskType; area: string; prompt: string; tip: string; targets: string[]; maxSeconds: number;
  status: CoachTaskStatus; attemptCount: number;
}
export interface CoachFeedback { improved: string[]; stillWeak: string[]; nextTip: string; }
export interface CoachFluencyChange { fewerLongPauses: boolean; fewerFillers: boolean; shorterLongestPause: boolean; }
export interface CoachAttempt {
  id: string; taskId: string; attemptNumber: number; state: CoachAttemptState; nextStep: CoachNextStep; createdAt: string | null;
  feedback?: CoachFeedback; vocab?: { used: string[]; missing: string[] }; fluencyChange?: CoachFluencyChange;
  reason?: CoachNotAssessableReason; failure?: 'transcription' | 'check'; canRetry?: boolean;
}
export interface CoachSession {
  id: string; currentTaskId: string | null; attemptsUsed: number; attemptsLeft: number; endedReason: 'completed' | 'capped' | null;
  tasks: CoachTask[]; activeAttempt: CoachAttempt | null; lastAttempt: CoachAttempt | null;
}
/** Guests only: the practice notice to accept before the first practice recording. */
export interface CoachNotice { version: string; text: string; accepted: boolean; }
export interface CoachView { state: CoachState; session: CoachSession | null; notice?: CoachNotice; }
export interface CoachAttemptView { session: CoachSession; attempt: CoachAttempt; }

/** One practice owner's calls: the signed-in student's (SpeakingCoachApiService.forStudent) or the guest's (GuestSpeakingAccess.coachClient). */
export interface CoachClient {
  /** null when the coach is not there for this submission (the feature is off, or not the owner: the server answers 404). */
  getSession(): Promise<CoachView | null>;
  start(noticeVersion?: string): Promise<CoachView>;
  uploadAttempt(sessionId: string, taskId: string, audio: Blob, filename: string, requestId: string): Observable<HttpEvent<Envelope<CoachAttemptView>>>;
  getAttempt(sessionId: string, attemptId: string): Promise<CoachAttemptView>;
  retry(sessionId: string, attemptId: string): Promise<CoachAttemptView>;
}

export interface TeacherCoachTask {
  taskId: string; order: number; type: CoachTaskType; area: string; prompt: string; status: 'active' | 'passed' | 'locked'; attemptCount: number;
  originalLevel: string | null; latestLevel: string | null; passed: boolean; passRule: { rule: string; minimumPercent: number } | null; passRuleText: string;
  lastAttemptAt: string | null;
}
export interface TeacherCoachProgress {
  state: 'not-started' | 'generating' | 'in-progress' | 'completed' | 'capped' | 'failed'; sourceStatus: 'current' | 'outdated'; submissionId: string;
  sessionId: string | null; settings: { passPercent: number; attemptCap: number } | null;
  summary: { totalTasks: number; passedTasks: number; attemptsUsed: number; attemptCap: number | null; lastPracticedAt: string | null };
  tasks: TeacherCoachTask[];
}
export interface TeacherCoachAttempt {
  id: string; attemptNumber: number; state: CoachAttemptState; levelTitle: string | null; passed: boolean | null; onTask: boolean | null;
  notAssessableReason: CoachNotAssessableReason | null; failure: 'transcription' | 'check' | null; feedback: CoachFeedback | null;
  vocab: { used: string[]; missing: string[] } | null; fluencyChange: CoachFluencyChange | null; answerText: string; attemptedAt: string | null;
}
export interface TeacherCoachAttemptsPage {
  sessionId: string; taskId: string; attempts: TeacherCoachAttempt[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
}

export interface Envelope<T> { success: boolean; data: T; }

/** A new practice upload reference (Idempotency-Key): one per recording, reused when that upload is retried. */
export function newPracticeRequestId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `prc_${random}`;
}

const isNotFound = (error: unknown) => error instanceof HttpErrorResponse && error.status === 404;

/**
 * A coach client. submissionBase: where the session is read and started; sessionBase: where its attempts live (the student's under
 * /speaking-coach, the guest's under their own submission). headers: the guest's link token, read on every call.
 */
export function coachClientFor(http: HttpClient, { submissionBase, sessionBase, headers = () => ({}) }:
  { submissionBase: string; sessionBase: string; headers?: () => Record<string, string> }): CoachClient {
  const id = encodeURIComponent;
  const sessionUrl = (sessionId: string) => `${sessionBase}/sessions/${id(sessionId)}`;
  return {
    async getSession() {
      try { return (await firstValueFrom(http.get<Envelope<CoachView>>(submissionBase, { headers: headers() }))).data; }
      catch (error) { if (isNotFound(error)) return null; throw error; }
    },
    async start(noticeVersion?: string) {
      const body = noticeVersion ? { noticeVersion } : {};
      return (await firstValueFrom(http.post<Envelope<CoachView>>(`${submissionBase}/start`, body, { headers: headers() }))).data;
    },
    uploadAttempt(sessionId, taskId, audio, filename, requestId) {
      const form = new FormData();
      form.append('audio', audio, filename);
      return http.post<Envelope<CoachAttemptView>>(`${sessionUrl(sessionId)}/tasks/${id(taskId)}/attempts`, form,
        { headers: { ...headers(), 'Idempotency-Key': requestId }, reportProgress: true, observe: 'events' });
    },
    async getAttempt(sessionId, attemptId) {
      return (await firstValueFrom(http.get<Envelope<CoachAttemptView>>(`${sessionUrl(sessionId)}/attempts/${id(attemptId)}`, { headers: headers() }))).data;
    },
    async retry(sessionId, attemptId) {
      return (await firstValueFrom(http.post<Envelope<CoachAttemptView>>(`${sessionUrl(sessionId)}/attempts/${id(attemptId)}/retry`, {},
        { headers: headers() }))).data;
    }
  };
}

/** Speaking Coach calls. Errors are passed on as they come; callers show fixed text (utils/speaking-coach-messages). */
@Injectable({ providedIn: 'root' })
export class SpeakingCoachApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/speaking-coach`;

  /** The signed-in student's practice for one of their speaking submissions. */
  forStudent(submissionId: string): CoachClient {
    return coachClientFor(this.http, { submissionBase: `${this.base}/submissions/${encodeURIComponent(submissionId)}`, sessionBase: this.base });
  }

  /** The owning teacher's read-only progress; null while the coach is off (404). */
  async getTeacherProgress(submissionId: string): Promise<TeacherCoachProgress | null> {
    try {
      return (await firstValueFrom(this.http.get<Envelope<TeacherCoachProgress>>(`${this.base}/teacher/submissions/${encodeURIComponent(submissionId)}/progress`))).data;
    } catch (error) { if (isNotFound(error)) return null; throw error; }
  }

  async getTeacherAttempts(sessionId: string, taskId: string, page = 1, limit = 10): Promise<TeacherCoachAttemptsPage> {
    return (await firstValueFrom(this.http.get<Envelope<TeacherCoachAttemptsPage>>(
      `${this.base}/teacher/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(taskId)}/attempts`, { params: { page, limit } }))).data;
  }
}
