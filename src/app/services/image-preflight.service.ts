import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export type ImageCheckId = 'orientation' | 'resolution' | 'clarity' | 'lighting' | 'pageVisibility' | 'writingVisibility';
export interface ImageQualityCheck {
  id: ImageCheckId;
  label: string;
  required: boolean;
  status: 'checking' | 'pass' | 'fail' | 'unavailable';
  message?: string;
}
export interface ImagePreflightResult { ready: boolean; checks: ImageQualityCheck[]; }

@Injectable({ providedIn: 'root' })
export class ImagePreflightService {
  private http = inject(HttpClient);

  check(file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ success: boolean; data: ImagePreflightResult }>(
      `${environment.apiUrl}/submissions/image-preflight`, body
    ).pipe(timeout(30000), map(response => {
      if (!response.success || !Array.isArray(response.data?.checks)) throw new Error('Preflight unavailable');
      return response.data;
    }));
  }
}
