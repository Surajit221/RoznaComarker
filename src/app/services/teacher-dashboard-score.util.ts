import type { DashboardSubmission } from '../models/dashboard-submission.model';

export function completedFeedbackScore(feedback: unknown): number | null {
  if (!feedback || typeof feedback !== 'object') return null;
  const value = feedback as { evaluationStatus?: unknown; overallScore?: unknown };
  if (value.evaluationStatus !== 'completed') return null;
  const score = typeof value.overallScore === 'number' ? value.overallScore : Number.NaN;
  return Number.isFinite(score) ? score : null;
}

export function averageDashboardScore(submissions: DashboardSubmission[]): number {
  const scores = (submissions || [])
    .map((submission) => submission.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (!scores.length) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}
