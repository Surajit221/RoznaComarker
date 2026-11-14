// Pure rules of the "Grade check" panel (Task 7D): status wording, the score and count lines, reason validation, error wording. Scores are only
// shown here: nothing in this file or its component computes or sends a score.

export type ScoreReviewStatus = 'not_needed' | 'needed' | 'checked' | 'unavailable';
export interface ScoreReviewDecision { outcome: string; at: string; by: string; reason?: string; draftNumber: number; annotationRevision: number; fingerprint: string; }
export type CorrectionCounts = Partial<Record<'content' | 'organization' | 'grammar' | 'vocabulary' | 'mechanics' | 'total', number>>;
export interface ScoreReview {
  status: ScoreReviewStatus; fingerprint: string; decision: ScoreReviewDecision | null; countsScored: CorrectionCounts; countsVisible: CorrectionCounts;
  scores: { overallScore: number | null; grade: string | null; categories: Record<string, { score: number | null; maxScore: number | null }>; customRubricOverallScore: number | null };
}
export interface ScoreReviewBody { requestId: string; revision: number; sourceHash: string; scoreFingerprint: string; outcome: 'kept'; reason?: string; }

/** Server cap (src/services/scoreReview.service.js). */
export const REASON_MAX = 500;
// eslint-disable-next-line no-control-regex -- the same character class the server refuses: the reason is one line of text
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
/** The message when the reason cannot be saved, or null. A blank reason is no reason: it is left out of the request. */
export function reasonError(reason: string): string | null {
  if (reason.length > REASON_MAX) return `The reason can be at most ${REASON_MAX} characters.`;
  if (CONTROL_CHARACTERS.test(reason)) return 'The reason contains a character that cannot be saved. Remove it and try again.';
  return null;
}

export interface StatusCopy { label: string; explanation: string; }
/** Every status is words, never colour alone. */
export function statusCopy(review: ScoreReview): StatusCopy {
  switch (review.status) {
    case 'needed': return { label: 'Check needed', explanation: review.decision && review.decision.fingerprint !== review.fingerprint
      ? 'These scores changed after your last check. Check the grade again.' : 'Corrections changed after these scores were set. Check the grade.' };
    case 'checked': return { label: 'Checked', explanation: 'These scores were checked after the last change to the corrections.' };
    case 'unavailable': return { label: 'Not available right now', explanation: 'Scoring is running, or these scores are out of date. Try again when it finishes.' };
    default: return { label: 'No check needed', explanation: 'Corrections have not changed since these scores were set.' };
  }
}

const CATEGORIES: [string, keyof CorrectionCounts | null, string][] = sortByAssessmentCategory<[string, keyof CorrectionCounts | null, string]>([['CONTENT', 'content', 'Content'], ['ORGANIZATION', 'organization', 'Organization'], ['GRAMMAR', 'grammar', 'Grammar'],
  ['VOCABULARY', 'vocabulary', 'Vocabulary'], ['MECHANICS', 'mechanics', 'Mechanics'], ['PRESENTATION', null, 'Presentation']], ([key]) => key);

/** "Grammar 18/25". A custom rubric's total does not come from these categories, so they are not shown as its score. */
export function scoreLines(review: ScoreReview): string[] {
  if (review.scores.customRubricOverallScore != null) return [];
  return CATEGORIES.flatMap(([key, , label]) => {
    const item = review.scores.categories?.[key];
    return item && item.score != null && item.maxScore ? [`${label} ${item.score}/${item.maxScore}`] : [];
  });
}
/** "Grammar: 7 when scored, 5 shown to the student". Only categories that have corrections. */
export function countLines(review: ScoreReview): string[] {
  return CATEGORIES.flatMap(([, count, label]) => {
    if (!count) return [];
    const scored = Number(review.countsScored?.[count] ?? 0), visible = Number(review.countsVisible?.[count] ?? 0);
    return scored || visible ? [`${label}: ${scored} when scored, ${visible} shown to the student`] : [];
  });
}

export type ReviewFailureKind = 'retry' | 'reload' | 'closed' | 'notFound' | 'invalid';
export interface ReviewFailure { kind: ReviewFailureKind; message: string; }
/** HTTP status and server code -> what happened, in plain words. Only `retry` keeps the request, with its id, for the teacher to send again. */
export function describeReviewFailure(status: number, code: string | undefined): ReviewFailure {
  const reload = (message: string): ReviewFailure => ({ kind: 'reload', message });
  switch (code) {
    case 'ANNOTATION_REVISION_CONFLICT': return reload('Nothing was recorded: this submission changed since you opened it (another tab, or a new correction). The latest version is now loaded. Your reason is still here. Check the scores, then keep them again.');
    case 'ANNOTATION_SCORE_CHANGED': return reload('Nothing was recorded: the scores changed since this screen loaded. The new scores are now shown. Your reason is still here. Check them, then keep them again.');
    case 'ANNOTATION_ASSESSMENT_BUSY': return reload('Nothing was recorded: scoring is running. Try again when it finishes.');
    case 'ANNOTATION_EVALUATION_NOT_CURRENT': return reload('Nothing was recorded: these scores are out of date, so they cannot be confirmed yet. Try again when scoring has finished.');
    case 'ANNOTATION_REVIEW_NOT_NEEDED': return reload('Nothing needed recording: no grade check is waiting for this submission. The latest version is now loaded.');
    case 'ANNOTATION_IDEMPOTENCY_CONFLICT': return reload('Nothing was recorded because this request clashed with an earlier one. The latest version is now loaded. Check it and try again.');
    case 'ANNOTATION_SOURCE_UNAVAILABLE': return reload('Nothing was recorded: the transcript of this submission is not available yet.');
    case 'ANNOTATION_CLASS_CLOSED': return { kind: 'closed', message: 'This class is closed, so the grade check is read-only. Nothing was recorded.' };
    case 'ANNOTATION_NOT_FOUND': return { kind: 'notFound', message: 'This submission was not found, or you do not have access to it.' };
    case 'ANNOTATION_INVALID_FIELDS': return { kind: 'invalid', message: 'This could not be recorded. Check the reason and try again.' };
    case 'ANNOTATION_RATE_LIMITED': case 'RATE_LIMITED': return { kind: 'retry', message: 'You are making changes faster than we can save them. Wait a few minutes, then press Retry. Your reason was not lost.' };
    default: break;
  }
  if (status === 404) return { kind: 'notFound', message: 'This submission was not found, or you do not have access to it.' };
  if (status === 429) return { kind: 'retry', message: 'You are making changes faster than we can save them. Wait a few minutes, then press Retry. Your reason was not lost.' };
  if (status >= 400 && status < 500) return { kind: 'invalid', message: 'This could not be recorded. Check the reason and try again.' };
  return { kind: 'retry', message: 'We could not confirm this (connection problem). The scores did not change. Press Retry; it is safe and cannot record twice.' };
}import { sortByAssessmentCategory } from '../../../constants/assessment-categories';

