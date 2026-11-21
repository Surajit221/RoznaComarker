import { getAssignmentCapabilities } from './assignment-capabilities';

// Speaking (audio + speech-to-text) is a fourth type. Essay, worksheet and flashcard must be exactly what they were.
describe('getAssignmentCapabilities', () => {
  const ESSAY = { type: 'essay', deadline: true, instructions: true, showMarksToStudent: true, allowLateResubmission: false, allowResubmission: true,
    requireAdaptiveBeforeResubmission: true, rubric: true, writingControls: true, resourceLabel: null, editTitle: 'Edit Assignment' };
  const FLASHCARD = { type: 'flashcard', deadline: true, instructions: true, showMarksToStudent: false, allowLateResubmission: false, allowResubmission: false,
    requireAdaptiveBeforeResubmission: false, rubric: false, writingControls: false, resourceLabel: 'Flashcard resource', editTitle: 'Edit Flashcard Assignment' };
  const WORKSHEET = { ...FLASHCARD, type: 'worksheet', allowLateResubmission: true, resourceLabel: 'Worksheet resource', editTitle: 'Edit Worksheet Assignment' };

  it('essay, missing or unknown types are unchanged', () => {
    for (const value of [{ resourceType: 'essay' }, {}, null, undefined, { resourceType: 'other' }]) expect(getAssignmentCapabilities(value)).toEqual(ESSAY as never);
  });
  it('flashcard and worksheet are unchanged', () => {
    expect(getAssignmentCapabilities({ resourceType: 'flashcard' })).toEqual(FLASHCARD as never);
    expect(getAssignmentCapabilities({ resourceType: 'worksheet' })).toEqual(WORKSHEET as never);
  });
  it('speaking: marks can be shown, no essay writing controls or essay rubric editor, no resubmission', () => {
    expect(getAssignmentCapabilities({ resourceType: 'speaking' })).toEqual({ type: 'speaking', deadline: true, instructions: true, showMarksToStudent: true,
      allowLateResubmission: false, allowResubmission: false, requireAdaptiveBeforeResubmission: false, rubric: false, writingControls: false,
      resourceLabel: null, editTitle: 'Edit Speaking Assignment' });
  });
});
