import type { CorrectionLegend } from '../models/correction-legend.model';
import type { FeedbackAnnotation } from '../models/feedback-annotation.model';
import type { WritingCorrectionIssue } from '../api/writing-corrections-api.service';

type LegendGroupKey = 'CONTENT' | 'ORGANIZATION' | 'GRAMMAR' | 'VOCABULARY' | 'MECHANICS';

export type LegendAlignedCounts = Record<LegendGroupKey, number>;

export type LegendAlignedFeedback = {
  counts: LegendAlignedCounts;
  overallScore100: number;
  grade: string;
  perCategoryScores5: Record<LegendGroupKey, number>;
  strengths: string[];
  areasForImprovement: string[];
  actionSteps: string[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeKey(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function coerceLegendKey(value: any): LegendGroupKey | null {
  const k = normalizeKey(value);
  if (k === 'CONTENT') return 'CONTENT';
  if (k === 'ORGANIZATION') return 'ORGANIZATION';
  if (k === 'GRAMMAR') return 'GRAMMAR';
  if (k === 'VOCABULARY') return 'VOCABULARY';
  if (k === 'MECHANICS') return 'MECHANICS';
  return null;
}

function mapLanguageToolGroupToLegendKey(raw: any): LegendGroupKey {
  const k = String(raw || '').trim().toLowerCase();
  if (k === 'grammar') return 'GRAMMAR';
  if (k === 'spelling') return 'MECHANICS';
  if (k === 'typography') return 'MECHANICS';
  if (k === 'style') return 'ORGANIZATION';
  if (k === 'other') return 'CONTENT';
  return 'CONTENT';
}

function legendGroupKeys(legend: CorrectionLegend | null | undefined): Set<LegendGroupKey> {
  const out = new Set<LegendGroupKey>();
  const groups = legend && Array.isArray(legend.groups) ? legend.groups : [];
  for (const g of groups) {
    const key = coerceLegendKey((g as any)?.key);
    if (key) out.add(key);
  }
  return out;
}

function resolveLegendKeyForIssue(issue: WritingCorrectionIssue, legendKeys: Set<LegendGroupKey>): LegendGroupKey {
  const byGroupKey = coerceLegendKey((issue as any)?.groupKey);
  if (byGroupKey && legendKeys.has(byGroupKey)) return byGroupKey;

  const byGroupLabel = coerceLegendKey((issue as any)?.groupLabel);
  if (byGroupLabel && legendKeys.has(byGroupLabel)) return byGroupLabel;

  return mapLanguageToolGroupToLegendKey((issue as any)?.groupKey);
}

function resolveLegendKeyForAnnotation(ann: FeedbackAnnotation, legendKeys: Set<LegendGroupKey>): LegendGroupKey {
  const g = coerceLegendKey((ann as any)?.group);
  if (g && legendKeys.has(g)) return g;

  const raw = normalizeKey((ann as any)?.group);
  if (raw === 'CONTENT_RELEVANCE') return 'CONTENT';
  if (raw === 'STRUCTURE_&_ORGANIZATION') return 'ORGANIZATION';
  if (raw === 'GRAMMAR_&_MECHANICS') return 'GRAMMAR';

  return 'CONTENT';
}

function gradeFromScore(score100: number): string {
  const s = clamp(score100, 0, 100);
  if (s >= 90) return 'A';
  if (s >= 80) return 'B';
  if (s >= 70) return 'C';
  if (s >= 60) return 'D';
  return 'F';
}

function categoryAdvice(key: LegendGroupKey): { strength: string; improvement: string; action: string } {
  switch (key) {
    case 'CONTENT':
      return {
        strength: 'Content: Ideas are relevant and supported with clear details.',
        improvement: 'Content: Improve relevance, clarity, and support with specific details/examples.',
        action: 'Add 1–2 supporting details or examples for each main point.'
      };
    case 'ORGANIZATION':
      return {
        strength: 'Organization: Writing is structured and ideas flow logically.',
        improvement: 'Organization: Improve paragraph structure, coherence, and transitions.',
        action: 'Use clear topic sentences and add linking words between ideas.'
      };
    case 'GRAMMAR':
      return {
        strength: 'Grammar: Sentences are mostly correct with good structure.',
        improvement: 'Grammar: Review tense, agreement, and sentence structure to reduce errors.',
        action: 'Re-check verb tenses and subject–verb agreement in each sentence.'
      };
    case 'VOCABULARY':
      return {
        strength: 'Vocabulary: Word choice is appropriate and varied.',
        improvement: 'Vocabulary: Improve word choice, word form, and avoid repetition.',
        action: 'Replace repeated words with synonyms and verify word forms.'
      };
    case 'MECHANICS':
      return {
        strength: 'Mechanics: Spelling and punctuation are mostly consistent.',
        improvement: 'Mechanics: Reduce spelling, punctuation, capitalization, and spacing errors.',
        action: 'Run a final spelling and punctuation pass before submitting.'
      };
  }
}

export function buildLegendAlignedFeedback(params: {
  legend: CorrectionLegend | null | undefined;
  writingIssues: WritingCorrectionIssue[] | null | undefined;
  annotations: FeedbackAnnotation[] | null | undefined;
}): LegendAlignedFeedback {
  const legendKeys = legendGroupKeys(params.legend);
  const counts: LegendAlignedCounts = {
    CONTENT: 0,
    ORGANIZATION: 0,
    GRAMMAR: 0,
    VOCABULARY: 0,
    MECHANICS: 0
  };

  for (const issue of Array.isArray(params.writingIssues) ? params.writingIssues : []) {
    if (!issue) continue;
    const k = resolveLegendKeyForIssue(issue, legendKeys);
    counts[k] += 1;
  }

  for (const ann of Array.isArray(params.annotations) ? params.annotations : []) {
    if (!ann) continue;
    const k = resolveLegendKeyForAnnotation(ann, legendKeys);
    counts[k] += 1;
  }

  const weights: Record<LegendGroupKey, number> = {
    CONTENT: 1.0,
    ORGANIZATION: 0.9,
    GRAMMAR: 1.2,
    VOCABULARY: 1.0,
    MECHANICS: 1.1
  };

  const perCategoryScores5: Record<LegendGroupKey, number> = {
    CONTENT: 5,
    ORGANIZATION: 5,
    GRAMMAR: 5,
    VOCABULARY: 5,
    MECHANICS: 5
  };

  for (const k of Object.keys(perCategoryScores5) as LegendGroupKey[]) {
    const penalty = counts[k] * 0.35 * weights[k];
    perCategoryScores5[k] = round1(clamp(5 - penalty, 0, 5));
  }

  const avg5 =
    (perCategoryScores5.CONTENT +
      perCategoryScores5.ORGANIZATION +
      perCategoryScores5.GRAMMAR +
      perCategoryScores5.VOCABULARY +
      perCategoryScores5.MECHANICS) /
    5;

  const overallScore100 = round1(clamp((avg5 / 5) * 100, 0, 100));
  const grade = gradeFromScore(overallScore100);

  const ranked = (Object.keys(counts) as LegendGroupKey[])
    .map((k) => ({ k, c: counts[k] }))
    .sort((a, b) => a.c - b.c);

  const strengths = ranked.slice(0, 2).map(({ k }) => categoryAdvice(k).strength);
  const areasForImprovement = ranked.slice(-2).reverse().map(({ k }) => categoryAdvice(k).improvement);
  const actionSteps = ranked.slice(-3).reverse().map(({ k }) => categoryAdvice(k).action);

  return {
    counts,
    overallScore100,
    grade,
    perCategoryScores5,
    strengths,
    areasForImprovement,
    actionSteps
  };
}
