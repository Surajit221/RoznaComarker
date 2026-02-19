import type { WritingCorrectionIssue } from '../api/writing-corrections-api.service';

export type RubricFeedbackItem = {
  category: string;
  score: number;
  maxScore: number;
  description: string;
};

export type PersistedRubricScores = Partial<
  Record<
    'CONTENT' | 'ORGANIZATION' | 'GRAMMAR' | 'VOCABULARY' | 'MECHANICS',
    { score?: number; maxScore?: number; comment?: string }
  >
>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function safeCount(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeIssueCounts(issues: WritingCorrectionIssue[]) {
  const stats = {
    spelling: 0,
    grammar: 0,
    typography: 0,
    style: 0,
    other: 0,
    total: 0
  };

  for (const issue of Array.isArray(issues) ? issues : []) {
    const key = (issue && typeof (issue as any).groupKey === 'string' ? String((issue as any).groupKey) : 'other').toLowerCase();
    if (key in stats) {
      (stats as any)[key] += 1;
    } else {
      stats.other += 1;
    }
    stats.total += 1;
  }

  return stats;
}

function scoreFromPenalty(penalty: number): number {
  // Map issue penalty into a 0-5 rubric score. Penalty 0 => 5, penalty 50+ => ~0.
  const normalized = 5 - penalty / 10;
  return clamp(round1(normalized), 0, 5);
}

function buildSummaryForCategory(label: string, count: number, total: number, advice: string): string {
  if (total <= 0) {
    return `${label}: No issues detected by LanguageTool.`;
  }

  const pct = clamp(Math.round((count / total) * 100), 0, 100);
  if (count <= 0) {
    return `${label}: Strong performance. LanguageTool did not flag issues in this area.`;
  }

  return `${label}: ${count} issue${count === 1 ? '' : 's'} (${pct}%). ${advice}`;
}

export function buildDynamicRubricFeedback(params: {
  issues: WritingCorrectionIssue[];
  overallScore100?: number;
  gradeLetter?: string;
  language?: string;
}): RubricFeedbackItem[] {
  const issues = Array.isArray(params.issues) ? params.issues : [];
  const stats = computeIssueCounts(issues);

  const overallScore100 = Number(params.overallScore100);
  const overall = Number.isFinite(overallScore100) ? clamp(overallScore100, 0, 100) : null;

  // Weighted penalties based on issue types.
  const grammarPenalty = safeCount(stats.grammar) * 1.6;
  const mechanicsPenalty = safeCount(stats.spelling) * 1.2 + safeCount(stats.typography) * 0.8;
  const organizationPenalty = safeCount(stats.style) * 0.6 + safeCount(stats.typography) * 0.4;
  const contentPenalty = safeCount(stats.other) * 0.9;

  const grammarScore = scoreFromPenalty(grammarPenalty + mechanicsPenalty * 0.4);
  const structureScore = scoreFromPenalty(organizationPenalty);
  const contentScore = scoreFromPenalty(contentPenalty);

  const overallScore5 = overall != null ? clamp(round1(overall / 20), 0, 5) : round1(clamp((grammarScore + structureScore + contentScore) / 3, 0, 5));

  const total = stats.total;

  const grammarDesc = buildSummaryForCategory(
    'Grammar & Mechanics',
    stats.grammar + stats.spelling + stats.typography,
    total,
    'Focus on sentence structure, agreement/tense, spelling, and punctuation consistency.'
  );

  const structureDesc = buildSummaryForCategory(
    'Structure & Organization',
    stats.style + stats.typography,
    total,
    'Improve paragraph flow, clarity, and formatting/consistency to strengthen readability.'
  );

  const contentDesc = buildSummaryForCategory(
    'Content Relevance',
    stats.other,
    total,
    'Check relevance to the prompt, clarity of ideas, and support your points with specific details.'
  );

  const grade = (params.gradeLetter || '').trim();
  const overallSuffix = overall != null
    ? `Overall score: ${round1(overall)}/100${grade ? ` (Grade ${grade})` : ''}.`
    : `Overall score estimated from LanguageTool correction statistics${grade ? ` (Grade ${grade})` : ''}.`;

  return [
    { category: 'Grammar & Mechanics', score: grammarScore, maxScore: 5, description: grammarDesc },
    { category: 'Structure & Organization', score: structureScore, maxScore: 5, description: structureDesc },
    { category: 'Content Relevance', score: contentScore, maxScore: 5, description: contentDesc },
    { category: 'Overall Rubric Score', score: overallScore5, maxScore: 5, description: overallSuffix }
  ];
}

export function rubricScoresToFeedbackItems(rubricScores: PersistedRubricScores | null | undefined): RubricFeedbackItem[] {
  const rs: any = rubricScores && typeof rubricScores === 'object' ? rubricScores : {};

  const clamp5 = (n: any): number => {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return clamp(round1(x), 0, 5);
  };

  return [
    {
      category: 'Grammar & Mechanics',
      score: clamp5(rs?.GRAMMAR?.score),
      maxScore: 5,
      description: typeof rs?.GRAMMAR?.comment === 'string' ? rs.GRAMMAR.comment : ''
    },
    {
      category: 'Structure & Organization',
      score: clamp5(rs?.ORGANIZATION?.score),
      maxScore: 5,
      description: typeof rs?.ORGANIZATION?.comment === 'string' ? rs.ORGANIZATION.comment : ''
    },
    {
      category: 'Content Relevance',
      score: clamp5(rs?.CONTENT?.score),
      maxScore: 5,
      description: typeof rs?.CONTENT?.comment === 'string' ? rs.CONTENT.comment : ''
    },
    {
      category: 'Overall Rubric Score',
      score: clamp5(rs?.MECHANICS?.score),
      maxScore: 5,
      description: typeof rs?.MECHANICS?.comment === 'string' ? rs.MECHANICS.comment : ''
    }
  ];
}
