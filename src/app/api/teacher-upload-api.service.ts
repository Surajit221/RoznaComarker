import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Observable, firstValueFrom, map, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import type { ImagePreflightResult } from '../services/image-preflight.service';

// "Upload student work": a teacher uploads photos of students' handwritten pages for one of their assignments.
// Backend: /api/assignments/:assignmentId/teacher-uploads (backend/src/routes/teacherUpload.routes.js).

interface BackendResponse<T> { success: boolean; data: T; message?: string; code?: string }

export type TeacherUploadAccount = 'member' | 'guest';
export type TeacherUploadMode = 'new' | 'replace' | 'add_pages';
export type TeacherUploadStatus = 'uploaded' | 'processing' | 'marked' | 'failed';
/** held = the teacher asked for the email but marking failed: not sent; "Retry marking" queues it again. */
export type TeacherUploadEmailStatus = 'none' | 'queued' | 'sending' | 'sent' | 'failed' | 'held';

export interface TeacherUploadCheckRow {
  index: number; name?: string; email?: string; account?: TeacherUploadAccount;
  existing?: { submissionId: string; pages: number };
  errors?: { name?: string; email?: string };
}
export interface TeacherUploadCheck { students: TeacherUploadCheckRow[]; credits: { needed: number; available: number } }
export interface TeacherUploadItem {
  submissionId: string; name: string; email: string; account: TeacherUploadAccount; uploadedByTeacher: true; pages: number;
  status: TeacherUploadStatus; failureCode?: string; emailStatus: TeacherUploadEmailStatus;
  emailSentAt: string | null; emailFailedAt: string | null; uploadedAt: string;
  /** The server stopped while sending: the email may already have arrived, so Resend could send a second copy. */
  emailDeliveryUncertain?: boolean;
}
export interface TeacherUploadSaveResult { item: TeacherUploadItem; duplicate: boolean }
export interface TeacherUploadRequest {
  name: string; email: string; requestKey: string; batchId: string; mode: TeacherUploadMode; send: boolean;
  files: { blob: Blob; name: string }[];
}
export type TeacherUploadEvent = { type: 'progress'; loaded: number; total: number } | { type: 'done'; result: TeacherUploadSaveResult };
export interface FriendlyError { message: string; code?: string; status: number; details?: Record<string, unknown> }

/** A plain-language message for any failed request (the backend's own messages are already written for teachers). */
export function friendlyError(error: unknown): FriendlyError {
  if (!(error instanceof HttpErrorResponse)) return { message: 'Something went wrong. Please try again.', status: -1 };
  const body = (error.error && typeof error.error === 'object' ? error.error : {}) as { message?: unknown; code?: unknown; details?: unknown };
  const code = typeof body.code === 'string' ? body.code : undefined;
  const details = body.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : undefined;
  const serverMessage = typeof body.message === 'string' && body.message.length < 300 ? body.message : '';
  const base = { status: error.status, ...(code ? { code } : {}), ...(details ? { details } : {}) };
  if (error.status === 0) return { ...base, message: 'You appear to be offline. Check your connection and try again.' };
  if (error.status === 401) return { ...base, message: 'Your session has expired. Please sign in again.' };
  if (error.status === 403 && (!code || code === 'FORBIDDEN')) return { ...base, message: 'You do not have permission to do this.' };
  if (error.status === 404) return { ...base, message: 'This assignment or upload could not be found. It may have been deleted.' };
  if (error.status === 429) return { ...base, message: 'Too many requests. Please wait a minute and try again.' };
  if (error.status === 413 && !code) return { ...base, message: 'These images are too large to upload together. Try fewer or smaller photos.' };
  // The handwriting check's own "try again later" answer is already written for people.
  if (error.status === 503 && code?.startsWith('OCR_') && serverMessage) return { ...base, message: serverMessage };
  if (error.status >= 500) return { ...base, message: 'Something went wrong on our side. Please try again.' };
  return { ...base, message: serverMessage || 'Something went wrong. Please try again.' };
}

@Injectable({ providedIn: 'root' })
export class TeacherUploadApiService {
  private http = inject(HttpClient);
  private base(assignmentId: string) { return `${environment.apiUrl}/assignments/${encodeURIComponent(assignmentId)}/teacher-uploads`; }

  async list(assignmentId: string): Promise<{ items: TeacherUploadItem[]; credits: { available: number } }> {
    return (await firstValueFrom(this.http.get<BackendResponse<{ items: TeacherUploadItem[]; credits: { available: number } }>>(this.base(assignmentId)))).data;
  }

  async check(assignmentId: string, students: { name: string; email: string }[]): Promise<TeacherUploadCheck> {
    return (await firstValueFrom(this.http.post<BackendResponse<TeacherUploadCheck>>(`${this.base(assignmentId)}/check`, { students }))).data;
  }

  /** Uploads one student's pages with progress events. Unsubscribing cancels the request. */
  upload(assignmentId: string, request: TeacherUploadRequest): Observable<TeacherUploadEvent> {
    const form = new FormData();
    form.append('name', request.name); form.append('email', request.email);
    form.append('requestKey', request.requestKey); form.append('batchId', request.batchId);
    form.append('mode', request.mode);
    if (request.send) form.append('send', 'true');
    for (const file of request.files) form.append('files', file.blob, file.name);
    return this.http.post<BackendResponse<TeacherUploadSaveResult>>(this.base(assignmentId), form, { reportProgress: true, observe: 'events' }).pipe(
      filter(event => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map(event => event.type === HttpEventType.UploadProgress
        ? { type: 'progress' as const, loaded: event.loaded, total: event.total || event.loaded }
        : { type: 'done' as const, result: (event as { body: BackendResponse<TeacherUploadSaveResult> }).body.data }));
  }

  /** The student upload screen's page check, bound to the student these pages belong to (same response as /submissions/image-preflight). */
  preflight(assignmentId: string, student: { name: string; email: string }, file: File, phase: string): Observable<{ success: boolean; data: ImagePreflightResult }> {
    const body = new FormData();
    body.append('file', file); body.append('phase', phase);
    body.append('name', student.name); body.append('email', student.email);
    return this.http.post<{ success: boolean; data: ImagePreflightResult }>(`${this.base(assignmentId)}/image-preflight`, body);
  }

  /** Restarts marking for an upload whose marking failed (needs one credit; charged only when marking succeeds). */
  async retry(assignmentId: string, submissionId: string): Promise<{ item: TeacherUploadItem; alreadyRequested: boolean }> {
    return (await firstValueFrom(this.http.post<BackendResponse<{ item: TeacherUploadItem; alreadyRequested: boolean }>>(
      `${this.base(assignmentId)}/${encodeURIComponent(submissionId)}/retry`, {}))).data;
  }

  async send(assignmentId: string, submissionId: string): Promise<{ item: TeacherUploadItem; alreadyRequested: boolean }> {
    return (await firstValueFrom(this.http.post<BackendResponse<{ item: TeacherUploadItem; alreadyRequested: boolean }>>(
      `${this.base(assignmentId)}/${encodeURIComponent(submissionId)}/send`, {}))).data;
  }
}
