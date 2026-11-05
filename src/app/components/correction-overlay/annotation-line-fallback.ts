import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox, OcrWord } from '../../models/ocr-token.model';

// A word the geometry provider did not read has no box, so its correction cannot be marked on the word. The fallback marks the LINE, and only when
// the line's place on the image is proven by other words of that same transcript line. Lines without a boxed word, or whose place is in doubt, get
// nothing: a position is never interpolated or guessed. The words and targets are what the server already sends; nothing here is stored or sent.

export interface TranscriptLineBand { line: number; top: number; bottom: number; }
type LineTarget = Pick<FeedbackAnnotation, 'wordIds' | 'quotedText'> & { renderTarget?: { source?: string; textRanges?: unknown[] } | null };

/** Fewer boxed lines than this leave no line spacing to compare against. */
const MIN_BOXED_LINES = 3;
/** The boxes of one line may differ by this share of a word's height (handwriting drifts). More means the line covers two rows of the page. */
const MAX_LINE_SPREAD = 0.6;
/** The step to the neighbouring boxed lines, as a share of the page's usual step. Outside this, a transcript line and a row of the page do not correspond. */
const MIN_STEP = 0.7, MAX_STEP = 1.3;

const usable = (box: OcrBBox | null | undefined): box is OcrBBox => !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite)
  && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 && box.x + box.w <= 100.5 && box.y + box.h <= 100.5;
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const normalized = (text: string | null | undefined): string => String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');

/** The transcript line of each word: only the transcript's own line breaks count. */
export function transcriptLineOfWords(words: OcrWord[]): Map<string, number> {
  const lines = new Map<string, number>();
  let line = 0;
  words.forEach((word, index) => {
    if (index && word.separatorBefore?.includes('\n')) line++;
    lines.set(word.id, line);
  });
  return lines;
}

/** The transcript lines whose place on the image is proven, as vertical bands in image percent. */
export function reliableTranscriptLines(words: OcrWord[]): Map<number, TranscriptLineBand> {
  const lineOf = transcriptLineOfWords(words);
  const boxed = new Map<number, OcrBBox[]>();
  for (const word of words) {
    if (!usable(word.bbox)) continue;
    const line = lineOf.get(word.id)!;
    boxed.set(line, [...(boxed.get(line) ?? []), word.bbox]);
  }
  const rows = [...boxed].sort((a, b) => a[0] - b[0]).map(([line, boxes]) => {
    const centers = boxes.map(box => box.y + box.h / 2);
    return { line, center: median(centers), spread: Math.max(...centers) - Math.min(...centers), height: median(boxes.map(box => box.h)),
      top: Math.min(...boxes.map(box => box.y)), bottom: Math.max(...boxes.map(box => box.y + box.h)) };
  });
  const reliable = new Map<number, TranscriptLineBand>();
  if (rows.length < MIN_BOXED_LINES) return reliable;
  const steps = rows.slice(1).map((row, index) => (row.center - rows[index].center) / (row.line - rows[index].line));
  const step = median(steps);
  if (!(step > 0)) return reliable;
  const fits = (index: number): boolean => {
    const value = (rows[index + 1].center - rows[index].center) / (rows[index + 1].line - rows[index].line) / step;
    return value >= MIN_STEP && value <= MAX_STEP;
  };
  rows.forEach((row, index) => {
    if (row.spread > row.height * MAX_LINE_SPREAD) return;
    if ((index > 0 && !fits(index - 1)) || (index < rows.length - 1 && !fits(index))) return;
    reliable.set(row.line, { line: row.line, top: row.top, bottom: row.bottom });
  });
  return reliable;
}

/**
 * The lines to mark for a correction the server could not place on a word, or nothing. All of this must hold: the server checked the correction's
 * offsets against the text (textRanges) and refused only for want of a box (source 'none'); its words exist, read as its quote, and none has a box;
 * and every line it touches is reliable.
 */
export function lineFallbackBands(target: LineTarget, words: OcrWord[], lines = reliableTranscriptLines(words)): TranscriptLineBand[] {
  const server = target.renderTarget;
  if (!server || server.source !== 'none' || !server.textRanges?.length || !lines.size) return [];
  const ids = [...new Set(target.wordIds ?? [])];
  const quote = normalized(target.quotedText);
  if (!ids.length || !quote) return [];
  const wanted = new Set(ids);
  const found = words.filter(word => wanted.has(word.id));
  if (found.length !== ids.length || found.some(word => usable(word.bbox))) return [];
  if (!normalized(found.map(word => word.text).join('')).includes(quote)) return [];
  const lineOf = transcriptLineOfWords(words);
  const bands = [...new Set(found.map(word => lineOf.get(word.id)!))].map(line => lines.get(line));
  return bands.every((band): band is TranscriptLineBand => !!band) ? bands : [];
}
