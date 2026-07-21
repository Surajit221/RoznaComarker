import { buildDetailedFeedbackDisplayModel } from './detailed-feedback-display.util';
import { normalizeCanonicalResult } from './canonical-result-state.util';

describe('detailed feedback display normalization', () => {
  const current = () => normalizeCanonicalResult({ correctionStatus: 'completed', correctionSourceHash: 'h',
    evaluationStatus: 'completed', evaluationSourceHash: 'h', detailedFeedbackStatus: 'completed', detailedFeedbackSourceHash: 'h',
    processingActive: false, terminal: true, detailedFeedback: { status: 'completed', sourceHash: 'h',
      areasForImprovement: [{ category: 'GRAMMAR', categoryLabel: 'Grammar', score: 20, maxScore: 25, issueCount: 1,
        symbols: ['AGR'], representativeExamples: [{ id: 'c', symbol: 'AGR', quote: 'students learns', suggestion: 'students learn' }] }],
      strengths: [], actionSteps: [{ priority: 1, category: 'GRAMMAR', text: 'Revise agreement.', symbols: ['AGR'], correctionIds: ['c'] }] } });

  it('maps historical structured aliases once into the shared display model', () => {
    const display = buildDetailedFeedbackDisplayModel(current());
    expect(display.status).toBe('completed'); expect(display.areasForImprovement[0].examples[0].quotedText).toBe('students learns');
    expect(display.actionSteps[0].relatedCorrectionIds).toEqual(['c']);
  });

  it('hides stale content and emits an explicit state', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'completed', correctionSourceHash: 'new', evaluationStatus: 'completed',
      detailedFeedbackStatus: 'stale', detailedFeedbackSourceHash: 'old', detailedFeedback: { sourceHash: 'old', areasForImprovement: [{ category: 'CONTENT' }] } });
    const display = buildDetailedFeedbackDisplayModel(state); expect(display.status).toBe('failed'); expect(display.areasForImprovement).toEqual([]);
  });

  it('preserves current feedback across a status-only immutable merge', () => {
    const first = current(); const merged = normalizeCanonicalResult({ correctionStatus: 'completed', evaluationStatus: 'completed', detailedFeedbackStatus: 'completed' }, first);
    expect(merged).not.toBe(first); expect(merged.detailedFeedback).toEqual(first.detailedFeedback);
    expect(buildDetailedFeedbackDisplayModel(merged).status).toBe('completed');
  });

  it('allows generic feedback only for a genuinely pre-canonical record', () => {
    const state = normalizeCanonicalResult({ correctionStatus: 'completed', detailedFeedbackStatus: 'completed' });
    const display = buildDetailedFeedbackDisplayModel(state, { detailedFeedback: { areasForImprovement: ['Legacy area'], strengths: ['Legacy strength'], actionSteps: [] } });
    expect(display.status).toBe('legacy'); expect(display.legacyAreas).toEqual(['Legacy area']);
  });

  it('renders pending exclusively and never exposes legacy or generic feedback', () => {
    const state = normalizeCanonicalResult({ submissionId: 's1', correctionStatus: 'processing', semanticStatus: 'processing',
      detailedFeedbackStatus: 'pending', processingActive: true });
    const display = buildDetailedFeedbackDisplayModel(state, { detailedFeedback: {
      areasForImprovement: ['Mechanics: Reduce spelling, punctuation, capitalization, and spacing errors.'],
      strengths: ['Content: Ideas are relevant and supported with clear details.'], actionSteps: ['Run a final spelling pass.']
    } });
    expect(display.status).toBe('processing'); expect(display.message).toContain('Preparing detailed feedback');
    expect(display.legacyAreas).toEqual([]); expect(display.legacyStrengths).toEqual([]); expect(display.legacyActionSteps).toEqual([]);
    expect(display.areasForImprovement).toEqual([]); expect(display.strengths).toEqual([]); expect(display.actionSteps).toEqual([]);
  });

  it('maps the same completed persisted payload for student and teacher', () => {
    const raw = { submissionId: 'same-submission', correctionStatus: 'completed', correctionSourceHash: 'h',
      evaluationStatus: 'completed', evaluationSourceHash: 'h', detailedFeedbackStatus: 'completed',
      detailedFeedback: current().detailedFeedback };
    const student = normalizeCanonicalResult(raw);
    const teacher = normalizeCanonicalResult({ ...raw });
    expect(teacher.submissionId).toBe(student.submissionId);
    expect(teacher.detailedFeedbackStatus).toBe(student.detailedFeedbackStatus);
    expect(teacher.detailedFeedbackSourceHash).toBe('h');
    expect(teacher.detailedFeedback).toEqual(student.detailedFeedback);
    expect(buildDetailedFeedbackDisplayModel(teacher).status).toBe('completed');
  });
});
