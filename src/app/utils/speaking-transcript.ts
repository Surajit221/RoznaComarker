import type { OcrWord } from '../models/ocr-token.model';
import type { FeedbackAnnotation } from '../models/feedback-annotation.model';
import type { SpeakingCorrection } from '../api/speaking-api.service';

/**
 * The adapter from a speaking result to the existing transcript component (app-tokenized-transcript): the assessed text split into words
 * (no boxes: there is no image), each correction attached to the words its character offsets cover, and, only when asked, the removed filler
 * words put back at their places in brackets (so they read as fillers without relying on colour). Nothing here is editable.
 */
export interface SpeakingTranscriptModel { words: OcrWord[]; annotations: FeedbackAnnotation[]; }

const CATEGORY_LABEL: Readonly<Record<string, string>> = Object.freeze({ GRAMMAR: 'Grammar', VOCABULARY: 'Vocabulary' });
const categoryLabel = (category: string) => CATEGORY_LABEL[String(category || '').trim().toUpperCase()] ?? String(category || 'Correction');
const fillerText = (text: string) => `(${String(text).replace(/[^\p{L}\p{N}'-]+/gu, '').toLowerCase()})`;

export function buildSpeakingTranscript(text: string | null | undefined, corrections: readonly SpeakingCorrection[], fillers: readonly { offset: number; text: string }[],
  options: { showFillers?: boolean; submissionId?: string } = {}): SpeakingTranscriptModel {
  const source = String(text ?? '');
  const tokens = [...source.matchAll(/\S+/g)].map((match, index) => {
    const start = match.index ?? 0;
    const gap = index === 0 ? '' : source.slice(0, start).match(/\s*$/)?.[0] ?? ' ';
    const separatorBefore: OcrWord['separatorBefore'] = gap.includes('\n\n') ? '\n\n' : gap.includes('\n') ? '\n' : ' ';
    return { id: `w${index}`, text: match[0], start, end: start + match[0].length, separatorBefore };
  });

  const words: OcrWord[] = [];
  const shown = options.showFillers ? [...fillers].filter(f => f && String(f.text || '').trim()).sort((a, b) => a.offset - b.offset) : [];
  let next = 0;
  const pushFiller = (index: number) => words.push({ id: `filler-${index}`, text: fillerText(shown[index].text), bbox: null, separatorBefore: ' ' });
  for (const token of tokens) {
    let separator = token.separatorBefore;
    while (next < shown.length && shown[next].offset <= token.start) {
      words.push({ id: `filler-${next}`, text: fillerText(shown[next].text), bbox: null, separatorBefore: separator });
      separator = ' ';
      next++;
    }
    words.push({ id: token.id, text: token.text, bbox: null, separatorBefore: separator });
  }
  for (; next < shown.length; next++) pushFiller(next);

  const annotations: FeedbackAnnotation[] = [];
  for (const correction of corrections) {
    const wordIds = tokens.filter(t => t.start < correction.endChar && t.end > correction.startChar).map(t => t.id);
    if (!wordIds.length) continue;
    const label = categoryLabel(correction.category);
    annotations.push({ _id: correction.id, submissionId: options.submissionId ?? '', category: label, group: label, symbol: correction.symbol,
      message: correction.message, suggestedText: correction.suggestedText, quotedText: correction.quotedText, startChar: correction.startChar,
      endChar: correction.endChar, wordIds, source: 'AI', editable: false });
  }
  return { words, annotations };
}

/** The display name of a correction's category (Grammar or Vocabulary for speech). */
export const speakingCategoryLabel = categoryLabel;
