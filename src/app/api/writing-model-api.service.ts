import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * The teacher's panel for ONE submission (backend IMPROVED_WRITING_MODEL_ENABLED): an improved version of that student's own writing.
 * visibility: 'draft' (nothing submitted), 'released' (this student sees it), 'waiting' (submitted; shown after the student's second draft).
 */
export interface WritingModelSnapshot {
  enabled: boolean; text: string; source: 'teacher' | 'ai'; releaseRule: 'manual' | 'afterRevision';
  visibility: 'draft' | 'released' | 'waiting';
  published: { at: string; rule: 'manual' | 'afterRevision'; sameAsDraft: boolean } | null;
  /** This student's writing changed (re-marking, re-reading or a new draft) since the text in the box was written or generated. */
  writingChanged: boolean; hasTranscript: boolean; draftNumber: number;
  revision: number; updatedAt: string | null; readOnly: boolean; aiAvailable: boolean;
  generationsToday: number; generationsPerDay: number; textMax: number;
  /** The old model shared by the whole assignment: kept, no longer shown to any student (read-only here). */
  legacyAssignmentModel: { text: string; updatedAt: string | null } | null;
}
/** save: the working text only ("Save draft"); submit: publish it to this student ("Submit Improved Writing to Student"). */
export interface WritingModelSaveBody {
  requestId: string; revision: number; action: 'save' | 'submit'; text?: string; releaseRule?: 'manual' | 'afterRevision';
}
/** What a student or guest may see for their own submission: the submitted text, or nothing. */
export interface WritingModelForStudent { available: boolean; text?: string; }

/** Improved Writing Model. The backend answers 404 when the feature is off or the caller may not use it: these calls then return null. */
@Injectable({ providedIn: 'root' })
export class WritingModelApiService {
  private readonly http = inject(HttpClient);
  private teacherUrl(submissionId: string): string { return `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/writing-model/teacher`; }

  async snapshot(submissionId: string): Promise<WritingModelSnapshot | null> {
    return this.orNull(async () => (await firstValueFrom(this.http.get<{ data: WritingModelSnapshot }>(this.teacherUrl(submissionId)))).data);
  }
  async save(submissionId: string, body: WritingModelSaveBody): Promise<{ snapshot: WritingModelSnapshot; replay?: boolean }> {
    return (await firstValueFrom(this.http.put<{ data: { snapshot: WritingModelSnapshot; replay?: boolean } }>(this.teacherUrl(submissionId), body))).data;
  }
  async generate(submissionId: string, body: { requestId: string; revision: number }): Promise<{ snapshot: WritingModelSnapshot; charged?: boolean; replay?: boolean }> {
    return (await firstValueFrom(this.http.post<{ data: { snapshot: WritingModelSnapshot; charged?: boolean; replay?: boolean } }>(`${this.teacherUrl(submissionId)}/generate-draft`, body))).data;
  }
  /** The student's own submission. Guests get the same answer through the guest providers. */
  async forSubmission(submissionId: string): Promise<WritingModelForStudent | null> {
    return this.orNull(async () => (await firstValueFrom(this.http.get<{ data: WritingModelForStudent }>(
      `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/writing-model`))).data);
  }

  private async orNull<T>(call: () => Promise<T>): Promise<T | null> {
    try { return await call(); } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 403)) return null;
      throw error;
    }
  }
}
