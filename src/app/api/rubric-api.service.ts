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

@Injectable({ providedIn: 'root' })
export class RubricApiService {
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
}
