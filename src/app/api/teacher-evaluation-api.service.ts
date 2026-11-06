import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { TeacherEvaluationBody, TeacherEvaluationSnapshot } from '../components/teacher/evaluation-editor/teacher-evaluation.logic';

/** Phase B2/B3 teacher evaluation edits. The backend answers 404 when the feature is off or the caller is not the owning teacher. */
@Injectable({ providedIn: 'root' })
export class TeacherEvaluationApiService {
  private readonly http = inject(HttpClient);
  private url(submissionId: string): string { return `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/teacher-evaluation`; }

  /** The snapshot, or null when the feature is not available here (404). Other errors reach the caller. */
  async snapshot(submissionId: string): Promise<TeacherEvaluationSnapshot | null> {
    try {
      return (await firstValueFrom(this.http.get<{ data: TeacherEvaluationSnapshot }>(this.url(submissionId)))).data;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }
  async save(submissionId: string, body: TeacherEvaluationBody): Promise<{ revision: number; replay?: boolean; snapshot: TeacherEvaluationSnapshot }> {
    return (await firstValueFrom(this.http.post<{ data: { revision: number; replay?: boolean; snapshot: TeacherEvaluationSnapshot } }>(this.url(submissionId), body))).data;
  }
}
