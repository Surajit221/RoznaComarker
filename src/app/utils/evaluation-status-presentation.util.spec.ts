import { normalizeCanonicalResult } from './canonical-result-state.util';
import { buildEvaluationStatusPresentation } from './evaluation-status-presentation.util';

describe('evaluation status presentation', () => {
  const previousEvaluation = { overallScore: 72 } as any;

  it('does not render a status panel for a current completed evaluation', () => {
    const presentation = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        evaluationStatus: 'completed',
        detailedFeedbackStatus: 'completed',
        overallScore: 82
      }),
      previousEvaluation: null,
      teacher: true
    });

    expect(presentation.state).toBe('current');
    expect(presentation.showPanel).toBeFalse();
  });

  it('gives teachers the manual stale-result action and labels the prior score outdated', () => {
    const presentation = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        correctionStatus: 'completed',
        semanticStatus: 'completed',
        evaluationStatus: 'stale',
        detailedFeedbackStatus: 'stale',
        manualRetryAllowed: true
      }),
      previousEvaluation,
      teacher: true
    });

    expect(presentation.title).toBe('Re-evaluation required');
    expect(presentation.message).toContain('previous rubric or grading policy');
    expect(presentation.actionLabel).toBe('Re-evaluate with current rubric');
    expect(presentation.showAction).toBeTrue();
    expect(presentation.showPreviousScore).toBeTrue();
  });

  it('shows processing and failure states while preserving the prior-score affordance', () => {
    const processing = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        correctionStatus: 'completed',
        semanticStatus: 'completed',
        evaluationStatus: 'processing',
        detailedFeedbackStatus: 'processing',
        processingActive: true
      }),
      previousEvaluation,
      teacher: true
    });
    expect(processing.title).toBe('Re-evaluating with current rubric…');
    expect(processing.showAction).toBeFalse();
    expect(processing.showPreviousScore).toBeTrue();
    expect(processing.role).toBe('status');

    const failed = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        correctionStatus: 'completed',
        semanticStatus: 'completed',
        evaluationStatus: 'failed',
        detailedFeedbackStatus: 'blocked',
        manualRetryAllowed: true
      }),
      previousEvaluation,
      teacher: true
    });
    expect(failed.title).toBe('Re-evaluation could not be completed.');
    expect(failed.actionLabel).toBe('Try re-evaluation again');
    expect(failed.showAction).toBeTrue();
    expect(failed.showPreviousScore).toBeTrue();
    expect(failed.role).toBe('alert');
  });

  it('keeps a current score separate from a detailed-feedback-only failure', () => {
    const presentation = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        evaluationStatus: 'completed',
        detailedFeedbackStatus: 'failed',
        overallScore: 91,
        manualRetryAllowed: true
      }),
      previousEvaluation: null,
      teacher: true
    });

    expect(presentation.state).toBe('feedback_failed');
    expect(presentation.message).toContain('score is current');
    expect(presentation.showAction).toBeFalse();
    expect(presentation.showPreviousScore).toBeFalse();
  });

  it('never gives students or teacher overrides an evaluation action', () => {
    const stale = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true
    });
    const student = buildEvaluationStatusPresentation({
      canonical: stale,
      previousEvaluation,
      teacher: false
    });
    expect(student.title).toBe('Your teacher is updating this evaluation.');
    expect(student.showAction).toBeFalse();
    expect(student.actionLabel).toBeNull();

    const teacherOverride = buildEvaluationStatusPresentation({
      canonical: normalizeCanonicalResult({
        correctionStatus: 'completed',
        semanticStatus: 'completed',
        evaluationStatus: 'stale',
        detailedFeedbackStatus: 'stale',
        manualRetryAllowed: true,
        overriddenByTeacher: true
      }),
      previousEvaluation,
      teacher: true
    });
    expect(teacherOverride.showAction).toBeFalse();
  });
});
