import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { filenameFromContentDisposition } from '../utils/assignment-report-pdf.util';

@Injectable({ providedIn: 'root' })
export class PdfApiService {
  constructor(private http: HttpClient) {}

  private getApiBaseUrl(): string {
    return environment.apiUrl;
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

  async downloadStudentWorksheetResultPdf(submissionId: string): Promise<Blob> {
    const apiBaseUrl = this.getApiBaseUrl();
    return firstValueFrom(this.http.get(
      `${apiBaseUrl}/pdf/student-worksheet-result/${encodeURIComponent(submissionId)}`,
      { responseType: 'blob' },
    ));
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

  /** The whole-assignment report PDF (teacher only). filename: the server's name when the header is readable and safe, else null. */
  async downloadAssignmentReportPdf(assignmentId: string, timeZone: string): Promise<{ blob: Blob; filename: string | null }> {
    const response = await firstValueFrom(this.http.get(`${this.getApiBaseUrl()}/pdf/assignment-report/${encodeURIComponent(assignmentId)}`, {
      responseType: 'blob', observe: 'response', params: new HttpParams().set('tz', timeZone)
    }));
    return { blob: response.body ?? new Blob([], { type: 'application/pdf' }),
      filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')) };
  }
}
