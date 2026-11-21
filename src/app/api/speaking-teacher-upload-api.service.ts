import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, filter, firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';
import type { TeacherUploadCheck, TeacherUploadEvent, TeacherUploadItem } from './teacher-upload-api.service';

// Stage 9: a teacher uploads a student's recording. The essay "Upload student work" calls (teacher-upload-api.service.ts), for speaking
// assignments: backend /api/speaking/assignments/:assignmentId/teacher-uploads (routes/speakingTeacherUpload.routes.js). Same item shape.

interface BackendResponse<T> { success: boolean; data: T }

/** One student's recording: new, or replacing the one the teacher uploaded before (a speaking submission has one recording). */
export interface SpeakingTeacherUploadRequest {
  name: string; email: string; requestKey: string; batchId: string; mode: 'new' | 'replace'; send: boolean; file: File;
}

@Injectable({ providedIn: 'root' })
export class SpeakingTeacherUploadApiService {
  private http = inject(HttpClient);
  private base(assignmentId: string) { return `${environment.apiUrl}/speaking/assignments/${encodeURIComponent(assignmentId)}/teacher-uploads`; }

  async list(assignmentId: string): Promise<{ items: TeacherUploadItem[]; credits: { available: number } }> {
    return (await firstValueFrom(this.http.get<BackendResponse<{ items: TeacherUploadItem[]; credits: { available: number } }>>(this.base(assignmentId)))).data;
  }

  async check(assignmentId: string, students: { name: string; email: string }[]): Promise<TeacherUploadCheck> {
    return (await firstValueFrom(this.http.post<BackendResponse<TeacherUploadCheck>>(`${this.base(assignmentId)}/check`, { students }))).data;
  }

  /** Uploads one student's recording with progress events (the text fields first, then the file). Unsubscribing cancels the request. */
  upload(assignmentId: string, request: SpeakingTeacherUploadRequest): Observable<TeacherUploadEvent> {
    const form = new FormData();
    form.append('name', request.name); form.append('email', request.email);
    form.append('requestKey', request.requestKey); form.append('batchId', request.batchId);
    form.append('mode', request.mode);
    if (request.send) form.append('send', 'true');
    form.append('audio', request.file, request.file.name);
    return this.http.post<BackendResponse<{ item: TeacherUploadItem; duplicate: boolean }>>(this.base(assignmentId), form,
      { reportProgress: true, observe: 'events' }).pipe(
      filter(event => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map(event => event.type === HttpEventType.UploadProgress
        ? { type: 'progress' as const, loaded: event.loaded, total: event.total || event.loaded }
        : { type: 'done' as const, result: (event as { body: BackendResponse<{ item: TeacherUploadItem; duplicate: boolean }> }).body.data }));
  }

  /** Transcription or marking again (one credit, charged only when marking succeeds); a held email is queued again. */
  async retry(assignmentId: string, submissionId: string): Promise<{ item: TeacherUploadItem; alreadyRequested: boolean }> {
    return (await firstValueFrom(this.http.post<BackendResponse<{ item: TeacherUploadItem; alreadyRequested: boolean }>>(
      `${this.base(assignmentId)}/${encodeURIComponent(submissionId)}/retry`, {}))).data;
  }

  /** Send, or Resend after a failure; `resend` sends an email that was already sent once more (once a minute; the request id makes it one request). */
  async send(assignmentId: string, submissionId: string, resend?: { requestId: string }): Promise<{ item: TeacherUploadItem; alreadyRequested: boolean }> {
    return (await firstValueFrom(this.http.post<BackendResponse<{ item: TeacherUploadItem; alreadyRequested: boolean }>>(
      `${this.base(assignmentId)}/${encodeURIComponent(submissionId)}/send`, resend ? { resend: true, requestId: resend.requestId } : {}))).data;
  }
}
