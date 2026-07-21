import type {
  DetailedFeedbackActionStep, DetailedFeedbackArea, DetailedFeedbackExample,
  DetailedFeedbackStrength
} from '../models/submission-feedback.model';
import type { CanonicalResultViewState } from './canonical-result-state.util';

export type DetailedFeedbackDisplayStatus = 'loading' | 'processing' | 'updating' | 'completed' | 'empty' | 'blocked' | 'failed' | 'legacy';

export interface DetailedFeedbackDisplayModel {
  status: DetailedFeedbackDisplayStatus;
  message: string | null;
  sourceHash: string | null;
  evaluationVersion: string | null;
  areasForImprovement: DetailedFeedbackArea[];
  strengths: DetailedFeedbackStrength[];
  actionSteps: DetailedFeedbackActionStep[];
  legacyAreas: string[];
  legacyStrengths: string[];
  legacyActionSteps: string[];
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const objects = (value: unknown): any[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, any> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];

function examples(value: unknown): DetailedFeedbackExample[] {
  return objects(value).map((item) => ({
    correctionId: text(item.correctionId ?? item.id), symbol: text(item.symbol),
    symbolLabel: text(item.symbolLabel ?? item.label), quotedText: text(item.quotedText ?? item.quote),
    message: text(item.message ?? item.explanation), suggestedText: text(item.suggestedText ?? item.suggestion)
  })).filter((item) => item.correctionId && item.symbol && item.quotedText);
}

function normalizeArea(item: any, index: number): DetailedFeedbackArea | null {
  const category = text(item.category).toUpperCase();
  if (!category) return null;
  return {
    id: text(item.id) || `area_${category.toLowerCase()}_${index}`, category,
    title: text(item.title ?? item.categoryLabel) || category[0] + category.slice(1).toLowerCase(),
    issueCount: number(item.issueCount ?? item.distinctIssueCount), score: number(item.score),
    maxScore: number(item.maxScore), explanation: text(item.explanation ?? item.summary),
    dominantSymbols: strings(item.dominantSymbols ?? item.symbols), examples: examples(item.examples ?? item.representativeExamples)
  };
}

function normalizeStrength(item: any, index: number): DetailedFeedbackStrength | null {
  const category = text(item.category).toUpperCase();
  if (!category) return null;
  return {
    id: text(item.id) || `strength_${category.toLowerCase()}_${index}`, category,
    title: text(item.title ?? item.categoryLabel) || category[0] + category.slice(1).toLowerCase(),
    score: number(item.score), maxScore: number(item.maxScore),
    explanation: text(item.explanation ?? item.summary), evidence: strings(item.evidence), provisional: item.provisional === true
  };
}

function normalizeAction(item: any, index: number): DetailedFeedbackActionStep | null {
  const category = text(item.category).toUpperCase();
  const action = text(item.action ?? item.text);
  if (!action) return null;
  return {
    id: text(item.id) || `action_${category.toLowerCase()}_${index}`, priority: number(item.priority) || index + 1,
    category, action, reason: text(item.reason ?? item.summary),
    relatedSymbols: strings(item.relatedSymbols ?? item.symbols),
    relatedCorrectionIds: strings(item.relatedCorrectionIds ?? item.correctionIds)
  };
}

export function buildDetailedFeedbackDisplayModel(
  state: CanonicalResultViewState | null,
  legacyFeedback?: any
): DetailedFeedbackDisplayModel {
  const empty = { sourceHash: state?.detailedFeedbackSourceHash || null, evaluationVersion: null,
    areasForImprovement: [], strengths: [], actionSteps: [], legacyAreas: [], legacyStrengths: [], legacyActionSteps: [] };
  if (!state) return { ...empty, status: 'loading', message: 'Loading detailed feedback…' };
  const status = state?.detailedFeedbackStatus || 'pending';
  const pending = ['pending', 'processing', 'retry_wait'].includes(state.semanticStatus)
    || (Boolean(state.correctionSourceHash) && ['pending', 'processing'].includes(state.evaluationStatus))
    || ['pending', 'processing'].includes(status);
  if (state?.processingActive && status === 'stale') return { ...empty, status: 'updating', message: 'Updating detailed feedback…' };
  if (pending) return { ...empty, status: 'processing', message: 'Preparing detailed feedback…' };
  if (status === 'blocked') return { ...empty, status: 'blocked', message: 'Detailed feedback is unavailable because the writing analysis did not complete.' };
  if (status === 'failed') return { ...empty, status: 'failed', message: 'Detailed feedback could not be prepared from the current analysis.' };
  if (status === 'stale') return { ...empty, status: 'failed', message: 'Detailed feedback is unavailable because the saved feedback is out of date.' };

  const feedback = status === 'completed' ? state?.detailedFeedback : null;
  const areas = objects(feedback?.areasForImprovement).map(normalizeArea).filter((item): item is DetailedFeedbackArea => Boolean(item));
  const strengths = objects(feedback?.strengths).map(normalizeStrength).filter((item): item is DetailedFeedbackStrength => Boolean(item));
  const actions = objects(feedback?.actionSteps).map(normalizeAction).filter((item): item is DetailedFeedbackActionStep => Boolean(item));
  if (feedback && (areas.length || strengths.length || actions.length || [feedback.areasForImprovement, feedback.strengths, feedback.actionSteps]
    .every((items) => Array.isArray(items) && items.length === 0))) {
    return { status: areas.length ? 'completed' : 'empty', message: areas.length ? null : 'No major improvement areas were identified.',
      sourceHash: state?.detailedFeedbackSourceHash || text(feedback.sourceHash) || null,
      evaluationVersion: text(feedback.evaluationVersion) || null,
      areasForImprovement: areas, strengths, actionSteps: actions, legacyAreas: [], legacyStrengths: [], legacyActionSteps: [] };
  }

  const hasCanonicalLifecycle = Boolean(state?.correctionSourceHash);
  const legacy = legacyFeedback?.detailedFeedback;
  const legacyAreas = strings(legacy?.areasForImprovement);
  const legacyStrengths = strings(legacy?.strengths);
  const legacyActionSteps = strings(legacy?.actionSteps);
  if (!hasCanonicalLifecycle && (legacyAreas.length || legacyStrengths.length || legacyActionSteps.length)) {
    return { ...empty, status: 'legacy', message: null, legacyAreas, legacyStrengths, legacyActionSteps };
  }
  return { ...empty, status: 'failed', message: 'Detailed feedback is unavailable for this completed result.' };
}
