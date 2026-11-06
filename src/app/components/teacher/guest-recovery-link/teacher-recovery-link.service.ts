import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface RecoveryLinkStatus {
  available: boolean;
  reason: 'registered' | 'revoked' | 'no_email' | null;
  emailMasked: string | null;
  lastSentAt: string | null;
}
export interface RecoveryLinkSent { sent: true; emailMasked: string; lastSentAt: string }

/** Teacher-sent recovery link for one guest submission. The server picks the recipient (the stored email); nothing is sent in the body. */
@Injectable({ providedIn: 'root' })
export class TeacherRecoveryLinkService {
  private readonly http = inject(HttpClient);
  private url(submissionId: string): string {
    return `${environment.apiUrl}/submissions/${encodeURIComponent(submissionId)}/guest-access/recovery-link`;
  }
  status(submissionId: string): Promise<RecoveryLinkStatus> {
    return firstValueFrom(this.http.get<{ data: RecoveryLinkStatus }>(this.url(submissionId)).pipe(map(r => r.data)));
  }
  send(submissionId: string): Promise<RecoveryLinkSent> {
    return firstValueFrom(this.http.post<{ data: RecoveryLinkSent }>(this.url(submissionId), null).pipe(map(r => r.data)));
  }
}
