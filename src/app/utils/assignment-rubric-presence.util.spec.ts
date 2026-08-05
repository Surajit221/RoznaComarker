import { hasMeaningfulAssignmentRubric } from './assignment-rubric-presence.util';

describe('assignment rubric presence', () => {
  const currentRubric = {
    rubrics: {
      criteria: [{
        name: 'Content',
        weight: 100,
        levels: [{ title: 'Meets expectations', score: 75, description: 'Accurate and complete.' }]
      }]
    }
  };

  it('accepts a meaningful current assignment rubric', () => {
    expect(hasMeaningfulAssignmentRubric(currentRubric)).toBeTrue();
  });

  it('accepts a meaningful legacy JSON rubric', () => {
    expect(hasMeaningfulAssignmentRubric({
      rubric: JSON.stringify({
        levels: [{ title: 'Proficient', maxPoints: 4 }],
        criteria: [{ title: 'Organization', weight: 100, cells: ['Ideas are logically ordered.'] }]
      })
    })).toBeTrue();
  });

  it('rejects empty, invalid and placeholder-only rubric state', () => {
    expect(hasMeaningfulAssignmentRubric({})).toBeFalse();
    expect(hasMeaningfulAssignmentRubric({ rubric: '{invalid' })).toBeFalse();
    expect(hasMeaningfulAssignmentRubric({
      rubrics: { criteria: [{ name: '', weight: 0, levels: [] }] },
      rubric: { levels: [{ title: '', maxPoints: 0 }], criteria: [{ title: '', weight: 0, cells: [''] }] }
    })).toBeFalse();
  });

  it('does not mistake fixed six-category feedback for an assignment rubric', () => {
    expect(hasMeaningfulAssignmentRubric({
      rubricScores: {
        GRAMMAR: { score: 20, maxScore: 25 },
        CONTENT: { score: 15, maxScore: 20 }
      }
    })).toBeFalse();
  });
});
