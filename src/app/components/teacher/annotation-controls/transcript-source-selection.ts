import { SnapshotPage, snapToWords, wordSpans } from './annotation-editor.logic';

export interface TranscriptSourceSpan {
  fileId: string; page: number; sourceHash: string; start: number; end: number; quotedText: string;
  /** Keyboard range extension retains its caret until Shift is released. UI only, never part of a mutation. */
  focusEditor?: boolean;
}

/** Adapt the existing rendered word IDs to canonical offsets, then use the editor's whole-word rules.
 * Display separators can differ from the source. Never search selected text or guess an occurrence.
 */
export function transcriptSourceRange(root: HTMLElement, range: Range, page: SnapshotPage): { start: number; end: number } | null {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const spans = wordSpans(page.text, page.words);
  if (!page.words.length || spans.length !== page.words.length || new Set(page.words.map(word => word.id)).size !== page.words.length) return null;
  const prefix = root.ownerDocument.createRange(); prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset); const start = prefix.toString().length;
  prefix.setEnd(range.endContainer, range.endOffset); const end = prefix.toString().length;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-word-id]'));
  if (nodes.length !== page.words.length) return null;
  const offsets = new Map<HTMLElement, number>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode, word = node.parentElement?.closest<HTMLElement>('[data-word-id]');
    if (word && !offsets.has(word)) offsets.set(word, cursor);
    cursor += node.textContent?.length ?? 0;
  }
  const touched: { index: number; at: number }[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index], word = page.words[index], rawAt = offsets.get(node), shown = node.textContent ?? '';
    if (rawAt === undefined || node.dataset['wordId'] !== word.id || shown.trim() !== word.text) return null;
    const at = rawAt + shown.indexOf(word.text);
    if (start < at + word.text.length && end > at) touched.push({ index, at });
  }
  if (!touched.length) return null;
  const first = touched[0], last = touched[touched.length - 1];
  const canonicalStart = spans[first.index].start + Math.max(0, start - first.at);
  const canonicalEnd = spans[last.index].start + Math.min(page.words[last.index].text.length, end - last.at);
  return snapToWords(spans, canonicalStart, canonicalEnd) ? { start: canonicalStart, end: canonicalEnd } : null;
}
