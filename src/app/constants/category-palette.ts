/**
 * Display tints for the five correction categories, shared by every surface that colours a correction by category.
 *
 * Display only. The stored legend colours (MongoDB correctionLegend, backend constants, correction-legend.default.ts)
 * are unchanged on purpose: they are part of the legend content hash used for correction identity and caches.
 * Those stored colours were pastel and were then drawn at 18% opacity, which left highlights almost invisible on white.
 *
 * fill: solid highlight background (dark text #111827 on every fill is at least 9:1, WCAG AA and AAA).
 * edge: underline / border colour, at least 4.9:1 against white so it also reads as a non-colour cue.
 */
export type CorrectionCategoryKey = 'CONTENT' | 'ORGANIZATION' | 'GRAMMAR' | 'VOCABULARY' | 'MECHANICS';

export interface CategoryTone { readonly key: CorrectionCategoryKey; readonly fill: string; readonly edge: string; readonly text: string; }

const TEXT = '#111827';

export const CATEGORY_TONES: Readonly<Record<CorrectionCategoryKey, CategoryTone>> = Object.freeze({
  CONTENT: { key: 'CONTENT', fill: '#FFC285', edge: '#B45309', text: TEXT },
  ORGANIZATION: { key: 'ORGANIZATION', fill: '#9FD3F2', edge: '#0369A1', text: TEXT },
  GRAMMAR: { key: 'GRAMMAR', fill: '#97DDB0', edge: '#15803D', text: TEXT },
  VOCABULARY: { key: 'VOCABULARY', fill: '#D6AEF7', edge: '#7E22CE', text: TEXT },
  MECHANICS: { key: 'MECHANICS', fill: '#FFE066', edge: '#A16207', text: TEXT },
});

/** The stored legend colour of each category, for corrections that carry a colour but no category. */
const LEGEND_COLOR_TO_CATEGORY: Readonly<Record<string, CorrectionCategoryKey>> = Object.freeze({
  '#FFD6A5': 'CONTENT', '#CDE7F0': 'ORGANIZATION', '#B7E4C7': 'GRAMMAR', '#E4C1F9': 'VOCABULARY', '#FFF3BF': 'MECHANICS',
});

function categoryKey(value: unknown): CorrectionCategoryKey | null {
  const key = String(value ?? '').trim().toUpperCase().replace(/\s*\(.*$/, '').replace(/^ORGANISATION$/, 'ORGANIZATION');
  return Object.hasOwn(CATEGORY_TONES, key) ? key as CorrectionCategoryKey : null;
}

/** The tone for a category name or key (any case, "Grammar (Sentence & Structure)" too), else for a stored legend colour; null when unknown. */
export function categoryTone(category?: unknown, color?: unknown): CategoryTone | null {
  const key = categoryKey(category) ?? LEGEND_COLOR_TO_CATEGORY[String(color ?? '').trim().toUpperCase()] ?? null;
  return key ? CATEGORY_TONES[key] : null;
}
