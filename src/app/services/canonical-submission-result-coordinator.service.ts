import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { CanonicalResultViewState, ResultStatus } from '../utils/canonical-result-state.util';

export interface ResultRefreshSnapshot {
  submissionId: string;
  ocrStatus?: ResultStatus;
  canonical: CanonicalResultViewState;
}

export interface ResultPollingState {
  submissionId: string | null;
  attempt: number;
  running: boolean;
  timedOut: boolean;
  lastHttpStatus: number | null;
}

type Refresh = (submissionId: string, requestSequence: number) => Promise<ResultRefreshSnapshot>;

const DELAYS = [0, 1200, 2000, 3000, 5000];

@Injectable({ providedIn: 'root' })
export class CanonicalSubmissionResultCoordinator {
  readonly pollingState$ = new BehaviorSubject<ResultPollingState>({ submissionId: null, attempt: 0, running: false, timedOut: false, lastHttpStatus: null });
  private generation = 0;
  private requestSequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private refresh: Refresh | null = null;
  private submissionId: string | null = null;
  private maxDurationMs = 5 * 60_000;

  start(submissionId: string, refresh: Refresh, maxDurationMs = this.maxDurationMs): void {
    this.stop();
    this.submissionId = submissionId;
    this.refresh = refresh;
    this.maxDurationMs = maxDurationMs;
    this.startedAt = Date.now();
    this.pollingState$.next({ submissionId, attempt: 0, running: true, timedOut: false, lastHttpStatus: null });
    this.schedule(0, ++this.generation);
  }

  retry(): void {
    if (this.submissionId && this.refresh) this.start(this.submissionId, this.refresh, this.maxDurationMs);
  }

  stop(): void {
    ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const state = this.pollingState$.value;
    this.pollingState$.next({ ...state, running: false });
  }

  private schedule(delay: number, generation: number): void {
    if (generation !== this.generation) return;
    this.timer = setTimeout(() => void this.tick(generation), delay);
  }

  private async tick(generation: number): Promise<void> {
    const submissionId = this.submissionId;
    const refresh = this.refresh;
    if (!submissionId || !refresh || generation !== this.generation) return;
    const previous = this.pollingState$.value;
    const attempt = previous.attempt + 1;
    const sequence = ++this.requestSequence;
    try {
      const snapshot = await refresh(submissionId, sequence);
      if (generation !== this.generation || submissionId !== this.submissionId || snapshot.submissionId !== submissionId || sequence !== this.requestSequence) {
        this.diagnostic(submissionId, sequence, attempt, snapshot.canonical, null, false, 0);
        return;
      }
      const active = this.isActive(snapshot);
      this.pollingState$.next({ submissionId, attempt, running: active, timedOut: false, lastHttpStatus: 200 });
      if (!active) return;
      if (Date.now() - this.startedAt >= this.maxDurationMs) {
        this.pollingState$.next({ submissionId, attempt, running: false, timedOut: true, lastHttpStatus: 200 });
        return;
      }
      const delay = DELAYS[Math.min(attempt, DELAYS.length - 1)];
      this.diagnostic(submissionId, sequence, attempt, snapshot.canonical, 200, true, delay);
      this.schedule(delay, generation);
    } catch (error: any) {
      if (generation !== this.generation || sequence !== this.requestSequence) return;
      const status = Number(error?.status || error?.statusCode || 0) || null;
      const retryable = status === null || [0, 202, 409, 429].includes(status) || status >= 500;
      this.pollingState$.next({ submissionId, attempt, running: retryable, timedOut: false, lastHttpStatus: status });
      if (!retryable || Date.now() - this.startedAt >= this.maxDurationMs) {
        this.pollingState$.next({ submissionId, attempt, running: false, timedOut: retryable, lastHttpStatus: status });
        return;
      }
      this.schedule(DELAYS[Math.min(attempt, DELAYS.length - 1)], generation);
    }
  }

  private isActive(snapshot: ResultRefreshSnapshot): boolean {
    const c = snapshot.canonical;
    return c.processingActive === true && c.automaticPollingAllowed === true && c.terminal === false;
  }

  private diagnostic(submissionId: string, requestSequence: number, attempt: number, state: CanonicalResultViewState, httpStatus: number | null, applied: boolean, nextDelay: number): void {
    if (!this.isDevelopment()) return;
    console.debug('[canonical-result-poll]', { submissionId, requestSequence, pollingGenerationId: this.generation, lifecycleStage: 'result-observation', httpStatus,
      correctionStatus: state.correctionStatus, correctionStage: state.correctionStage, processingActive: state.processingActive,
      statisticsStatus: state.statisticsStatus, evaluationStatus: state.evaluationStatus, detailedFeedbackStatus: state.detailedFeedbackStatus,
      terminal: state.terminal, manualRetryAllowed: state.manualRetryAllowed, pollingAttempt: attempt, nextDelay,
      nextPollingDecision: state.processingActive && state.automaticPollingAllowed && !state.terminal ? 'continue' : 'stop',
      pollingReason: state.terminal ? 'terminal' : state.processingActive ? 'backend_processing_active' : 'no_active_backend_job',
      requestState: applied ? 'applied' : 'rejected-stale' });
  }

  private isDevelopment(): boolean {
    return typeof globalThis !== 'undefined' && Boolean((globalThis as any).ngDevMode);
  }
}
