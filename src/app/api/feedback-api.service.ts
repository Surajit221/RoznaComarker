import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type BackendFeedback = {
  _id: string;
  teacher: any;
  student: any;
  class: any;
  assignment: any;
  submission: any;
  textFeedback?: string;
  score?: number;
  maxScore?: number;
  annotations?: Array<{ page: number; comment: string; x: number; y: number }>;
  file?: any;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class FeedbackApiService {
  constructor(private http: HttpClient) {}

  async getFeedbackBySubmissionForStudent(submissionId: string): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/api/feedback/submission/${encodeURIComponent(submissionId)}`
      )
    );
    return resp.data;
  }

  async getFeedbackByIdForTeacher(feedbackId: string): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/api/feedback/${encodeURIComponent(feedbackId)}`
      )
    );
    return resp.data;
  }

  async createFeedback(payload: {
    submissionId: string;
    textFeedback?: string;
    score?: number;
    maxScore?: number;
    annotations?: any;
    file?: File;
  }): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const { submissionId, file, ...rest } = payload;

    const form = new FormData();
    Object.entries(rest).forEach(([k, v]) => {
      if (typeof v === 'undefined' || v === null) return;
      if (k === 'annotations') {
        form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
        return;
      }
      form.append(k, String(v));
    });

    if (file) {
      form.append('file', file);
    }

    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/api/feedback/${encodeURIComponent(submissionId)}`,
        form
      )
    );

    return resp.data;
  }

  async updateFeedback(payload: {
    feedbackId: string;
    textFeedback?: string;
    score?: number;
    maxScore?: number;
    annotations?: any;
    file?: File;
  }): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const { feedbackId, file, ...rest } = payload;

    const form = new FormData();
    Object.entries(rest).forEach(([k, v]) => {
      if (typeof v === 'undefined' || v === null) return;
      if (k === 'annotations') {
        form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
        return;
      }
      form.append(k, String(v));
    });

    if (file) {
      form.append('file', file);
    }

    const resp = await firstValueFrom(
      this.http.put<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/api/feedback/${encodeURIComponent(feedbackId)}`,
        form
      )
    );

    return resp.data;
  }
}
