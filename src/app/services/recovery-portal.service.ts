import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RecoveredAssignment {
  id: string;
  assignmentTitle: string;
  className: string;
  submittedAt: string | null;
  /** Guest work only (it opens from the list). */
  status?: 'ready' | 'processing' | 'failed';
  /** 'signIn': work saved on the student account with this address; it opens only after signing in (no status, no results). */
  access?: 'signIn';
}

const SESSION_KEY = 'comarker:recovery-session';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Multi-assignment recovery portal. The emailed link token is exchanged once for a short-lived, read-only portal session.
 * Only the session is kept (this tab only, until it expires); it is never an application login.
 */
@Injectable({ providedIn: 'root' })
export class RecoveryPortalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/recovery`;
  // Fallback when the browser blocks sessionStorage (some private modes): the session then lives only in this page.
  private memory: { session: string; until: number } | null = null;

  static isToken(value: unknown): value is string {
    return typeof value === 'string' && TOKEN_SHAPE.test(value);
  }

  /** The server's generic answer and its fixed cool-down (the same for every address). */
  requestLink(email: string): Promise<{ message: string; retryAfterSeconds?: number }> {
    return firstValueFrom(this.http.post<{ data: { message: string; retryAfterSeconds?: number } }>(`${this.base}/request`, { email }).pipe(map(r => r.data)));
  }

  async exchange(token: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<{ data: { session: string; expiresAt: string } }>(`${this.base}/exchange`, { token }));
    this.store(response.data.session, Date.parse(response.data.expiresAt));
  }

  listAssignments(): Promise<RecoveredAssignment[]> {
    return firstValueFrom(this.http.get<{ data: { assignments: RecoveredAssignment[] } }>(`${this.base}/assignments`,
      { headers: this.headers() }).pipe(map(r => r.data.assignments)));
  }

  async endSession(): Promise<void> {
    const session = this.session();
    this.forget();
    if (session) await firstValueFrom(this.http.delete(`${this.base}/session`, { headers: new HttpHeaders({ 'X-Recovery-Session': session }) })).catch(() => undefined);
  }

  /** The current portal session, or '' when there is none or it has expired. */
  session(): string {
    if (this.memory && this.memory.until > Date.now()) return this.memory.session;
    this.memory = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as { session?: unknown; until?: unknown } | null;
      if (saved && RecoveryPortalService.isToken(saved.session) && typeof saved.until === 'number' && saved.until > Date.now()) return saved.session;
      sessionStorage.removeItem(SESSION_KEY);
    } catch { /* No storage: the emailed link stays the way back in. */ }
    return '';
  }

  forget(): void {
    this.memory = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional session */ }
  }

  headers(): HttpHeaders {
    const session = this.session();
    return session ? new HttpHeaders({ 'X-Recovery-Session': session }) : new HttpHeaders();
  }

  private store(session: string, until: number): void {
    if (!RecoveryPortalService.isToken(session) || !Number.isFinite(until)) throw new Error('Invalid portal session');
    this.memory = { session, until };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ session, until })); } catch { /* memory copy above still works */ }
  }
}
