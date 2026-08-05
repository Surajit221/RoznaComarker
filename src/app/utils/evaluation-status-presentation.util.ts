import type { PreviousEvaluation } from '../models/submission-feedback.model';
import type { CanonicalResultViewState } from './canonical-result-state.util';

export type EvaluationUiState =
  | 'current'
  | 'stale'
  | 'processing'
  | 'evaluation_failed'
  | 'feedback_failed';

export interface EvaluationStatusPresentation {
  state: EvaluationUiState;
  title: string;
  message: string;
  actionLabel: string | null;
  showPanel: boolean;
  showAction: boolean;
  showPreviousScore: boolean;
  role: 'status' | 'alert';
}

export function buildEvaluationStatusPresentation({
  canonical,
  previousEvaluation,
  teacher
}: {
  canonical: CanonicalResultViewState | null | undefined;
  previousEvaluation?: PreviousEvaluation | null;
  teacher: boolean;
}): EvaluationStatusPresentation {
  const hasPrevious = Number.isFinite(Number(previousEvaluation?.overallScore));
  const evaluationStatus = canonical?.evaluationStatus || 'pending';
  const detailedStatus = canonical?.detailedFeedbackStatus || 'pending';
  if (canonical?.teacherOverride || canonical?.evaluationFreshness === 'overridden') return {
    state: 'current',
    title: 'Up to date',
    message: '',
    actionLabel: null,
    showPanel: false,
    showAction: false,
    showPreviousScore: false,
    role: 'status'
  };

  if (canonical?.evaluationFreshness === 'processing'
    || ['pending', 'processing'].includes(evaluationStatus)
    || Boolean(canonical?.processingActive && evaluationStatus !== 'completed')) return {
    state: 'processing',
    title: teacher ? 'Re-evaluating with current rubric…' : '',
    message: teacher
      ? 'Applying the current rubric and grading settings.'
      : 'The updated score and feedback will appear when the evaluation is ready.',
    actionLabel: null,
    showPanel: true,
    showAction: false,
    showPreviousScore: hasPrevious,
    role: 'status'
  };

  if (['failed', 'blocked'].includes(evaluationStatus)) return {
    state: 'evaluation_failed',
    title: teacher ? 'Re-evaluation could not be completed.' : 'Evaluation unavailable',
    message: teacher
      ? 'The evaluation service could not complete this result. The previous completed score is preserved when available.'
      : 'Your teacher can retry the evaluation. No updated score is available yet.',
    actionLabel: teacher ? 'Try re-evaluation again' : null,
    showPanel: true,
    showAction: teacher && !canonical?.teacherOverride && Boolean(canonical?.manualRetryAllowed),
    showPreviousScore: hasPrevious,
    role: 'alert'
  };

  if (canonical?.requiresCanonicalReevaluation || evaluationStatus === 'stale') {
    const rubricStale = (canonical?.reevaluationReason || canonical?.evaluationStaleReason) === 'rubric';
    const policyStale = (canonical?.reevaluationReason || canonical?.evaluationStaleReason) === 'policy';
    return {
      state: 'stale',
      title: teacher ? 'Re-evaluation required' : 'Your teacher is updating this evaluation.',
      message: teacher
        ? rubricStale
          ? 'This score and feedback were generated using a previous rubric. Re-evaluate to apply the current rubric.'
          : policyStale
            ? 'This score and feedback were generated using previous grading settings. Re-evaluate to apply the current settings.'
            : 'This evaluation is outdated. Re-evaluate to apply the current settings.'
        : 'The previous evaluation is outdated. An updated result will appear after your teacher re-evaluates it.',
      actionLabel: teacher
        ? rubricStale ? 'Re-evaluate with current rubric'
          : policyStale ? 'Re-evaluate with current settings' : null
        : null,
      showPanel: true,
      showAction: teacher && !canonical?.teacherOverride && (rubricStale || policyStale)
        && Boolean(canonical?.manualRetryAllowed),
      showPreviousScore: hasPrevious,
      role: 'status'
    };
  }

  if (evaluationStatus === 'completed' && ['failed', 'blocked', 'stale'].includes(detailedStatus)) return {
    state: 'feedback_failed',
    title: 'Score completed',
    message: teacher
      ? 'The score is current, but detailed feedback could not be generated.'
      : 'Your score is available. Detailed feedback is not available yet.',
    actionLabel: null,
    showPanel: true,
    showAction: false,
    showPreviousScore: false,
    role: 'status'
  };

  return {
    state: 'current',
    title: 'Up to date',
    message: '',
    actionLabel: null,
    showPanel: false,
    showAction: false,
    showPreviousScore: false,
    role: 'status'
  };
}
