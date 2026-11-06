import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** The teacher's panel (backend IMPROVED_WRITING_MODEL_ENABLED). */
export interface WritingModelSnapshot {
  enabled: boolean; text: string; status: 'none' | 'draft' | 'approved'; source: 'teacher' | 'ai'; releaseRule: 'afterRevision' | 'manual';
  released: boolean; releasedAt: string | null; revision: number; updatedAt: string | null; readOnly: boolean; aiAvailable: boolean;
  generationsToday: number; generationsPerDay: number; textMax: number;
}
export interface WritingModelSaveBody {
  requestId: string; revision: number; text?: string; status?: 'draft' | 'approved'; releaseRule?: 'afterRevision' | 'manual'; released?: boolean;
}
/** What a student or guest may see: the approved, released text, or nothing. */
export interface WritingModelForStudent { available: boolean; text?: string; }

/** Improved Writing Model. The backend answers 404 when the feature is off or the caller may not use it: these calls then return null. */
@Injectable({ providedIn: 'root' })
export class WritingModelApiService {
  private readonly http = inject(HttpClient);
  private teacherUrl(assignmentId: string): string { return `${environment.apiUrl}/assignments/${encodeURIComponent(assignmentId)}/writing-model`; }

  async snapshot(assignmentId: string): Promise<WritingModelSnapshot | null> {
    return this.orNull(async () => (await firstValueFrom(this.http.get<{ data: WritingModelSnapshot }>(this.teacherUrl(assignmentId)))).data);
  }
  async save(assignmentId: string, body: WritingModelSaveBody): Promise<{ snapshot: WritingModelSnapshot; replay?: boolean }> {
    return (await firstValueFrom(this.http.put<{ data: { snapshot: WritingModelSnapshot; replay?: boolean } }>(this.teacherUrl(assignmentId), body))).data;
  }
  async generate(assignmentId: string, body: { requestId: string; revision: number }): Promise<{ snapshot: WritingModelSnapshot; charged?: boolean; replay?: boolean }> {
    return (await firstValueFrom(this.http.post<{ data: { snapshot: WritingModelSnapshot; charged?: boolean; replay?: boolean } }>(`${this.teacherUrl(assignmentId)}/generate-draft`, body))).data;
  }
  /** The student's own submission. Guests get the same answer through the guest providers. */
  async forSubmission(submissionId: string): Promise<WritingModelForStudent | null> {
    return this.orNull(async () => (await firstValueFrom(this.http.get<{ data: WritingModelForStudent }>(
      `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/writing-model`))).data);
  }

  private async orNull<T>(call: () => Promise<T>): Promise<T | null> {
    try { return await call(); } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) return null;
      throw error;
    }
  }
}
