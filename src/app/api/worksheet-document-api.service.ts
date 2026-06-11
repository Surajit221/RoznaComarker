// worksheet-document-api.service.ts
// Angular HTTP client for the Phase 1-4 WorksheetDocument endpoints.
// Separate from WorksheetApiService (which targets the legacy /api/worksheets).

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { WorksheetDocument } from '../models/worksheet-document.model';

export interface GenerateFromTextDto {
  topic: string;
  description?: string;
  subject: string;
  gradeLevel: string;
  gradeCategory?: string;
  cefrLevel?: string;
  teacherId: string;
  questionTypes?: string[];
  activityTypes?: string[];
  questionCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: string;
  colorPreference?: string;
  theme?: string;
  customSelection?: boolean;
}

export interface WorksheetDocumentListResponse {
  worksheets: Partial<WorksheetDocument>[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class WorksheetDocumentApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.API_URL}/worksheet-documents`;
  private readonly genBase = `${environment.API_URL}/worksheets/generate`;

  // ── Generation ────────────────────────────────────────────────────────────

  generateFromText(dto: GenerateFromTextDto): Promise<WorksheetDocument> {
    return firstValueFrom(this.http.post<WorksheetDocument>(`${this.genBase}/text`, dto));
  }

  generateFromFile(formData: FormData): Promise<WorksheetDocument> {
    return firstValueFrom(this.http.post<WorksheetDocument>(`${this.genBase}/file`, formData));
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  list(
    teacherId: string,
    subject?: string,
    page = 1,
    limit = 20,
  ): Promise<WorksheetDocumentListResponse> {
    let params = new HttpParams()
      .set('teacherId', teacherId)
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (subject) params = params.set('subject', subject);
    return firstValueFrom(this.http.get<WorksheetDocumentListResponse>(this.base, { params }));
  }

  getById(id: string): Promise<WorksheetDocument> {
    return firstValueFrom(this.http.get<WorksheetDocument>(`${this.base}/${id}`));
  }

  update(id: string, patch: Partial<WorksheetDocument>): Promise<WorksheetDocument> {
    return firstValueFrom(this.http.put<WorksheetDocument>(`${this.base}/${id}`, patch));
  }

  delete(id: string): Promise<{ success: boolean; id: string }> {
    return firstValueFrom(this.http.delete<{ success: boolean; id: string }>(`${this.base}/${id}`));
  }

  duplicate(id: string): Promise<WorksheetDocument> {
    return firstValueFrom(this.http.post<WorksheetDocument>(`${this.base}/${id}/duplicate`, {}));
  }
}
