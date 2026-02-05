import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, map, type Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import type { FeedbackAnnotation } from '../models/feedback-annotation.model';

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
  ocrText?: string;
  aiFeedback?: any;
  visualAnnotations?: Array<{
    id: string;
    category: string;
    symbol: string;
    page: number;
    color: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    targetText?: string;
    suggestion?: string;
    explanation?: string;
  }>;
  aiGeneratedAt?: string;
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
        `${apiBaseUrl}/feedback/submission/${encodeURIComponent(submissionId)}`
      )
    );
    return resp.data;
  }

  async getFeedbackByIdForTeacher(feedbackId: string): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/feedback/${encodeURIComponent(feedbackId)}`
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
        `${apiBaseUrl}/feedback/${encodeURIComponent(submissionId)}`,
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
        `${apiBaseUrl}/feedback/${encodeURIComponent(feedbackId)}`,
        form
      )
    );

    return resp.data;
  }

  async generateAiFeedback(payload: {
    submissionId: string;
    ocrText?: string;
    correctionLegend: any;
    language?: string;
    metadata?: any;
    preDetectedIssues?: any;
    contextualFeedback?: any;
    rubricScores?: any;
    imageAnnotations?: any;
  }): Promise<BackendFeedback> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const { submissionId, ...rest } = payload;

    const resp = await firstValueFrom(
      this.http.post<BackendResponse<BackendFeedback>>(
        `${apiBaseUrl}/feedback/ai/${encodeURIComponent(submissionId)}`,
        rest
      )
    );

    return resp.data;
  }

  analyzeSubmission(submissionId: string): Observable<FeedbackAnnotation[]> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;

    return this.http
      .post<BackendResponse<FeedbackAnnotation[]>>(
        `${apiBaseUrl}/feedback/ai-analyze/${encodeURIComponent(submissionId)}`,
        null
      )
      .pipe(
        map((resp) => resp?.data || []),
        catchError((error: any) => {
          console.error('Analyze submission failed:', error?.error || error);
          return throwError(() => error);
        })
      );
  }

  getAnnotations(submissionId: string): Observable<FeedbackAnnotation[]> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;

    return this.http
      .get<BackendResponse<FeedbackAnnotation[]>>(
        `${apiBaseUrl}/feedback/annotations/${encodeURIComponent(submissionId)}`
      )
      .pipe(
        map((resp) => resp?.data || []),
        catchError((error: any) => {
          console.error('Get annotations failed:', error?.error || error);
          return throwError(() => error);
        })
      );
  }
}
