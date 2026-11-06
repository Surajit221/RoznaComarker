import { DiffSegment, WORD_LIMIT, diffTexts, myers, sentenceTokens, wordTokens } from './text-diff.util';

/** The two texts rebuilt from the segments: every segment is accounted for, nothing is invented or lost. */
function rebuild(segments: DiffSegment[]): { previous: string; current: string } {
  let previous = '', current = '';
  for (const s of segments) {
    if (s.kind === 'equal') { previous += s.text; current += s.text; }
    else if (s.kind === 'removed') previous += s.text;
    else if (s.kind === 'added') current += s.text;
    else { previous += s.previous ?? ''; current += s.text; }
  }
  return { previous, current };
}
const words = (n: number, seed = 1) => Array.from({ length: n }, (_, i) => `w${(i * 7919 + seed) % 997}`).join(' ');

describe('text diff', () => {
  it('tokens join back to the text', () => {
    const text = '  The cat sat.\nOn the mat!  ';
    expect(wordTokens(text).join('')).toBe(text);
    expect(sentenceTokens('One. Two! Three?').map(s => s.trim())).toEqual(['One.', 'Two!', 'Three?']);
  });
  it('word diff: unchanged, added, removed and modified runs; both texts rebuild exactly', () => {
    const previous = 'I goes to the park every day with my dog.';
    const current = 'I go to the big park every day with my dog and cat.';
    const result = diffTexts(previous, current);
    expect(result.level).toBe('word');
    expect(result.segments.map(s => s.kind)).toEqual(['equal', 'modified', 'equal', 'added', 'equal', 'modified']);
    expect(result.segments[1]).toEqual({ kind: 'modified', previous: 'goes ', text: 'go ' });
    expect(result.segments[3]).toEqual({ kind: 'added', text: 'big ' });
    expect(rebuild(result.segments)).toEqual({ previous, current });
  });
  it('identical and empty texts', () => {
    expect(diffTexts('Same text.', 'Same text.').segments).toEqual([{ kind: 'equal', text: 'Same text.' }]);
    expect(diffTexts('', 'New text.').segments).toEqual([{ kind: 'added', text: 'New text.' }]);
    expect(diffTexts('Old text.', '').segments).toEqual([{ kind: 'removed', text: 'Old text.' }]);
    expect(myers([], [])).toEqual([]);
  });
  it('Myers gives up above the edit cap, and the diff falls back to sentences', () => {
    expect(myers(['a', 'b', 'c'], ['x', 'y', 'z'], 2)).toBeNull();
    const previous = 'Alpha beta gamma. Delta epsilon zeta.', current = 'One two three. Delta epsilon zeta.';
    const result = diffTexts(previous, current, { editLimit: 1 });
    expect(result.level).toBe('sentence');
    expect(result.segments[0]).toEqual({ kind: 'modified', previous: 'Alpha beta gamma. ', text: 'One two three. ' });
    expect(rebuild(result.segments)).toEqual({ previous, current });
  });
  it(`above ${WORD_LIMIT} words the diff compares sentences`, () => {
    const long = Array.from({ length: 900 }, (_, i) => `Sentence ${i} has five words.`).join(' ');
    const changed = long.replace('Sentence 450 has five words.', 'Sentence 450 has six good words.');
    const result = diffTexts(long, changed);
    expect(result.level).toBe('sentence');
    expect(result.modified).toBe(1);
    expect(rebuild(result.segments)).toEqual({ previous: long, current: changed });
  });
  it('performance budget: two 5,000-word drafts (about 10% changed) in well under a frame budget per second', () => {
    const previous = words(5000);
    const tokens = previous.split(' ');
    const current = tokens.map((w, i) => (i % 10 === 0 ? `${w}x` : w)).join(' ');
    const started = performance.now();
    const result = diffTexts(previous, current);
    const elapsed = performance.now() - started;
    expect(rebuild(result.segments)).toEqual({ previous, current });
    expect(elapsed).toBeLessThan(300);
    // A typical long essay just under the word limit stays a word diff and is fast too.
    const essay = words(3900, 3), revised = essay.split(' ').map((w, i) => (i % 25 === 0 ? 'new' : w)).join(' ');
    const t0 = performance.now(); const typical = diffTexts(essay, revised); const typicalMs = performance.now() - t0;
    expect(typical.level).toBe('word');
    expect(rebuild(typical.segments)).toEqual({ previous: essay, current: revised });
    expect(typicalMs).toBeLessThan(300);
  });
});
