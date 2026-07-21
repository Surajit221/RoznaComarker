import { CanonicalSubmissionResultCoordinator, type ResultRefreshSnapshot } from './canonical-submission-result-coordinator.service';
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
  });

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
});
