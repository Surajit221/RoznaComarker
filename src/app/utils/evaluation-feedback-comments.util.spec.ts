import { evaluationFeedbackComments } from './evaluation-feedback-comments.util';

describe('feedback with numeric marks redacted', () => {
  it('keeps fixed-category comments without scores or maxima', () => {
    expect(evaluationFeedbackComments({ rubricScores: { GRAMMAR: { comment: 'Check agreement.' } } }))
      .toEqual([{ category: 'Grammar', description: 'Check agreement.' }]);
  });
  it('keeps custom rubric comments without selected levels or weighted points', () => {
    expect(evaluationFeedbackComments({ scoringAudit: { overallMethod: 'custom_rubric_weighted_total' },
      customRubricScores: { criteria: [{ criterionId: 'ideas', title: 'Ideas', comment: 'Add evidence.' }] } }))
      .toEqual([{ category: 'Ideas', description: 'Add evidence.' }]);
  });
});
