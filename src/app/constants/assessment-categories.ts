/**
 * The ONE display order (and the display labels) of the assessment categories, used by every screen that lists them: the AI-assisted
 * Evaluation, Edit scores, the student and guest result pages, Grade check, correction statistics and draft comparison.
 * Display only: internal keys, score maxima (Grammar 25, Vocabulary 20, Organization 20, Content 20, Mechanics 10, Presentation 5), stored
 * data and the AI pipeline are unchanged. The backend keeps the same order in backend/src/constants/assessmentCategories.js (PDFs).
 */
export const ASSESSMENT_CATEGORY_ORDER = ['GRAMMAR', 'VOCABULARY', 'ORGANIZATION', 'CONTENT', 'MECHANICS', 'PRESENTATION'] as const;
export type AssessmentCategoryKey = typeof ASSESSMENT_CATEGORY_ORDER[number];

export const ASSESSMENT_CATEGORY_LABELS: Readonly<Record<AssessmentCategoryKey, string>> = Object.freeze({
  GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary', ORGANIZATION: 'Organization & Structure', CONTENT: 'Content & Task Achievement',
  MECHANICS: 'Spelling & Punctuation', PRESENTATION: 'Presentation & Handwriting',
});

/** Position in the canonical order (case-insensitive key); unknown keys go last, in their original order. */
export function assessmentCategoryRank(key: string | null | undefined): number {
  const index = ASSESSMENT_CATEGORY_ORDER.indexOf(String(key ?? '').toUpperCase() as AssessmentCategoryKey);
  return index < 0 ? ASSESSMENT_CATEGORY_ORDER.length : index;
}

/** A copy of the list in the canonical order (stable for unknown keys). */
export function sortByAssessmentCategory<T>(items: readonly T[], keyOf: (item: T) => string | null | undefined): T[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => assessmentCategoryRank(keyOf(a.item)) - assessmentCategoryRank(keyOf(b.item)) || a.index - b.index)
    .map(entry => entry.item);
}

/** The display label of a category key (the key itself when unknown). */
export const assessmentCategoryLabel = (key: string): string => ASSESSMENT_CATEGORY_LABELS[key.toUpperCase() as AssessmentCategoryKey] ?? key;
