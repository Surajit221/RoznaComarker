import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AdaptivePracticeAttempt, AdaptivePracticeCheckResponse, AdaptivePracticeProgress, AdaptivePracticeSessionResponse } from '../components/student/adaptive-writing-studio/adaptive-writing-studio.types';
import type { TeacherAdaptiveAttemptsResponse, TeacherAdaptiveProgressResponse } from '../components/teacher/adaptive-practice-progress/adaptive-practice-progress.types';

interface BackendResponse<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
}

export class AdaptivePracticeContractError extends Error {
  readonly code = 'ADAPTIVE_PRACTICE_INVALID_RESPONSE';
  constructor(message = 'Adaptive practice returned an invalid response.') { super(message); }
}

function unwrap<T>(response: BackendResponse<T>, validate: (data: T) => boolean): T {
  if (!response || response.success !== true || response.data == null || !validate(response.data)) {
    throw new AdaptivePracticeContractError();
  }
  return response.data;
}

const hasState = (value: unknown): boolean => Boolean(value && typeof value === 'object'
  && typeof (value as { state?: unknown }).state === 'string');
const isObject = (value: unknown): boolean => Boolean(value && typeof value === 'object');

@Injectable({ providedIn: 'root' })
export class AdaptivePracticeApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/adaptive-practice`;

  getSession(submissionId: string): Observable<AdaptivePracticeSessionResponse> {
    return this.http.get<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}`
    ).pipe(map((response) => unwrap(response, hasState)));
  }

  generateSession(submissionId: string): Observable<AdaptivePracticeSessionResponse> {
    return this.http.post<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}/generate`,
      { retry: false }
    ).pipe(map((response) => unwrap(response, hasState)));
  }

  retryGeneration(submissionId: string): Observable<AdaptivePracticeSessionResponse> {
    return this.http.post<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}/generate`,
      { retry: true }
    ).pipe(map((response) => unwrap(response, hasState)));
  }

  checkResponse(sessionId: string, activityId: string, response: string, retry = false): Observable<AdaptivePracticeCheckResponse> {
    return this.http.post<BackendResponse<AdaptivePracticeCheckResponse>>(
      `${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/activities/${encodeURIComponent(activityId)}/check`,
      { response, retry }
    ).pipe(map((value) => unwrap(value, hasState)));
  }

  getAttempts(sessionId: string, activityId: string): Observable<{ attempts: AdaptivePracticeAttempt[]; progress: AdaptivePracticeProgress }> {
    return this.http.get<BackendResponse<{ attempts: AdaptivePracticeAttempt[]; progress: AdaptivePracticeProgress }>>(
      `${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/attempts?activityId=${encodeURIComponent(activityId)}`
    ).pipe(map((response) => unwrap(response, (data) => isObject(data) && Array.isArray(data.attempts) && isObject(data.progress))));
  }

  getTeacherProgress(submissionId: string): Observable<TeacherAdaptiveProgressResponse> {
    return this.http.get<BackendResponse<TeacherAdaptiveProgressResponse>>(
      `${this.baseUrl}/teacher/submissions/${encodeURIComponent(submissionId)}/progress`
    ).pipe(map((response) => unwrap(response, isObject)));
  }

  getTeacherActivityAttempts(sessionId: string, activityId: string, page = 1, limit = 10): Observable<TeacherAdaptiveAttemptsResponse> {
    return this.http.get<BackendResponse<TeacherAdaptiveAttemptsResponse>>(
      `${this.baseUrl}/teacher/sessions/${encodeURIComponent(sessionId)}/activities/${encodeURIComponent(activityId)}/attempts?page=${page}&limit=${limit}`
    ).pipe(map((response) => unwrap(response, isObject)));
  }
}
