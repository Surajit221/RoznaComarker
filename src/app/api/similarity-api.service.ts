import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// Similarity Reporting (teacher only). The server's DTOs, field by field. Percentages are computed by the server on every read; the page
// never adds them up itself. A source from another teacher's class carries only its label and percentage.

export type SimilarityState = 'none' | 'queued' | 'running' | 'submitted' | 'completed' | 'failed' | 'expired';
export type SimilarityExternalState = 'skipped' | 'not_configured' | 'not_permitted' | 'pending' | 'submitted' | 'completed' | 'failed' | 'expired';
export type SimilarityReason = 'no_text' | 'transcript_not_confirmed' | 'too_long' | null;
export type SimilaritySourceKind = 'web' | 'repository' | 'internal';

export interface SimilaritySpan { start: number; end: number; }
export interface SimilarityOpenLink { studentId: string; classId: string; assignmentId: string; submissionId: string; }
export interface SimilaritySource {
  sourceId: string;
  /** 1, 2, 3 ... for sources that count; null when excluded, not compared, or every word belongs to a higher source. */
  number: number | null;
  kind: SimilaritySourceKind;
  label: string;
  /** null while excluded or not compared. */
  percent: number | null;
  words: number;
  excluded: boolean;
  compared: boolean;
  approxWords?: number;
  title?: string;
  url?: string;
  /** A provider's comparison page: shown and opened exactly as given. */
  viewUrl?: string;
  /** Where this source matches the essay (absent for another teacher's submission). */
  spans?: SimilaritySpan[];
  /** Only for a submission in the teacher's own class. */
  open?: SimilarityOpenLink;
}
export interface SimilarityHighlight { start: number; end: number; sourceId: string; }
export interface SimilarityPanelBase {
  state: SimilarityState;
  eligible: boolean;
  reason: SimilarityReason;
  wordCount: number;
  checksLeftToday: number;
  checksLeftForSubmission: number;
  externalAvailable: boolean;
  noticeShown: boolean;
}
export interface SimilarityReport extends SimilarityPanelBase {
  revision: number;
  checkedAt: string | null;
  outdated: boolean;
  text: string;
  totalWords: number;
  matchedWords: number;
  overallPercent: number;
  external: { state: SimilarityExternalState; reason: string | null };
  settings: { excludeQuotes: boolean; minMatchWords: number };
  sources: SimilaritySource[];
  highlights: SimilarityHighlight[];
  audit: { provider: string | null; units: number | null; costUsd: number | null; resultCount: number | null };
  failed?: { reason: string | null };
}
export type SimilarityView = SimilarityPanelBase | SimilarityReport;
export const isReport = (view: SimilarityView | null): view is SimilarityReport => Boolean(view && 'revision' in view);

export interface Envelope<T> { success: boolean; data: T; }
/** The error body the server sends (code SIMILARITY_*); a revision conflict also carries the current report. */
export interface SimilarityError { status: number; code: string | null; reason: string | null; report: SimilarityReport | null; }

export function newSimilarityRequestId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `sim_${random}`;
}

/** The HTTP error as a SimilarityError (status 0 for a network failure). */
export function similarityErrorOf(error: unknown): SimilarityError {
  if (!(error instanceof HttpErrorResponse)) return { status: 0, code: null, reason: null, report: null };
  const body = (error.error && typeof error.error === 'object') ? error.error as Record<string, unknown> : {};
  const data = body['data'] as SimilarityReport | undefined;
  return { status: error.status, code: typeof body['code'] === 'string' ? body['code'] as string : null,
    reason: typeof body['reason'] === 'string' ? body['reason'] as string : null, report: data && isReport(data) ? data : null };
}

@Injectable({ providedIn: 'root' })
export class SimilarityApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/similarity`;
  private url(submissionId: string): string { return `${this.base}/submissions/${encodeURIComponent(submissionId)}`; }

  /** null when there is no similarity panel for this essay (the feature is off, or not the owner: the server answers 404). */
  async get(submissionId: string): Promise<SimilarityView | null> {
    try { return (await firstValueFrom(this.http.get<Envelope<SimilarityView>>(this.url(submissionId)))).data; }
    catch (error) { if (error instanceof HttpErrorResponse && error.status === 404) return null; throw error; }
  }

  async startCheck(submissionId: string, requestId: string, confirmPermission?: boolean): Promise<SimilarityView> {
    const body = confirmPermission === undefined ? {} : { confirmPermission };
    return (await firstValueFrom(this.http.post<Envelope<SimilarityView>>(`${this.url(submissionId)}/checks`, body,
      { headers: { 'Idempotency-Key': requestId } }))).data;
  }

  async retry(submissionId: string, requestId: string): Promise<SimilarityView> {
    return (await firstValueFrom(this.http.post<Envelope<SimilarityView>>(`${this.url(submissionId)}/checks/retry`, {},
      { headers: { 'Idempotency-Key': requestId } }))).data;
  }

  async setExcluded(submissionId: string, sourceId: string, excluded: boolean, revision: number, requestId: string): Promise<SimilarityReport> {
    return (await firstValueFrom(this.http.patch<Envelope<SimilarityReport>>(`${this.url(submissionId)}/sources/${encodeURIComponent(sourceId)}`,
      { excluded, revision, requestId }))).data;
  }

  async restoreAll(submissionId: string, revision: number, requestId: string): Promise<SimilarityReport> {
    return (await firstValueFrom(this.http.post<Envelope<SimilarityReport>>(`${this.url(submissionId)}/sources/restore-all`,
      { revision, requestId }))).data;
  }

  /** The teacher-only similarity PDF (uses the saved exclusions). */
  async pdf(submissionId: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.url(submissionId)}/pdf`, { responseType: 'blob' }));
  }

  /** The notice line for the essay upload page: null while the feature is off. Students and guests read nothing else here. */
  async notice(): Promise<{ version: string; text: string } | null> {
    try { return (await firstValueFrom(this.http.get<Envelope<{ version: string; text: string }>>(`${this.base}/notice`))).data; }
    catch { return null; }
  }
}
