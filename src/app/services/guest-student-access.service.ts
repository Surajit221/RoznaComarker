import { Injectable, inject, Provider } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { SubmissionApiService, type BackendSubmission } from '../api/submission-api.service';
import { AssignmentApiService, type BackendAssignment } from '../api/assignment-api.service';
import { FeedbackApiService } from '../api/feedback-api.service';
import { PdfApiService } from '../api/pdf-api.service';
import { ClassApiService } from '../api/class-api.service';
import { AdaptivePracticeApiService } from '../api/adaptive-practice-api.service';
import { WritingCorrectionsApiService } from '../api/writing-corrections-api.service';
import { DEFAULT_CORRECTION_LEGEND } from '../constants/correction-legend.default';
import type { ImagePreflightResult } from './image-preflight.service';

interface GuestPresentation {
  submission: BackendSubmission;
  assignment: BackendAssignment;
  classSummary: { name: string; gradingScale?: string };
}

/** Component-scoped capability. Never used as an application login/session. */
@Injectable()
export class GuestStudentAccess {
  private readonly http = inject(HttpClient);
  submissionId = '';
  token = '';
  qrToken = '';
  name = '';
  email = '';
  requestKey = '';
  onRevisionRequested: (() => void) | null = null;
  private metadata: Promise<GuestPresentation> | null = null;
  restoreReturnToken(id: string, fragment: string | null): string {
    const key = `comarker:guest-return:${id}`;
    try {
      if (fragment) {
        if (/^[\w-]{43}$/.test(fragment)) sessionStorage.setItem(key, JSON.stringify({ token: fragment, until: Date.now() + 3600000 }));
        return fragment;
      }
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.until > Date.now() && /^[\w-]{43}$/.test(saved.token)) return saved.token;
      sessionStorage.removeItem(key);
    } catch { /* Email remains the return authority when browser storage is unavailable. */ }
    return '';
  }
  forgetReturnToken(): void {
    try { sessionStorage.removeItem(`comarker:guest-return:${this.submissionId}`); } catch { /* optional session */ }
    this.token = ''; this.metadata = null;
  }
  get headers(): HttpHeaders { return new HttpHeaders({ 'X-Guest-Token': this.token }); }
  mediaHeaders(url: string): HttpHeaders {
    const expected = new URL(this.url('media/'), location.origin);
    const actual = new URL(url, location.origin);
    return actual.origin === expected.origin && actual.pathname.startsWith(expected.pathname)
      ? this.headers : new HttpHeaders();
  }
  url(suffix: string): string {
    return `${environment.apiUrl}/guest/submissions/${encodeURIComponent(this.submissionId)}/${suffix}`;
  }
  get<T = unknown>(suffix: string) {
    return this.http.get<{ data: T }>(this.url(suffix), { headers: this.headers }).pipe(map(response => response.data));
  }
  post<T = unknown>(suffix: string, body: unknown) {
    return this.http.post<{ data: T }>(this.url(suffix), body, { headers: this.headers }).pipe(map(response => response.data));
  }
  async presentation(refresh = false): Promise<GuestPresentation> {
    if (refresh || !this.metadata) this.metadata = firstValueFrom(this.get<GuestPresentation>('presentation'));
    try { return await this.metadata; } catch (error) { this.metadata = null; throw error; }
  }
  preflight(file: File, phase: string) {
    this.requestKey ||= crypto.randomUUID();
    const body = new FormData();
    body.append('file', file); body.append('phase', phase);
    body.append('name', this.name); body.append('email', this.email);
    const url = this.submissionId ? this.url('image-preflight') : `${environment.apiUrl}/guest/assignments/${encodeURIComponent(this.qrToken)}/image-preflight`;
    return this.http.post<{ success: boolean; data: ImagePreflightResult }>(url, body,
      { headers: (this.submissionId ? this.headers : new HttpHeaders()).set('Idempotency-Key', this.requestKey) });
  }
}

/** These providers adapt access only; production renderers and view models stay shared. */
export const GUEST_STUDENT_PROVIDERS: Provider[] = [
  GuestStudentAccess,
  { provide: SubmissionApiService, useFactory: () => {
    const access = inject(GuestStudentAccess);
    return {
      getMySubmissionByAssignmentId: async (_assignmentId: string, refresh?: string | number | null) => (await access.presentation(Boolean(refresh))).submission,
      getMySubmissions: async () => [(await access.presentation()).submission],
      getDraftComparison: () => firstValueFrom(access.get('drafts')),
    };
  } },
  { provide: AssignmentApiService, useFactory: () => {
    const access = inject(GuestStudentAccess);
    return { getAssignmentById: async () => (await access.presentation()).assignment };
  } },
  { provide: ClassApiService, useFactory: () => {
    const access = inject(GuestStudentAccess);
    return { getClassSummary: async () => (await access.presentation()).classSummary };
  } },
  { provide: FeedbackApiService, useFactory: () => {
    const access = inject(GuestStudentAccess);
    return { getSubmissionFeedback: () => firstValueFrom(access.get('feedback')) };
  } },
  { provide: PdfApiService, useFactory: () => {
    const access = inject(GuestStudentAccess), http = inject(HttpClient);
    return { downloadSubmissionPdf: () => firstValueFrom(http.get(access.url('pdf'),
      { headers: access.headers, responseType: 'blob' })) };
  } },
  { provide: WritingCorrectionsApiService, useValue: { getLegend: async () => DEFAULT_CORRECTION_LEGEND } },
  { provide: AdaptivePracticeApiService, useFactory: () => {
    const access = inject(GuestStudentAccess);
    return {
      getSession: () => access.get('practice'),
      generateSession: () => access.post('practice', { retry: false }),
      retryGeneration: () => access.post('practice', { retry: true }),
      checkResponse: (session: string, activity: string, questionId: string, response: string, retry: boolean) =>
        access.post(`practice/${encodeURIComponent(session)}/${encodeURIComponent(activity)}`, { questionId, response, retry }),
      getAttempts: (session: string, activity: string, question: string) => access.get(
        `practice/${encodeURIComponent(session)}/attempts?activityId=${encodeURIComponent(activity)}&questionId=${encodeURIComponent(question)}`),
    };
  } },
];
