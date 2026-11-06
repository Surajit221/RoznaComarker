// Teacher evaluation edits (Phase B3): pure helpers for the edit panel. The server is the authority; these mirror its rules so the panel
// can say what is wrong before saving and show the overall score and grade live.

export interface CriterionValues { score: number | null; comment: string | null; }
export interface SnapshotCriterion { key: string; maxScore: number | null; ai: { score: number | null; comment: string }; teacher: CriterionValues; final: { score: number | null; comment: string }; }
export interface HistoryValues { criteria: Record<string, { score: number | null; comment: string }>; overallScore: number | null; grade: string | null; }
export interface TeacherEvaluationHistoryRow { at: string; actorName: string; reason: string | null; reset: boolean; previousRevision: number; newRevision: number; before: HistoryValues; after: HistoryValues; }
export interface TeacherEvaluationSnapshot {
  enabled: boolean; editable: boolean; blockedReason: string | null; revision: number; draftNumber?: number;
  criteria: SnapshotCriterion[]; overall?: { ai: number | null; final: number | null; max: number }; grade?: { ai: string | null; final: string | null };
  edited?: boolean; updatedAt?: string | null; updatedByName?: string | null; history: TeacherEvaluationHistoryRow[]; limits?: { commentMax: number; reasonMax: number };
}
export type TeacherEvaluationBody = { requestId: string; revision: number; reason?: string } & ({ criteria: Record<string, { score?: number | null; comment?: string | null }> } | { reset: true });
/** What the teacher has typed: score as text (an input's value), comment as text. */
export interface DraftRow { key: string; score: string; comment: string; }

