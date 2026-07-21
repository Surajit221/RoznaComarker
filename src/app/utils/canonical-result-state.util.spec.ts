import { applySubmissionLifecycleFallback, categoryDisplay, normalizeCanonicalResult } from './canonical-result-state.util';

describe('canonical result normalization', () => {
  it('keeps semantic categories pending while language results remain visible', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'processing', statisticsCompleteness: 'language_only',
      statistics: { content: 0, grammar: 9, organization: 0, vocabulary: 0, mechanics: 6 } });
    expect(categoryDisplay(state, 'content')).toBe('Analyzing…');
    expect(categoryDisplay(state, 'grammar')).toBe(9);
    expect(categoryDisplay(state, 'mechanics')).toBe(6);
  });

  it('does not convert missing evaluation into zero or F', () => {
    const pending = normalizeCanonicalResult({ evaluationStatus: 'processing', overallScore: 0, grade: 'F' });
    expect(pending.score).toBeNull();
    expect(pending.grade).toBeNull();
    expect(pending.scoreMessage).toBe('Calculating score…');
    const completed = normalizeCanonicalResult({ evaluationStatus: 'completed', overallScore: 0, grade: 'F' });
    expect(completed.score).toBe(0);
    expect(completed.grade).toBe('F');
  });

  it('does not regress an authoritative completed feedback response with a stale processing submission DTO', () => {
    const completed = normalizeCanonicalResult({ submissionId: 'submission-1', correctionStatus: 'completed',
      correctionSourceHash: 'hash', evaluationStatus: 'completed', evaluationSourceHash: 'hash', overallScore: 88,
      detailedFeedbackStatus: 'completed', detailedFeedbackSourceHash: 'hash',
      detailedFeedback: { sourceHash: 'hash', areasForImprovement: [{ id: 'area' }], strengths: [], actionSteps: [] } });
    const finalState = applySubmissionLifecycleFallback(completed, { ocrStatus: 'completed',
      correctionStatus: 'completed', evaluationStatus: 'processing' }, true);
    expect(finalState).toBe(completed);
    expect(finalState?.evaluationStatus).toBe('completed');
    expect(finalState?.score).toBe(88);
    expect(finalState?.detailedFeedbackStatus).toBe('completed');
    expect(finalState?.detailedFeedback).not.toBeNull();
  });

  it('suppresses stale feedback and preserves state on temporary errors', () => {
    const current = normalizeCanonicalResult({ correctionSourceHash: 'new', detailedFeedbackSourceHash: 'new',
      detailedFeedbackStatus: 'completed', detailedFeedback: { sourceHash: 'new', strengths: [] } });
    expect(current.detailedFeedback).not.toBeNull();
    expect(normalizeCanonicalResult({ __temporaryError: true }, current)).toBe(current);
    expect(normalizeCanonicalResult({ correctionSourceHash: 'new', detailedFeedbackSourceHash: 'old',
      detailedFeedbackStatus: 'stale', detailedFeedback: { sourceHash: 'old' } }).detailedFeedback).toBeNull();
  });

  it('maps the lightweight evaluation feedback alias and preserves it on status-only responses', () => {
    const current = normalizeCanonicalResult({ correctionStatus: 'completed', correctionSourceHash: 'h', evaluationStatus: 'completed',
      evaluationSourceHash: 'h', detailedFeedbackStatus: 'completed', detailedFeedbackSourceHash: 'h',
      evaluation: { areasForImprovement: [{ category: 'CONTENT' }], strengths: [], actionSteps: [] } });
    expect(current.detailedFeedback?.areasForImprovement.length).toBe(1);
    const next = normalizeCanonicalResult({ correctionStatus: 'completed', evaluationStatus: 'completed', detailedFeedbackStatus: 'completed' }, current);
    expect(next.detailedFeedback).toEqual(current.detailedFeedback);
  });

  it('preserves the existing teacher-override priority contract without weakening canonical hash checks', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'completed', correctionSourceHash: 'new', evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed', detailedFeedbackSourceHash: 'teacher-version', overriddenByTeacher: true,
      detailedFeedback: { strengths: ['Teacher-authored strength'], areasForImprovement: [], actionSteps: [] } });
    expect(state.teacherOverride).toBeTrue(); expect(state.detailedFeedback).not.toBeNull();
  });

  it('normalizes terminal partial corrections to blocked score and feedback without polling', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'partial', statisticsCompleteness: 'language_only',
      statistics: { grammar: 1, mechanics: 26 }, retryable: true });
    expect(state.evaluationStatus).toBe('blocked');
    expect(state.detailedFeedbackStatus).toBe('blocked');
    expect(state.scoreMessage).toBe('Score unavailable');
    expect(state.processingActive).toBeFalse();
    expect(state.automaticPollingAllowed).toBeFalse();
    expect(state.manualRetryAllowed).toBeTrue();
    expect(state.terminal).toBeTrue();
    expect(categoryDisplay(state, 'grammar')).toBe(1);
    expect(categoryDisplay(state, 'mechanics')).toBe(26);
    expect(categoryDisplay(state, 'content')).toBe('Unavailable');
  });

  it('suppresses correction results built against a stale transcript layout', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'stale', correctionCurrent: false,
      statistics: { grammar: 99 }, evaluationStatus: 'completed', overallScore: 100,
      processingActive: false, automaticPollingAllowed: false, manualRetryAllowed: true, terminal: true });
    expect(state.evaluationStatus).toBe('blocked');
    expect(state.score).toBeNull();
    expect(categoryDisplay(state, 'grammar')).toBe('Unavailable');
    expect(state.automaticPollingAllowed).toBeFalse();
  });

  it('shows a compact retry state without exposing provider details', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'processing', statisticsCompleteness: 'language_only',
      semanticStatus: 'retry_wait', processingActive: true, automaticPollingAllowed: true,
      statistics: { grammar: 1, mechanics: 2 } });
    expect(state.semanticProgressMessage).toBe('Retrying content, organization, and vocabulary analysis…');
    expect(state.automaticPollingAllowed).toBeTrue();
  });
});
