import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PdfApiService {
  constructor(private http: HttpClient) {}

  async downloadSubmissionPdf(submissionId: string): Promise<Blob> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;

    return firstValueFrom(
      this.http.get(`${apiBaseUrl}/pdf/download/${encodeURIComponent(submissionId)}`, {
        responseType: 'blob'
      })
    );
  }
}
