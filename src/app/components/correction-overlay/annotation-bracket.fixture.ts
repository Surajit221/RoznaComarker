// Task 21: one synthetic page for the grouped-bracket tests. Five handwritten-like lines (boxes in image percent, as the OCR pipeline stores them),
// word-level corrections (one word, two words, three words, an insertion point) and sentence-level ones (FRAG over two lines, RO on one line with
// five words, CONC over three lines, a second RO overlapping the CONC). Synthetic text only.
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';

const LINES = [
  ['Social', 'media', 'change', 'how', 'people', 'see', 'themself', 'every', 'day.'],
  ['They', 'compare', 'there', 'lifes', 'with', 'others', 'online', 'and', 'feel'],
  ['bad', 'about', 'it.', 'Because', 'the', 'photos', 'are', 'not', 'real.'],
  ['Many', 'teens', 'spend', 'hours', 'scrolling', 'they', 'forget', 'to', 'sleep.'],
  ['In', 'conclusion', 'social', 'media', 'has', 'good', 'and', 'bad', 'sides.'],
];
const LEFT = 12, WORD_W = 7.4, GAP = 1.6, TOP = 14, LINE_STEP = 9, WORD_H = 4.2;

export const BRACKET_WORDS: OcrWord[] = LINES.flatMap((line, row) => line.map((text, col) => ({
  id: `w_${row}_${col}`, text, page: 1, separatorBefore: row > 0 && col === 0 ? '\n' : ' ',
  bbox: { x: LEFT + col * (WORD_W + GAP), y: TOP + row * LINE_STEP + (col % 3) * 0.15, w: WORD_W, h: WORD_H },
} as OcrWord)));

const ids = (from: [number, number], to: [number, number]): string[] => {
  const out: string[] = [];
  for (let row = from[0]; row <= to[0]; row++) for (let col = row === from[0] ? from[1] : 0; col <= (row === to[0] ? to[1] : LINES[row].length - 1); col++)
    out.push(`w_${row}_${col}`);
  return out;
};
const text = (wordIds: string[]): string => wordIds.map(id => BRACKET_WORDS.find(w => w.id === id)!.text).join(' ');
const correction = (id: string, symbol: string, category: string, color: string, wordIds: string[], extra: Partial<FeedbackAnnotation> = {}): FeedbackAnnotation => ({
  _id: id, symbol, category, group: category, color, page: 1, wordIds, quotedText: text(wordIds), message: `${symbol} message`, ...extra,
} as FeedbackAnnotation);

/** Word-level: drawn as underlines with a chip; their geometry must never change (Task 21). */
export const WORD_LEVEL: FeedbackAnnotation[] = [
  correction('sp1', 'SP', 'MECHANICS', '#f5c2c7', ['w_0_6']),
  correction('agr1', 'AGR', 'GRAMMAR', '#cfe2ff', ids([0, 2], [0, 2])),
  correction('ww1', 'WW', 'VOCABULARY', '#d1e7dd', ids([1, 2], [1, 3])),
  correction('ww2', 'WC', 'VOCABULARY', '#d1e7dd', ids([4, 5], [4, 7])),
  correction('p1', 'P', 'MECHANICS', '#f5c2c7', [], { visualTarget: { version: 1, wordIds: [], anchors: [{ wordId: 'w_3_4', side: 'after', operation: 'INSERT', punctuation: ',' }] } }),
];

/** Sentence-level: FRAG (two lines), RO (one line, five words), CONC (three lines) and a second RO overlapping the CONC. */
export const SENTENCE_LEVEL: FeedbackAnnotation[] = [
  correction('frag1', 'FRAG', 'GRAMMAR', '#cfe2ff', ids([2, 3], [3, 2])),
  correction('ro1', 'RO', 'GRAMMAR', '#cfe2ff', ids([3, 0], [3, 8])),
  correction('conc1', 'CONC', 'ORGANIZATION', '#e2d9f3', ids([1, 0], [3, 8])),
  correction('ro2', 'RO', 'GRAMMAR', '#cfe2ff', ids([0, 0], [1, 8])),
];