export const COMMENT_MAX = 1000;
export const REASON_MAX = 300;
const LABELS: Record<string, string> = { CONTENT: 'Content', ORGANIZATION: 'Organization', GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', MECHANICS: 'Mechanics', PRESENTATION: 'Presentation' };
export const criterionLabel = (key: string): string => LABELS[key] ?? key;
const HTML_TAG = /<\s*\/?\s*[a-z!?]/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The existing grade scale (the server's gradeFromOverallScore). */
export function gradeFor(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}

/** The form's starting values: the current final values. */
export function draftFromSnapshot(snapshot: TeacherEvaluationSnapshot): DraftRow[] {
  return snapshot.criteria.map(c => ({ key: c.key, score: c.final.score == null ? '' : String(c.final.score), comment: c.final.comment ?? '' }));
}

/** A typed score: the number, or an error. Empty means "no score typed" (an error: every criterion keeps a score). */
export function parseScore(text: string, max: number | null): { value: number | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { value: null, error: 'Enter a score.' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: null, error: 'Enter a number.' };
  if (value < 0 || (max != null && value > max)) return { value: null, error: `Enter a score from 0 to ${max ?? '…'}.` };
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) return { value: null, error: 'Use at most one decimal place.' };
  return { value: round1(value), error: null };
}
export function textError(text: string, max: number, what: string): string | null {
  if (text.length > max) return `${what} is too long (${text.length} / ${max}).`;
  if (CONTROL.test(text)) return `${what} contains a character that cannot be saved.`;
  if (HTML_TAG.test(text)) return `${what} cannot contain HTML tags such as <b>.`;
  return null;
}

/** Errors per criterion (score, comment) and for the reason. Empty when the form can be saved. */
export function validate(snapshot: TeacherEvaluationSnapshot, draft: DraftRow[], reason: string): { rows: Record<string, { score?: string; comment?: string }>; reason?: string } {
  const rows: Record<string, { score?: string; comment?: string }> = {};
  for (const row of draft) {
    const criterion = snapshot.criteria.find(c => c.key === row.key);
    const score = parseScore(row.score, criterion?.maxScore ?? null).error;
    const comment = textError(row.comment, COMMENT_MAX, 'The comment');
    if (score || comment) rows[row.key] = { ...(score ? { score } : {}), ...(comment ? { comment } : {}) };
  }
  const reasonError = textError(reason, REASON_MAX, 'The reason');
  return { rows, ...(reasonError ? { reason: reasonError } : {}) };
}
export const hasErrors = (errors: ReturnType<typeof validate>): boolean => Boolean(errors.reason) || Object.keys(errors.rows).length > 0;

/** The overall score and grade the save would give (the server's rule: the AI overall plus the teacher's changes to the criteria). */
export function liveTotals(snapshot: TeacherEvaluationSnapshot, draft: DraftRow[]): { overall: number | null; grade: string | null } {
  const aiOverall = snapshot.overall?.ai ?? null;
  let delta = 0, scoreEdited = false;
  for (const c of snapshot.criteria) {
    const row = draft.find(r => r.key === c.key);
    const typed = row ? parseScore(row.score, c.maxScore).value : null;
    const finalScore = typed ?? c.final.score;
    if (finalScore != null && finalScore !== c.ai.score) scoreEdited = true;
    delta += (finalScore ?? 0) - (c.ai.score ?? 0);
  }
  if (!scoreEdited) return { overall: aiOverall, grade: snapshot.grade?.ai ?? null };
  const overall = Math.min(100, Math.max(0, round1((aiOverall ?? 0) + delta)));
  return { overall, grade: gradeFor(overall) };
}

/** What changed against the current final values, as the request's criteria (only changed fields). */
export function changedCriteria(snapshot: TeacherEvaluationSnapshot, draft: DraftRow[]): Record<string, { score?: number; comment?: string }> {
  const out: Record<string, { score?: number; comment?: string }> = {};
  for (const c of snapshot.criteria) {
    const row = draft.find(r => r.key === c.key);
    if (!row) continue;
    const score = parseScore(row.score, c.maxScore).value;
    const entry: { score?: number; comment?: string } = {};
    if (score != null && score !== c.final.score) entry.score = score;
    if (row.comment.trim() !== (c.final.comment ?? '').trim()) entry.comment = row.comment.trim();
    if (Object.keys(entry).length) out[c.key] = entry;
  }
  return out;
}

/** One line per history row: what changed, in words. */
export function historySummary(row: TeacherEvaluationHistoryRow): string {
  if (row.reset) return `Reset to AI suggested. Overall ${row.before.overallScore ?? '—'} → ${row.after.overallScore ?? '—'}.`;
  const parts = Object.keys(row.after.criteria).map(key => {
    const before = row.before.criteria[key], after = row.after.criteria[key];
    const bits: string[] = [];
    if (before?.score !== after?.score) bits.push(`${before?.score ?? '—'} → ${after?.score ?? '—'}`);
    if ((before?.comment ?? '') !== (after?.comment ?? '')) bits.push('comment changed');
    return `${criterionLabel(key)} ${bits.join(', ')}`;
  });
  const overall = row.before.overallScore !== row.after.overallScore ? `; overall ${row.before.overallScore ?? '—'} → ${row.after.overallScore ?? '—'} (${row.after.grade ?? '—'})` : '';
  return `${parts.join('; ')}${overall}.`;
}

export const BLOCKED_TEXT: Record<string, string> = {
  CLASS_CLOSED: 'This class is closed, so the scores are read-only.',
  NO_EVALUATION: 'The scores can be edited once the evaluation has finished.',
  EVALUATION_NOT_CURRENT: 'The scores can be edited once the evaluation of this draft has finished.',
  ASSESSMENT_BUSY: 'The assessment is still running. The scores can be edited when it has finished.',
  CUSTOM_RUBRIC: 'This assignment uses a custom rubric. Editing its scores here is not available yet.',
};

/** Server answer → what the teacher reads. `reload`: the panel loads the latest version. `retry`: the same request may be sent again. */
export function describeFailure(status: number, code: string | undefined): { message: string; reload: boolean; retry: boolean } {
  switch (code) {
    case 'TEACHER_EVALUATION_REVISION_CONFLICT': return { message: 'Your change was not saved: the scores changed since you opened them (another tab, a new draft or a new evaluation). The latest version is now loaded; your typing is kept. Check it and save again.', reload: true, retry: false };
    case 'TEACHER_EVALUATION_IDEMPOTENCY_CONFLICT': return { message: 'Your change was not saved because it conflicted with an earlier save. The latest version is now loaded.', reload: true, retry: false };
    case 'TEACHER_EVALUATION_NOT_CURRENT': return { message: 'The evaluation of this draft is not finished, so the scores cannot be saved yet. Nothing was changed.', reload: true, retry: false };
    case 'TEACHER_EVALUATION_ASSESSMENT_BUSY': return { message: 'The assessment is still running. Try again when it has finished. Nothing was changed.', reload: true, retry: false };
    case 'TEACHER_EVALUATION_CLASS_CLOSED': return { message: 'This class is closed, so the scores are read-only. Nothing was changed.', reload: true, retry: false };
    case 'TEACHER_EVALUATION_CUSTOM_RUBRIC': return { message: BLOCKED_TEXT['CUSTOM_RUBRIC'], reload: true, retry: false };
    case 'TEACHER_EVALUATION_NO_CHANGE': return { message: 'Nothing to save: the values are the same as now.', reload: false, retry: false };
    case 'TEACHER_EVALUATION_HISTORY_LIMIT': return { message: 'This submission has reached the maximum number of score changes. Nothing was changed.', reload: false, retry: false };
    case 'TEACHER_EVALUATION_RATE_LIMITED': case 'RATE_LIMITED': return { message: 'You are saving faster than we can keep up. Wait a few minutes, then save again. Nothing you typed was lost.', reload: false, retry: true };
    case 'TEACHER_EVALUATION_NOT_FOUND': return { message: 'This submission was not found, or you do not have access to it.', reload: false, retry: false };
    default: break;
  }
  if (status >= 400 && status < 500 && status !== 429) return { message: 'The change could not be saved. Check the highlighted values and try again.', reload: false, retry: false };
  if (status === 429) return { message: 'You are saving faster than we can keep up. Wait a few minutes, then save again. Nothing you typed was lost.', reload: false, retry: true };
  return { message: 'We could not confirm this save (connection problem). Nothing you typed was lost. Press Save again; it is safe and cannot save twice.', reload: false, retry: true };
}
