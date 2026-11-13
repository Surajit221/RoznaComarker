import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEventType, type HttpResponse } from '@angular/common/http';
import { Observable, filter, firstValueFrom, map, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import type { RubricDesigner } from '../models/submission-feedback.model';

// AI knowledge and reference files: teacher-only background material for marking (backend/src/routes/referenceFile.routes.js).
// Every field below is one the backend returns; the extracted text, stored paths and hashes are never sent, so they are not modelled.

interface BackendResponse<T> { success: boolean; data: T; message?: string; code?: string }

export type ReferenceScope = 'class' | 'assignment';
export type ReferenceFileStatus = 'processing' | 'ready' | 'failed' | 'removed';
export interface ReferenceFileView {
  id: string; scope: ReferenceScope; classId: string; assignmentId: string | null;
  name: string; kind: 'pdf' | 'docx' | 'doc' | 'pptx'; sizeBytes: number; status: ReferenceFileStatus;
  failureCode: string | null; failureMessage: string | null; pages: number | null; slides: number | null; textTrimmed: boolean;
  markedAsRubric: boolean; rubricSuggestion: { looksLikeRubric: boolean; confidence: 'high' | 'medium' | 'low' } | null;
  rubricAppliedAt: string | null; createdAt: string; updatedAt: string;
}
export interface ReferenceFileList { files: ReferenceFileView[]; classFiles?: ReferenceFileView[]; limits: { maxFiles: number; maxFileBytes: number } }
export interface ReferenceFilesConfig { enabled: boolean; maxFiles: number; maxFileBytes: number }
export interface ReferenceRubricDraft { rubricDesigner: RubricDesigner; notes: string[]; hasExistingRubric: boolean }
export type ReferenceUploadEvent = { type: 'progress'; loaded: number; total: number } | { type: 'done'; duplicate: boolean; file: ReferenceFileView };
export interface ReferenceError { status: number; code?: string; message: string }

type UploadBody = BackendResponse<{ duplicate: boolean; file: ReferenceFileView }>;

export const REFERENCE_FILES_OFF: ReferenceFilesConfig = { enabled: false, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 };

/** The backend's teacher-facing message when it has one; otherwise a plain one. Never an internal error text. */
export function referenceError(error: unknown): ReferenceError {
  if (!(error instanceof HttpErrorResponse)) return { status: -1, message: 'Something went wrong. Please try again.' };
  const body = (error.error && typeof error.error === 'object' ? error.error : {}) as { code?: unknown; message?: unknown };
  const code = typeof body.code === 'string' ? body.code : undefined;
  const server = typeof body.message === 'string' && body.message.length < 300 ? body.message : '';
  const base = { status: error.status, ...(code ? { code } : {}) };
  if (error.status === 0) return { ...base, message: 'You appear to be offline. Check your connection and try again.' };
  if (error.status === 401) return { ...base, message: 'Your session has expired. Please sign in again.' };
  if (error.status === 404) return { ...base, message: 'This file could not be found. It may have been removed.' };
  if (error.status === 429) return { ...base, message: server || 'Too many requests. Please wait a few minutes and try again.' };
  if (error.status >= 500 && error.status !== 503) return { ...base, message: 'Something went wrong on our side. Please try again.' };
  return { ...base, message: server || 'Something went wrong. Please try again.' };
}

@Injectable({ providedIn: 'root' })
export class ReferenceFilesApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/reference-files`;
  private scopePath = (scope: ReferenceScope, id: string) => `${this.base}/${scope === 'class' ? 'classes' : 'assignments'}/${encodeURIComponent(id)}`;

  /** Fails closed: any error or malformed answer means the feature is off. */
  async config(): Promise<ReferenceFilesConfig> {
    try {
      const data = (await firstValueFrom(this.http.get<BackendResponse<ReferenceFilesConfig>>(`${this.base}/config`).pipe(timeout(8000)))).data;
      return data?.enabled === true && Number.isInteger(data.maxFiles) && Number.isInteger(data.maxFileBytes) ? data : REFERENCE_FILES_OFF;
    } catch { return REFERENCE_FILES_OFF; }
  }

  async list(scope: ReferenceScope, id: string): Promise<ReferenceFileList> {
    return (await firstValueFrom(this.http.get<BackendResponse<ReferenceFileList>>(this.scopePath(scope, id)))).data;
  }

  async get(fileId: string): Promise<ReferenceFileView> {
    return (await firstValueFrom(this.http.get<BackendResponse<{ file: ReferenceFileView }>>(`${this.base}/${encodeURIComponent(fileId)}`))).data.file;
  }

  /** One file, multipart, with upload progress. Unsubscribing cancels it. */
  upload(scope: ReferenceScope, id: string, request: { file: File; requestId: string; markedAsRubric: boolean }): Observable<ReferenceUploadEvent> {
    const form = new FormData();
    form.append('requestId', request.requestId);
    if (scope === 'assignment' && request.markedAsRubric) form.append('markedAsRubric', 'true');
    form.append('file', request.file, request.file.name);
    return this.http.post<BackendResponse<{ duplicate: boolean; file: ReferenceFileView }>>(this.scopePath(scope, id), form, { reportProgress: true, observe: 'events' }).pipe(
      filter(event => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map(event => event.type === HttpEventType.UploadProgress
        ? { type: 'progress' as const, loaded: event.loaded, total: event.total ?? request.file.size }
        : { type: 'done' as const, duplicate: Boolean((event as HttpResponse<UploadBody>).body?.data?.duplicate), file: (event as HttpResponse<UploadBody>).body!.data.file }));
  }

  async remove(fileId: string): Promise<ReferenceFileView> {
    return (await firstValueFrom(this.http.delete<BackendResponse<{ removed: boolean; file: ReferenceFileView }>>(`${this.base}/${encodeURIComponent(fileId)}`))).data.file;
  }

  async draftRubric(fileId: string): Promise<ReferenceRubricDraft> {
    return (await firstValueFrom(this.http.post<BackendResponse<ReferenceRubricDraft>>(`${this.base}/${encodeURIComponent(fileId)}/rubric-draft`, {}))).data;
  }

  async applyRubric(fileId: string, rubricDesigner: RubricDesigner, replace: boolean): Promise<{ applied: boolean; replaced: boolean }> {
    return (await firstValueFrom(this.http.post<BackendResponse<{ applied: boolean; replaced: boolean; assignmentId: string }>>(
      `${this.base}/${encodeURIComponent(fileId)}/apply-rubric`, { rubricDesigner, replace }))).data;
  }
}
