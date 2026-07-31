import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CanonicalSubmissionResultCoordinator, shouldRevalidateCanonicalResult,
  type ResultRefreshSnapshot } from './canonical-submission-result-coordinator.service';
import { normalizeCanonicalResult } from '../utils/canonical-result-state.util';

describe('CanonicalSubmissionResultCoordinator', () => {
  const snapshot = (overrides: Record<string, unknown>): ResultRefreshSnapshot => ({
    submissionId: 'submission-1',
    ocrStatus: 'completed',
    canonical: normalizeCanonicalResult(overrides)
  });

  it('does not poll terminal partial results merely because manual retry is allowed', () => {
    const service = new CanonicalSubmissionResultCoordinator();
    const state = snapshot({ correctionStatus: 'partial', processingActive: false, automaticPollingAllowed: false,
      manualRetryAllowed: true, terminal: true, evaluationStatus: 'blocked', detailedFeedbackStatus: 'blocked' });
    expect((service as any).isActive(state)).toBeFalse();
    expect(shouldRevalidateCanonicalResult(state.canonical)).toBeTrue();
  });

  it('detects an external retry and replaces failed state with completed state', fakeAsync(() => {
    const service = new CanonicalSubmissionResultCoordinator();
    const states = [
      snapshot({ correctionStatus: 'partial', semanticStatus: 'failed', processingActive: false,
        automaticPollingAllowed: false, manualRetryAllowed: true, terminal: true,
        evaluationStatus: 'blocked', detailedFeedbackStatus: 'blocked' }),
      snapshot({ correctionStatus: 'processing', semanticStatus: 'processing', processingActive: true,
        automaticPollingAllowed: true, manualRetryAllowed: false, terminal: false,
        evaluationStatus: 'pending', detailedFeedbackStatus: 'pending' }),
      snapshot({ correctionStatus: 'completed', semanticStatus: 'completed', processingActive: false,
        automaticPollingAllowed: false, manualRetryAllowed: false, terminal: true,
        statisticsCompleteness: 'canonical', evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
        score: 88 })
    ];
    let applied = states[0];
    let calls = 0;
    service.start('submission-1', async () => applied = states[Math.min(calls++, states.length - 1)]);
    tick(0); flushMicrotasks();
    expect(calls).toBe(1);
    tick(30000); flushMicrotasks();
    expect(calls).toBe(2);
    tick(2000); flushMicrotasks();
    expect(calls).toBe(3);
    expect(applied.canonical.score).toBe(88);
    expect(service.pollingState$.value.running).toBeFalse();
  }));

  it('teardown stops failed-state revalidation timers', fakeAsync(() => {
    const service = new CanonicalSubmissionResultCoordinator();
    let calls = 0;
    service.start('submission-1', async () => {
      calls += 1;
      return snapshot({ correctionStatus: 'partial', semanticStatus: 'failed', processingActive: false,
        automaticPollingAllowed: false, manualRetryAllowed: true, terminal: true,
        evaluationStatus: 'blocked', detailedFeedbackStatus: 'blocked' });
    });
    tick(0); flushMicrotasks();
    service.stop();
    tick(60000); flushMicrotasks();
    expect(calls).toBe(1);
  }));

  it('does not poll for a missing score or feedback without an active backend job', () => {
    const service = new CanonicalSubmissionResultCoordinator();
    const state = snapshot({ correctionStatus: 'completed', processingActive: false, automaticPollingAllowed: false,
      terminal: true, evaluationStatus: 'blocked', detailedFeedbackStatus: 'blocked' });
    expect((service as any).isActive(state)).toBeFalse();
  });

  it('polls only an explicitly active nonterminal backend lifecycle', () => {
    const service = new CanonicalSubmissionResultCoordinator();
    const state = snapshot({ correctionStatus: 'processing', processingActive: true, automaticPollingAllowed: true,
      terminal: false, evaluationStatus: 'pending', detailedFeedbackStatus: 'pending' });
    expect((service as any).isActive(state)).toBeTrue();
  });

  it('polls through evaluation processing and applies score 52 without reload', fakeAsync(() => {
    const service = new CanonicalSubmissionResultCoordinator();
    const snapshots = [
      snapshot({ correctionStatus: 'processing', semanticStatus: 'processing',
        processingActive: true, automaticPollingAllowed: true, terminal: false,
        evaluationStatus: 'pending', detailedFeedbackStatus: 'pending' }),
      snapshot({ correctionStatus: 'completed', semanticStatus: 'completed',
        processingActive: true, automaticPollingAllowed: true, terminal: false,
        evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
        statisticsStatus: 'partial', statistics: { total: 29 } }),
      snapshot({ correctionStatus: 'completed', semanticStatus: 'completed',
        processingActive: false, automaticPollingAllowed: false, terminal: true,
        evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
        evaluationCurrent: true, detailedFeedbackCurrent: true, score: 52, grade: 'C' })
    ];
    let calls = 0;
    let activeRequests = 0;
    let maxActiveRequests = 0;
    let applied = snapshots[0].canonical;

    service.start('submission-1', async () => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      const next = snapshots[Math.min(calls++, snapshots.length - 1)];
      await Promise.resolve();
      applied = next.canonical;
      activeRequests -= 1;
      return next;
    });

    tick(0);
    flushMicrotasks();
    expect(calls).toBe(1);
    tick(1200);
    flushMicrotasks();
    expect(calls).toBe(2);
    expect(service.pollingState$.value.running).toBeTrue();
    expect(applied.evaluationStatus).toBe('processing');
    expect(applied.terminal).toBeFalse();

    tick(2000);
    flushMicrotasks();
    expect(calls).toBe(3);
    expect(applied.score).toBe(52);
    expect(applied.detailedFeedbackStatus).toBe('completed');
    expect(service.pollingState$.value.running).toBeFalse();
    expect(maxActiveRequests).toBe(1);
  }));

  it('stops on destruction and cancels the previous submission when the id changes', fakeAsync(() => {
    const service = new CanonicalSubmissionResultCoordinator();
    const ids: string[] = [];
    const active = async (submissionId: string): Promise<ResultRefreshSnapshot> => {
      ids.push(submissionId);
      return { ...snapshot({ correctionStatus: 'processing', semanticStatus: 'processing',
        processingActive: true, automaticPollingAllowed: true, terminal: false,
        evaluationStatus: 'pending', detailedFeedbackStatus: 'pending' }), submissionId };
    };
    service.start('old-submission', active);
    service.start('new-submission', active);
    tick(0);
    flushMicrotasks();
    expect(ids).toEqual(['new-submission']);
    service.stop();
    tick(5000);
    flushMicrotasks();
    expect(ids).toEqual(['new-submission']);
    expect(service.pollingState$.value.running).toBeFalse();
  }));

  it('slowly revalidates a retryable terminal failure and reports active polling deadlines', fakeAsync(() => {
    const failedService = new CanonicalSubmissionResultCoordinator();
    failedService.start('submission-1', async () => snapshot({ correctionStatus: 'failed',
      semanticStatus: 'failed', evaluationStatus: 'blocked', detailedFeedbackStatus: 'blocked',
      processingActive: false, automaticPollingAllowed: false, manualRetryAllowed: true, terminal: true }));
    tick(0);
    flushMicrotasks();
    expect(failedService.pollingState$.value.running).toBeTrue();
    expect(failedService.pollingState$.value.timedOut).toBeFalse();
    failedService.stop();

    const deadlineService = new CanonicalSubmissionResultCoordinator();
    const persisted = snapshot({ correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false });
    deadlineService.start('submission-1', async () => persisted, 1);
    tick(0);
    flushMicrotasks();
    tick(1200);
    flushMicrotasks();
    expect(deadlineService.pollingState$.value.running).toBeFalse();
    expect(deadlineService.pollingState$.value.timedOut).toBeTrue();
    expect(persisted.canonical.evaluationStatus).toBe('processing');
  }));
});
