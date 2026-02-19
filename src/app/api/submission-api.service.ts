import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendUserLite = {
  _id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: string;
};

export type BackendFile = {
  _id: string;
  originalName: string;
  filename: string;
  path: string;
  url: string;
  uploadedBy: string;
  role: 'teacher' | 'student';
  type: 'assignments' | 'submissions' | 'feedback';
  createdAt: string;
};

export type BackendSubmission = {
  _id: string;
  student: BackendUserLite | string;
  assignment: any;
  class: any;
  file: BackendFile | string;
  fileUrl: string;
  status: 'submitted' | 'late' | 'missing';
  submittedAt: string;
  isLate: boolean;
  qrToken?: string;
  transcriptText?: string;
  ocrStatus?: 'pending' | 'completed' | 'failed';
  ocrText?: string;
  ocrError?: string;
  ocrUpdatedAt?: string;
  feedback?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class SubmissionApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  private logHttpError(context: string, err: unknown) {
    if (err instanceof HttpErrorResponse) {
      console.error(`[${context}] HTTP error`, {
        url: err.url,
        status: err.status,
        statusText: err.statusText,
        message: err.message,
        error: err.error
      });
      return;
    }

    console.error(`[${context}] Unknown error`, err);
  }

  async submitToAssignment(assignmentId: string, file: File): Promise<BackendSubmission> {
    const apiBaseUrl = this.getApiBaseUrl();
    const form = new FormData();
    form.append('file', file);

    try {
      const resp = await firstValueFrom(
        this.http.post<BackendResponse<BackendSubmission>>(
          `${apiBaseUrl}/submissions/${encodeURIComponent(assignmentId)}`,
          form
        )
      );

      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('submitToAssignment', err);
      throw err;
    }
  }

  async getMySubmissions(): Promise<BackendSubmission[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendSubmission[]>>(`${apiBaseUrl}/submissions/my`)
      );
      return resp?.data || [];
    } catch (err: unknown) {
      this.logHttpError('getMySubmissions', err);
      throw err;
    }
  }

  async getMySubmissionByAssignmentId(assignmentId: string): Promise<BackendSubmission> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendSubmission>>(
          `${apiBaseUrl}/submissions/assignment/${encodeURIComponent(assignmentId)}/my`
        )
      );
      return resp.data;
    } catch (err: unknown) {
      this.logHttpError('getMySubmissionByAssignmentId', err);
      throw err;
    }
  }

  async getSubmissionsByAssignment(assignmentId: string): Promise<BackendSubmission[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    try {
      const resp = await firstValueFrom(
        this.http.get<BackendResponse<BackendSubmission[]>>(
          `${apiBaseUrl}/submissions/assignment/${encodeURIComponent(assignmentId)}`
        )
      );
      return resp?.data || [];
    } catch (err: unknown) {
      this.logHttpError('getSubmissionsByAssignment', err);
      throw err;
    }
  }
}
