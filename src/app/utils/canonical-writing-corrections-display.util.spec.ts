import { buildCanonicalWritingIssues } from './canonical-writing-corrections-display.util';

describe('buildCanonicalWritingIssues', () => {
  it('builds transcript highlights only from persisted canonical corrections', () => {
    const transcript = 'This are two pages.';
    const issues = buildCanonicalWritingIssues(transcript, [{
      startChar: 5, endChar: 8, quotedText: 'are', suggestedText: 'is',
      category: 'GRAMMAR', symbol: 'AGR', color: '#123456', message: 'Agreement'
    }]);
    expect(issues).toEqual([jasmine.objectContaining({
      start: 5, end: 8, wrongText: 'are', suggestion: 'is',
      groupKey: 'GRAMMAR', symbol: 'AGR', message: 'Agreement'
    })]);
  });

  it('treats completed zero corrections as a valid empty display', () => {
    expect(buildCanonicalWritingIssues('Correct text.', [])).toEqual([]);
  });

  it('keeps partial and final persisted snapshots independent', () => {
    const transcript = 'A B C';
    const partial = buildCanonicalWritingIssues(transcript, [
      { startChar: 0, endChar: 1, symbol: 'SP', category: 'MECHANICS' }
    ]);
    const completed = buildCanonicalWritingIssues(transcript, [
      { startChar: 0, endChar: 1, symbol: 'SP', category: 'MECHANICS' },
      { startChar: 2, endChar: 3, symbol: 'DEV', category: 'CONTENT' }
    ]);
    expect(partial.length).toBe(1);
    expect(completed.length).toBe(2);
  });
});
