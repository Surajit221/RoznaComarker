import { snapToWords, SnapshotPage, wordSpans } from './annotation-editor.logic';
import { transcriptSourceRange } from './transcript-source-selection';

describe('rendered transcript canonical selection adapter', () => {
  let root: HTMLDivElement;
  const page: SnapshotPage = { fileId: 'f2', pageNumber: 3, startChar: 100, endChar: 128,
    text: '😀 Hello,\n\nHello again.', words: [
      { id: 'emoji', text: '😀' }, { id: 'first', text: 'Hello,' }, { id: 'second', text: 'Hello' }, { id: 'last', text: 'again.' },
    ] };
  beforeEach(() => {
    root = document.createElement('div');
    for (const word of page.words) {
      const span = document.createElement('span'); span.dataset['wordId'] = word.id; span.textContent = word.text;
      root.append(span, document.createTextNode(' '));
    }
    document.body.appendChild(root);
  });
  afterEach(() => root.remove());
  function range(first: number, start: number, last: number, end: number): Range {
    const words = root.querySelectorAll('[data-word-id]'), selected = document.createRange();
    selected.setStart(words[first].firstChild!, start); selected.setEnd(words[last].firstChild!, end); return selected;
  }
  it('uses word identity for a repeated word, preserving canonical paragraph separators and punctuation', () => {
    const selected = transcriptSourceRange(root, range(1, 0, 3, 6), page)!;
    expect(page.text.slice(selected.start, selected.end)).toBe('Hello,\n\nHello again.');
    expect(selected).toEqual({ start: 3, end: page.text.length });
    const second = transcriptSourceRange(root, range(2, 0, 2, 5), page)!;
    expect(second.start).toBe(11);
  });
  it('preserves UTF-16 offsets and delegates partial word extension to the existing rule', () => {
    const selected = transcriptSourceRange(root, range(0, 0, 0, 2), page)!;
    expect(selected).toEqual({ start: 0, end: 2 });
    const partial = transcriptSourceRange(root, range(1, 1, 1, 4), page)!;
    expect(snapToWords(wordSpans(page.text, page.words), partial.start, partial.end)).toEqual({ start: 3, end: 9 });
  });
  it('rejects cross-page or collapsed ranges, altered word text and unknown word identities', () => {
    const selected = range(1, 0, 1, 6); selected.collapse(true);
    expect(transcriptSourceRange(root, selected, page)).toBeNull();
    const outside = document.createTextNode('outside'); document.body.appendChild(outside);
    const crossing = range(1, 0, 1, 6); crossing.setEnd(outside, 3);
    expect(transcriptSourceRange(root, crossing, page)).toBeNull(); outside.remove();
    const word = root.querySelector<HTMLElement>('[data-word-id="first"]')!;
    word.textContent = 'Corrected';
    expect(transcriptSourceRange(root, range(1, 0, 1, 3), page)).toBeNull();
    word.textContent = 'Hello,'; word.dataset['wordId'] = 'unknown';
    expect(transcriptSourceRange(root, range(1, 0, 1, 3), page)).toBeNull();
  });
  it('refuses ambiguous duplicate IDs or words that cannot be mapped into the canonical text', () => {
    expect(transcriptSourceRange(root, range(1, 0, 1, 3), { ...page, words: page.words.map(word => ({ ...word, id: 'same' })) })).toBeNull();
    expect(transcriptSourceRange(root, range(1, 0, 1, 3), { ...page, text: 'Different source text' })).toBeNull();
  });
});
