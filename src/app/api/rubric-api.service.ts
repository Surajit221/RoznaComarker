import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

type BackendResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

type TemplateParseResponse<T> = {
  success: boolean;
  rubric: T;
  message?: string;
};

export type ParsedRubricLevel = { name: string; score: number };
export type ParsedRubricCriteria = { title: string; descriptions: string[] };

export type ParsedRubric = {
  title: string;
  levels: ParsedRubricLevel[];
  criteria: ParsedRubricCriteria[];
};

export interface SavedRubricLevel { title: string; score: number; description: string; }
export interface SavedRubricCriterion { name: string; weight: number; levels: SavedRubricLevel[]; }
export interface SavedRubricData { totalPoints: number; criteria: SavedRubricCriterion[]; }
export interface SavedRubric {
  _id: string;
  name: string;
  description?: string;
  writingType?: string;
  rubricData: SavedRubricData;
  sourceAssignmentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RubricApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return environment.apiUrl;
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

  async parseRubricFile(file: File): Promise<ParsedRubric> {
    const apiBaseUrl = this.getApiBaseUrl();
    const fd = new FormData();
    fd.append('file', file);

    try {
      const resp = await firstValueFrom(
        this.http.post<BackendResponse<ParsedRubric>>(`${apiBaseUrl}/rubrics/parse-rubric-file`, fd)
      );
      return resp.data;
    } catch (err) {
      this.logHttpError('parseRubricFile', err);
      throw err;
    }
  }

  async parseRubricTemplate(file: File): Promise<ParsedRubric> {
    const apiBaseUrl = this.getApiBaseUrl();
    const fd = new FormData();
    fd.append('file', file);

    try {
      const resp = await firstValueFrom(
        this.http.post<TemplateParseResponse<ParsedRubric>>(`${apiBaseUrl}/rubrics/parse-template`, fd)
      );
      return resp.rubric;
    } catch (err) {
      this.logHttpError('parseRubricTemplate', err);
      throw err;
    }
  }

  async listSavedRubrics(search = ''): Promise<SavedRubric[]> {
    const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    const response = await firstValueFrom(this.http.get<BackendResponse<SavedRubric[]>>(
      `${this.getApiBaseUrl()}/rubrics${suffix}`
    ));
    return response.data;
  }

  async getSavedRubric(id: string): Promise<SavedRubric> {
    const response = await firstValueFrom(this.http.get<BackendResponse<SavedRubric>>(
      `${this.getApiBaseUrl()}/rubrics/${encodeURIComponent(id)}`
    ));
    return response.data;
  }

  async createSavedRubric(body: { name: string; description?: string; writingType?: string; rubricData: SavedRubricData }): Promise<SavedRubric> {
    const response = await firstValueFrom(this.http.post<BackendResponse<SavedRubric>>(`${this.getApiBaseUrl()}/rubrics`, body));
    return response.data;
  }

  async saveFromAssignment(assignmentId: string, body: { name: string; description?: string }): Promise<SavedRubric> {
    const response = await firstValueFrom(this.http.post<BackendResponse<SavedRubric>>(
      `${this.getApiBaseUrl()}/rubrics/from-assignment/${encodeURIComponent(assignmentId)}`, body
    ));
    return response.data;
  }

  async updateSavedRubric(id: string, body: Partial<Pick<SavedRubric, 'name' | 'description' | 'writingType' | 'rubricData'>>): Promise<SavedRubric> {
    const response = await firstValueFrom(this.http.patch<BackendResponse<SavedRubric>>(
      `${this.getApiBaseUrl()}/rubrics/${encodeURIComponent(id)}`, body
    ));
    return response.data;
  }

  async duplicateSavedRubric(id: string): Promise<SavedRubric> {
    const response = await firstValueFrom(this.http.post<BackendResponse<SavedRubric>>(
      `${this.getApiBaseUrl()}/rubrics/${encodeURIComponent(id)}/duplicate`, {}
    ));
    return response.data;
  }

  async archiveSavedRubric(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.getApiBaseUrl()}/rubrics/${encodeURIComponent(id)}`));
  }
}
