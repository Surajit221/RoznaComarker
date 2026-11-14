import type { RubricFeedbackItem } from './dynamic-ai-feedback.util';
import { ASSESSMENT_CATEGORY_LABELS, ASSESSMENT_CATEGORY_ORDER } from '../constants/assessment-categories';

export type EvaluationCommentItem = Pick<RubricFeedbackItem, 'category' | 'description'>
  & Partial<Pick<RubricFeedbackItem, 'score' | 'maxScore' | 'selectedLevel'>>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object'
  ? value as Record<string, unknown> : {};

/** Comments are available independently of redacted grading fields. */
export function evaluationFeedbackComments(value: unknown): EvaluationCommentItem[] {
  const feedback = record(value);
  if (record(feedback['scoringAudit'])['overallMethod'] === 'custom_rubric_weighted_total') {
    const criteria = record(feedback['customRubricScores'])['criteria'];
    if (Array.isArray(criteria)) {
      const comments = criteria.map(record).filter((c) => typeof c['title'] === 'string' && typeof c['comment'] === 'string')
        .map((c) => ({ category: String(c['title']), description: String(c['comment']) }))
        .filter((c) => c.description.trim());
      if (comments.length) return comments;
    }
  }
  const rubric = record(feedback['rubricScores']);
  return ASSESSMENT_CATEGORY_ORDER.map(key => [key, ASSESSMENT_CATEGORY_LABELS[key]] as const).flatMap(([key, category]) => {
    const comment = record(rubric[key])['comment'];
    return typeof comment === 'string' && comment.trim() ? [{ category, description: comment }] : [];
  });
}
