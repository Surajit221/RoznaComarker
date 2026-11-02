import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AnnotationBody, AnnotationSnapshot, HistoryItem } from '../components/teacher/annotation-controls/annotation-editor.logic';

/** The student handlers' own output, run for the submission's owner by the server. */
export interface StudentPreviewPayload { audience: 'student' | 'guest'; ocrCorrections: unknown; ocrCorrectionsStatus: number; feedback: unknown; feedbackStatus: number; }

/** The 6A teacher annotation API. Errors reach the caller unchanged (the editor maps status and code to words). */
@Injectable({ providedIn: 'root' })
export class TeacherAnnotationApiService {
  private readonly http = inject(HttpClient);
  private url(submissionId: string): string { return `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/teacher-annotations`; }

  async snapshot(submissionId: string): Promise<AnnotationSnapshot> {
    return (await firstValueFrom(this.http.get<{ data: AnnotationSnapshot }>(this.url(submissionId)))).data;
  }
  async mutate(submissionId: string, body: AnnotationBody): Promise<{ revision: number; replay?: boolean }> {
    return (await firstValueFrom(this.http.post<{ data: { revision: number; replay?: boolean } }>(this.url(submissionId), body))).data;
  }
  async preview(submissionId: string): Promise<StudentPreviewPayload> {
    return (await firstValueFrom(this.http.get<{ data: StudentPreviewPayload }>(`${this.url(submissionId)}/preview`))).data;
  }
  async history(submissionId: string, offset: number): Promise<{ items: HistoryItem[]; nextOffset: number | null }> {
    return (await firstValueFrom(this.http.get<{ data: { items: HistoryItem[]; nextOffset: number | null } }>(`${this.url(submissionId)}/history`, { params: { offset } }))).data;
  }
}
