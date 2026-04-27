import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PdfApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return `${environment.apiUrl}/api`;
  }

  async downloadSubmissionPdf(submissionId: string): Promise<Blob> {
    const apiBaseUrl = this.getApiBaseUrl();

    return firstValueFrom(
      this.http.get(`${apiBaseUrl}/pdf/download/${encodeURIComponent(submissionId)}`, {
        responseType: 'blob'
      })
    );
  }

  async downloadWorksheetSubmissionPdf(submissionId: string): Promise<Blob> {
    const apiBaseUrl = this.getApiBaseUrl();

    return firstValueFrom(
      this.http.get(`${apiBaseUrl}/pdf/download-worksheet/${encodeURIComponent(submissionId)}`, {
        responseType: 'blob'
      })
    );
  }

  async downloadWorksheetReportPdf(worksheetId: string): Promise<Blob> {
    const apiBaseUrl = this.getApiBaseUrl();

    return firstValueFrom(
      this.http.get(`${apiBaseUrl}/pdf/worksheet-report/${encodeURIComponent(worksheetId)}`, {
        responseType: 'blob'
      })
    );
  }

  async downloadFlashcardReportPdf(setId: string, assignmentId?: string): Promise<Blob> {
    const apiBaseUrl = this.getApiBaseUrl();
    const qs = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : '';

    return firstValueFrom(
      this.http.get(`${apiBaseUrl}/pdf/flashcard-report/${encodeURIComponent(setId)}${qs}`, {
        responseType: 'blob'
      })
    );
  }
}
