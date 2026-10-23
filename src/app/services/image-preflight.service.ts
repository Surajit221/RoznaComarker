import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { concat, map, of, switchMap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import type { ProcessingProgress } from '../components/analysis-progress/analysis-progress';

export type ImageCheckId = 'orientation' | 'resolution' | 'clarity' | 'lighting' | 'pageVisibility' | 'writingVisibility' | 'handwritingReadability';
export interface ImageQualityCheck {
  id: ImageCheckId;
  label: string;
  required: boolean;
  status: 'checking' | 'pass' | 'fail' | 'unavailable';
  message?: string;
}
export interface ImagePreflightResult { processingProgress?: ProcessingProgress; ready: boolean; checks: ImageQualityCheck[]; basicChecksPassed?: boolean; sourceReadRequired?: boolean;
  sourceReadStatus?: 'CHECKING' | 'PASSED' | 'FAILED_IMAGE' | 'FAILED_SERVICE'; canSubmit?: boolean; sourceReadErrorCode?: string; message?: string; }

@Injectable({ providedIn: 'root' })
export class ImagePreflightService {
  private http = inject(HttpClient);

  check(file: File, assignmentId?: string | null) {
    const send = (phase: 'basic' | 'source') => {
    const body = new FormData();
    body.append('file', file);
    body.append('phase', phase);
    if (assignmentId) body.append('assignmentId', assignmentId);
    return this.http.post<{ success: boolean; data: ImagePreflightResult }>(
      `${environment.apiUrl}/submissions/image-preflight`, body
    ).pipe(timeout(phase === 'basic' ? 120000 : 240000), map(response => {
      if (!response.success || !Array.isArray(response.data?.checks)) throw new Error('Preflight unavailable');
      return response.data;
    }));
    };
    return send('basic').pipe(switchMap(result => result.sourceReadRequired && result.basicChecksPassed
      ? concat(of(result), send('source')) : of(result)));
  }
}
