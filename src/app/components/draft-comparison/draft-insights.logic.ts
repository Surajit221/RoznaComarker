// Draft comparison v2: progress insights built only from what the comparison can support. Templates only (no AI). Wording is neutral (no
// "you"): the same panel is read by the student, the guest and the teacher. When the rubric changed or there is too little comparable data,
// the result carries only a note and makes no claim.
import type { DraftComparison, DraftIssueItem } from '../../api/submission-api.service';

export interface InsightCategory { name: string; delta: number; }
export interface OpenArea { category: string; count: number; }
export interface DraftInsights {
  /** false: show only `note`, claim nothing. */
  claims: boolean;
  note: string | null;
  strongest: InsightCategory | null;
  weakest: InsightCategory | null;
  fixedCount: number;
  openAreas: OpenArea[];
  focus: string | null;
}

const LABELS: Record<string, string> = { CONTENT: 'Content', ORGANIZATION: 'Organization', GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', MECHANICS: 'Mechanics', PRESENTATION: 'Presentation' };
export const categoryName = (category: string): string => LABELS[category] ?? (category ? category.charAt(0) + category.slice(1).toLowerCase() : 'Writing');
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`;

const LIMITED = 'The rubric changed between these drafts, so no progress is claimed. Compare the individual scores with care.';
const NOT_ENOUGH = 'There is not enough comparable information between these drafts to suggest a focus.';

/** Insights for a v2 comparison, or null when there is nothing to show (not v2 or not available). */
export function draftInsights(comparison: DraftComparison | null): DraftInsights | null {
  // Different texts: no insight at all (the comparison shows its own neutral notice).
  if (!comparison?.available || comparison.comparisonVersion !== 2 || comparison.textsUnrelated) return null;
  if (comparison.rubricChanged || comparison.overall?.status === 'RUBRIC_CHANGED') {
    return { claims: false, note: LIMITED, strongest: null, weakest: null, fixedCount: 0, openAreas: [], focus: null };
  }
  const comparable = (comparison.rubricCategories ?? []).filter(c => c.available && c.delta != null && c.maxScore)
    .map(c => ({ name: c.name, delta: c.delta as number, relative: (c.delta as number) / (c.maxScore as number) }));
  const byRelative = [...comparable].sort((a, b) => b.relative - a.relative);
  // Strongest only when it actually went up; weakest only when another category is comparable to it.
  const strongest = byRelative[0] && byRelative[0].delta > 0 ? { name: byRelative[0].name, delta: byRelative[0].delta } : null;
  const last = byRelative[byRelative.length - 1];
  const weakest = comparable.length >= 2 && last && last.name !== strongest?.name ? { name: last.name, delta: last.delta } : null;

  const issuesKnown = comparison.issuesAvailable !== false && Boolean(comparison.issueDetails);
  const open = new Map<string, number>();
  if (issuesKnown) {
    const items: DraftIssueItem[] = [...(comparison.issueDetails?.remaining.items ?? []), ...(comparison.issueDetails?.new.items ?? [])];
    for (const item of items) open.set(item.category, (open.get(item.category) ?? 0) + 1);
  }
  const openAreas = [...open.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)).slice(0, 3);
  const fixedCount = issuesKnown ? comparison.issueDetails?.fixed.total ?? 0 : 0;

  let focus: string | null = null;
  if (openAreas.length) {
    const top = openAreas[0];
    focus = `Focus for the next draft: ${categoryName(top.category)} (${plural(top.count, 'issue')} still open)${weakest && weakest.delta <= 0 ? `, and the ${weakest.name} part of the rubric` : ''}.`;
  } else if (weakest && weakest.delta <= 0) {
    focus = `Focus for the next draft: the ${weakest.name} part of the rubric.`;
  } else if (issuesKnown) {
    focus = 'No writing issues are still open. Keep checking each sentence while revising.';
  }
  if (!strongest && !weakest && !openAreas.length && !fixedCount && !focus) {
    return { claims: false, note: NOT_ENOUGH, strongest: null, weakest: null, fixedCount: 0, openAreas: [], focus: null };
  }
  return { claims: true, note: issuesKnown ? null : 'Writing issues could not be compared for these drafts, so only the rubric is used here.',
    strongest, weakest, fixedCount, openAreas, focus };
}

export const describeDelta = signed;
