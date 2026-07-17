import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AdaptivePracticeAttempt, AdaptivePracticeCheckResponse, AdaptivePracticeProgress, AdaptivePracticeSessionResponse } from '../components/student/adaptive-writing-studio/adaptive-writing-studio.types';
import type { TeacherAdaptiveAttemptsResponse, TeacherAdaptiveProgressResponse } from '../components/teacher/adaptive-practice-progress/adaptive-practice-progress.types';

interface BackendResponse<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AdaptivePracticeApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/adaptive-practice`;

  getSession(submissionId: string): Observable<BackendResponse<AdaptivePracticeSessionResponse>> {
    return this.http.get<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}`
    );
  }

  generateSession(submissionId: string): Observable<BackendResponse<AdaptivePracticeSessionResponse>> {
    return this.http.post<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}/generate`,
      { retry: false }
    );
  }

  retryGeneration(submissionId: string): Observable<BackendResponse<AdaptivePracticeSessionResponse>> {
    return this.http.post<BackendResponse<AdaptivePracticeSessionResponse>>(
      `${this.baseUrl}/submissions/${encodeURIComponent(submissionId)}/generate`,
      { retry: true }
    );
  }

  checkResponse(sessionId: string, activityId: string, response: string, retry = false): Observable<BackendResponse<AdaptivePracticeCheckResponse>> {
    return this.http.post<BackendResponse<AdaptivePracticeCheckResponse>>(
      `${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/activities/${encodeURIComponent(activityId)}/check`,
      { response, retry }
    );
  }

  getAttempts(sessionId: string, activityId: string): Observable<BackendResponse<{ attempts: AdaptivePracticeAttempt[]; progress: AdaptivePracticeProgress }>> {
    return this.http.get<BackendResponse<{ attempts: AdaptivePracticeAttempt[]; progress: AdaptivePracticeProgress }>>(
      `${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}/attempts?activityId=${encodeURIComponent(activityId)}`
    );
  }

  getTeacherProgress(submissionId: string): Observable<BackendResponse<TeacherAdaptiveProgressResponse>> {
    return this.http.get<BackendResponse<TeacherAdaptiveProgressResponse>>(
      `${this.baseUrl}/teacher/submissions/${encodeURIComponent(submissionId)}/progress`
    );
  }

  getTeacherActivityAttempts(sessionId: string, activityId: string, page = 1, limit = 10): Observable<BackendResponse<TeacherAdaptiveAttemptsResponse>> {
    return this.http.get<BackendResponse<TeacherAdaptiveAttemptsResponse>>(
      `${this.baseUrl}/teacher/sessions/${encodeURIComponent(sessionId)}/activities/${encodeURIComponent(activityId)}/attempts?page=${page}&limit=${limit}`
    );
  }
}
