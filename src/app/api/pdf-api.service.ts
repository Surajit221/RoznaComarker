import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

export type PdfResponse = {
  pdfUrl: string;
};

@Injectable({ providedIn: 'root' })
export class PdfApiService {
  constructor(private http: HttpClient) {}

  async getPdfUrl(submissionId: string): Promise<string> {
    const apiBaseUrl = (environment as any).API_URL || environment.apiBaseUrl;
    const resp = await firstValueFrom(
      this.http.get<PdfResponse>(`${apiBaseUrl}/pdf/${encodeURIComponent(submissionId)}`)
    );

    return resp?.pdfUrl || '';
  }
}
