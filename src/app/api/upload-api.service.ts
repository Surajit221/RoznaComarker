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

@Injectable({ providedIn: 'root' })
export class UploadApiService {
  constructor(private http: HttpClient) {}

  uploadFile(file: File, assignmentId: string): Observable<HttpEvent<BackendUploadResponse>> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assignmentId', assignmentId);

    return this.http.post<BackendUploadResponse>(`${apiBaseUrl}/upload`, formData, {
      observe: 'events',
      reportProgress: true
    });
  }

  uploadHandwrittenForOcr(file: File): Observable<HttpEvent<BackendHandwrittenUploadResponse>> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;

    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<BackendHandwrittenUploadResponse>(`${apiBaseUrl}/api/submissions/upload`, formData, {
      observe: 'events',
      reportProgress: true
    });
  }
}
