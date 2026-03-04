import { Injectable } from '@angular/core';
import { HttpClient, type HttpEvent } from '@angular/common/http';
import type { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import type { BackendSubmission } from './submission-api.service';

export type BackendUploadResponse = {
  success: boolean;
  fileUrl: string;
  fileName: string;
  message?: string;
};

export type BackendHandwrittenUploadResponse = {
  success: boolean;
  fileUrl: string;
  submissionId: string;
  ocrStatus?: 'pending' | 'completed' | 'failed';
  ocrText?: string;
  ocrError?: string;
  message?: string;
};

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class UploadApiService {
  constructor(private http: HttpClient) {}

  private getRootBaseUrl(): string {
    return `${environment.apiUrl}`;
  }

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  submitSubmissionFiles(files: File[], assignmentId: string): Observable<HttpEvent<BackendResponse<BackendSubmission>>> {
    const apiBaseUrl = this.getApiBaseUrl();

    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    const formData = new FormData();

    if (list.length === 1) {
      formData.append('file', list[0]);
    } else {
      for (const f of list) {
        formData.append('files', f);
      }
    }

    return this.http.post<BackendResponse<BackendSubmission>>(
      `${apiBaseUrl}/submissions/${encodeURIComponent(assignmentId)}`,
      formData,
      {
        observe: 'events',
        reportProgress: true
      }
    );
  }

  uploadFile(file: File, assignmentId: string): Observable<HttpEvent<BackendUploadResponse>> {
    const rootBaseUrl = this.getRootBaseUrl();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assignmentId', assignmentId);

    return this.http.post<BackendUploadResponse>(`${rootBaseUrl}/upload`, formData, {
      observe: 'events',
      reportProgress: true
    });
  }

  uploadHandwrittenForOcr(file: File): Observable<HttpEvent<BackendHandwrittenUploadResponse>> {
    const apiBaseUrl = this.getApiBaseUrl();

    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<BackendHandwrittenUploadResponse>(`${apiBaseUrl}/submissions/upload`, formData, {
      observe: 'events',
      reportProgress: true
    });
  }
}
