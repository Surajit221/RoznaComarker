import { setCanonicalImageLabel, setCanonicalMatch } from './worksheet-viewer';

describe('WorksheetViewer canonical mobile interactions', () => {
  it('creates the same matching answer record and allows changing it', () => {
    expect(setCanonicalMatch({ pair1: 'Old choice' }, 'pair1', 'New choice')).toEqual({ pair1: 'New choice' });
  });

  it('prevents duplicate matching choices by moving the choice', () => {
    expect(setCanonicalMatch({ pair1: 'Choice A' }, 'pair2', 'Choice A')).toEqual({ pair2: 'Choice A' });
  });

  it('creates canonical target-to-label records for tap labeling', () => {
    expect(setCanonicalImageLabel({}, 'target-2', 'Mercury')).toEqual({ 'target-2': 'Mercury' });
  });

  it('moves a label instead of assigning it to duplicate targets', () => {
    expect(setCanonicalImageLabel({ 'target-1': 'Mercury' }, 'target-2', 'Mercury')).toEqual({ 'target-2': 'Mercury' });
  });
});
