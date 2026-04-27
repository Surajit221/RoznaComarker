import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import type { BackendClass } from './class-api.service';
import type { RubricDesigner } from '../models/submission-feedback.model';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendAssignment = {
  _id: string;
  title: string;
  writingType?: string;
  instructions?: string;
  rubric?: string;
  rubrics?: any;
  deadline: string;
  class: BackendClass | string;
  teacher: any;
  qrToken: string;
  allowLateResubmission?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present when the assignment links to a flashcard set or worksheet (Issue 3) */
  resourceType?: 'essay' | 'flashcard' | 'worksheet';
  /** The _id of the linked FlashcardSet or Worksheet document */
  resourceId?: string;
};

export type BackendFlashcardAssignmentSubmission = {
  _id: string;
  flashcardSetId: string;
  assignmentId?: string;
  userId: {
    _id: string;
    email?: string;
    displayName?: string;
    photoURL?: string;
  } | string;
  score?: number;
  timeTaken?: number;
  results?: Array<{ cardId?: string; status?: string }>;
  submittedAt?: string;
};

@Injectable({ providedIn: 'root' })
export class AssignmentApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getClassAssignments(classId: string): Promise<BackendAssignment[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(
        `${apiBaseUrl}/assignments/class/${encodeURIComponent(classId)}`
      )
    );
    return resp?.data || [];
  }

  async createAssignment(payload: {
    title: string;
    classId: string;
    deadline: string;
    writingType: string;
    instructions?: string;
    rubric?: any;
    rubrics?: any;
    allowLateResubmission?: boolean;
  }): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/assignments`, payload)
    );
    return resp.data;
  }

  async getMyAssignments(): Promise<BackendAssignment[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment[]>>(`${apiBaseUrl}/assignments/my`)
    );
    return resp?.data || [];
  }

  async getAssignmentById(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment>>(`${apiBaseUrl}/assignments/${encodeURIComponent(id)}`)
    );
    return resp.data;
  }

  async getAssignmentByIdForTeacher(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/teacher/${encodeURIComponent(id)}`
      )
    );
    return resp.data;
  }

  async updateAssignment(
    id: string,
    payload: {
      title?: string;
      writingType?: string;
      instructions?: string | null;
      rubric?: any;
      rubrics?: any;
      deadline?: string;
      allowLateResubmission?: boolean;
    }
  ): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.patch<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}`,
        payload
      )
    );
    return resp.data;
  }

  async updateAssignmentRubrics(
    id: string,
    payload: {
      rubrics?: any;
      rubricDesigner?: RubricDesigner | null;
    }
  ): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.patch<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}/rubrics`,
        payload
      )
    );
    return resp.data;
  }

  async deleteAssignment(id: string): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.delete<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(id)}`
      )
    );
    return resp.data;
  }

  async generateRubricDesignerFromPrompt(assignmentId: string, prompt: string): Promise<RubricDesigner> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<RubricDesigner>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/generate-rubric-prompt`,
        { prompt }
      )
    );
    return resp.data;
  }

  async uploadRubricFile(assignmentId: string, file: File): Promise<BackendAssignment> {
    const apiBaseUrl = this.getApiBaseUrl();
    const fd = new FormData();
    fd.append('file', file);
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendAssignment>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/rubric-file`,
        fd
      )
    );
    return resp.data;
  }

  /**
   * Student submits flashcard assignment results (GAP 1 / PART 1).
   * Backend records FlashcardSubmission tied to the assignment.
   * @param assignmentId the Assignment._id
   * @param payload { score 0-100, timeTaken seconds, results array }
   * @returns FlashcardSubmission document
   */
  async submitFlashcardAssignment(
    assignmentId: string,
    payload: {
      score: number;
      timeTaken: number;
      template?: string;
      totalCards?: number;
      cardResults?: Array<{ cardId: string; known: boolean; studentAnswer?: string | null; isCorrect?: boolean | null }>;
      results?: Array<{ cardId: string; status: string }>;
    }
  ): Promise<unknown> {
    const apiBaseUrl = this.getApiBaseUrl();
    const resp = await firstValueFrom(
      this.http.post<BackendResponse<unknown>>(
        `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/submit`,
        payload
      )
    );
    return resp.data;
  }

  /**
   * Student checks if they already have a submission for an assignment (GAP 4).
   * Returns null if no submission exists, throws HttpErrorResponse with status 404.
   * @param assignmentId the Assignment._id
   * @returns FlashcardSubmission or null
   */
  async getMyFlashcardSubmission(assignmentId: string): Promise<{
    score: number;
    timeTaken: number;
    assignmentId: string;
    flashcardSetId?: string;
    template?: string;
    totalCards?: number;
    cardResults?: Array<{ cardId: string; known: boolean; studentAnswer?: string; isCorrect?: boolean }>;
    cards?: Array<{ _id: string; front: string; back: string; template?: string }>;
  } | null> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<any>>(
          `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/my-submission`
        )
      );
      return resp.data;
    } catch {
      return null;
    }
  }

  async getFlashcardAssignmentSubmissions(assignmentId: string): Promise<BackendFlashcardAssignmentSubmission[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendFlashcardAssignmentSubmission[]>>(
          `${apiBaseUrl}/assignments/${encodeURIComponent(assignmentId)}/submissions`
        )
      );
      return resp?.data || [];
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        return [];
      }
      throw err;
    }
  }
}
