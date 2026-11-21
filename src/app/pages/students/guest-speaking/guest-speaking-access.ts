import { Injectable, inject, type Provider } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RecoveryPortalService } from '../../../services/recovery-portal.service';
import { SpeakingApiService, type SpeakingResult } from '../../../api/speaking-api.service';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import { DEFAULT_CORRECTION_LEGEND } from '../../../constants/correction-legend.default';

/** GET /api/guest/speaking/assignments/:qrToken: the guest page before an upload. */
export interface GuestSpeakingEntry {
  kind: 'speaking';
  title: string;
  instructions: string;
  deadline: string | null;
  limits: { maxRecordingSeconds: number; minDurationSeconds: number; maxFileBytes: number };
  /** The notice to accept, and its version (sent back with the upload). */
  consent: { version: string; text: string };
}

/** GET /api/guest/speaking/submissions/:id: the guest's own recording and its result (the student result, field by field). */
export interface GuestSpeakingView {
  kind: 'speaking';
  title: string;
  instructions: string;
  deadline: string | null;
  name: string;
  submittedAt: string | null;
  isLate: boolean;
  uploadedByTeacher: boolean;
  recording: { state: 'processing' | 'ready' | 'failed'; durationSeconds: number | null; contentType: string | null; mediaUrl: string };
  result: Omit<SpeakingResult, 'submissionId'>;
}

// The same tab-only keeping of the link as the essay guest page (guest-student-access.service.ts): a refresh still works; the email stays the
// way back in. The server checks the link on every request.
const RETURN_TOKEN_TAB_MS = 24 * 60 * 60 * 1000;
const TOKEN = /^[\w-]{43}$/;

/** The guest speaking page's access (component-scoped): its own link token, or else a read-only recovery-portal session. Never a login. */
@Injectable()
export class GuestSpeakingAccess {
  private readonly http = inject(HttpClient);
  private readonly portal = inject(RecoveryPortalService);
  private readonly base = `${environment.apiUrl}/guest`;
  submissionId = '';
  token = '';

  restoreReturnToken(id: string, fragment: string | null): string {
    const key = `comarker:guest-return:${id}`;
    try {
      if (fragment) {
        if (TOKEN.test(fragment)) sessionStorage.setItem(key, JSON.stringify({ token: fragment, until: Date.now() + RETURN_TOKEN_TAB_MS }));
        return fragment;
      }
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null') as { token?: unknown; until?: unknown } | null;
      if (saved && typeof saved.until === 'number' && saved.until > Date.now() && typeof saved.token === 'string' && TOKEN.test(saved.token)) return saved.token;
      sessionStorage.removeItem(key);
    } catch { /* No storage: the emailed link stays the way back in. */ }
    return '';
  }

  forgetReturnToken(): void {
    try { sessionStorage.removeItem(`comarker:guest-return:${this.submissionId}`); } catch { /* optional */ }
    this.token = '';
  }

  hasAccess(): boolean { return Boolean(this.token) || Boolean(this.portal.session()); }

  /** The link wins; without it, the portal session (read-only, checked by the server against its email). */
  get headers(): HttpHeaders { return this.token ? new HttpHeaders({ 'X-Guest-Token': this.token }) : this.portal.headers(); }

  entry(qrToken: string): Promise<GuestSpeakingEntry> {
    return firstValueFrom(this.http.get<{ data: GuestSpeakingEntry }>(`${this.base}/speaking/assignments/${encodeURIComponent(qrToken)}`).pipe(map(r => r.data)));
  }

  view(): Promise<GuestSpeakingView> {
    return firstValueFrom(this.http.get<{ data: GuestSpeakingView }>(`${this.base}/speaking/submissions/${encodeURIComponent(this.submissionId)}`,
      { headers: this.headers }).pipe(map(r => r.data)));
  }

  recordingBlob(): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.base}/speaking/submissions/${encodeURIComponent(this.submissionId)}/media`,
      { headers: this.headers, responseType: 'blob' }));
  }
}

/** The page's providers: its access, the recording player reading the guest's own recording (the player itself is unchanged), and the built-in
 *  correction legend for the transcript (as on the essay guest page, guest-student-access.service.ts). */
export const GUEST_SPEAKING_PROVIDERS: Provider[] = [
  GuestSpeakingAccess,
  { provide: SpeakingApiService, useFactory: () => {
    const access = inject(GuestSpeakingAccess);
    return { getRecordingBlob: () => access.recordingBlob() };
  } },
  { provide: WritingCorrectionsApiService, useValue: { getLegend: async () => DEFAULT_CORRECTION_LEGEND } }
];
