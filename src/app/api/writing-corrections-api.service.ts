import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import type { CorrectionLegend } from '../models/correction-legend.model';

export type WritingCorrectionIssue = {
  start: number;
  end: number;
  wrongText: string;
  suggestion: string;
  groupKey: string;
  groupLabel: string;
  symbol: string;
  symbolLabel: string;
  description: string;
  color: string;
  message: string;
};

export type WritingCorrectionsResponse = {
  text: string;
  issues: WritingCorrectionIssue[];
  legendSource?: 'LANGUAGETOOL_STATIC' | string;
  imageAnnotations?: Array<{
    page: number;
    bbox: { x: number; y: number; width: number; height: number };
    legendKey: string;
    message: string;
    suggestion: string;
    color?: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class WritingCorrectionsApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async getLegend(): Promise<CorrectionLegend> {
    const apiBaseUrl = this.getApiBaseUrl();
    return firstValueFrom(this.http.get<CorrectionLegend>(`${apiBaseUrl}/writing-corrections/legend`));
  }

  async check(payload: { text: string; language?: string; submissionId?: string }): Promise<WritingCorrectionsResponse> {
    const apiBaseUrl = this.getApiBaseUrl();
    return firstValueFrom(
      this.http.post<WritingCorrectionsResponse>(`${apiBaseUrl}/writing-corrections/check`, payload)
    );
  }
}
