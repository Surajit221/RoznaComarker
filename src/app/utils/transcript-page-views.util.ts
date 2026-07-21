/* OCR/correction response DTOs are currently untyped at the HTTP boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FeedbackAnnotation } from '../models/feedback-annotation.model';
import type { OcrWord } from '../models/ocr-token.model';

export interface TranscriptPageView {
  key: string;
  displayNumber: number;
  fileId: string;
  pageNumber: number;
  words: OcrWord[];
  annotations: FeedbackAnnotation[];
  text: string;
  status: 'ready' | 'processing' | 'failed';
}

const id = (value: unknown): string => typeof value === 'string' ? value.trim()
  : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const pageNumber = (value: unknown): number => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1;

function wordsForPage(page: any): OcrWord[] {
  return (Array.isArray(page?.words) ? page.words : []).map((word: any) => {
    const wordId = id(word?.id); const text = typeof word?.text === 'string' ? word.text.trim() : '';
    if (!wordId || !text) return null;
    const raw = word?.bbox; const bbox = raw && [raw.x, raw.y, raw.w, raw.h].every((value: unknown) => Number.isFinite(Number(value)))
      ? { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) } : null;
    return { id: wordId, text, bbox, separatorBefore: word?.separatorBefore === '\n\n' ? '\n\n'
      : word?.separatorBefore === '\n' ? '\n' : word?.separatorBefore === ' ' ? ' ' : '' } satisfies OcrWord;
  }).filter((word: OcrWord | null): word is OcrWord => Boolean(word));
}

function annotation(correction: any, submissionId: string, wordIds: Set<string>): FeedbackAnnotation | null {
  const correctionId = id(correction?.id ?? correction?._id);
  if (!correctionId) return null;
  const scopedWordIds = (Array.isArray(correction?.wordIds) ? correction.wordIds : []).map(id).filter((wordId: string) => wordIds.has(wordId));
  const bboxList = Array.isArray(correction?.bboxList) ? correction.bboxList : [];
  if (!scopedWordIds.length && !bboxList.length) return null;
  return { _id: correctionId, submissionId, page: pageNumber(correction?.pageNumber ?? correction?.page), wordIds: scopedWordIds,
    bboxList, group: typeof correction?.category === 'string' ? correction.category : String(correction?.group || ''),
    symbol: String(correction?.symbol || ''), color: String(correction?.color || '#FF0000'), message: String(correction?.message || ''),
    suggestedText: String(correction?.suggestedText || ''), startChar: Number.isFinite(correction?.startChar) ? correction.startChar : undefined,
    endChar: Number.isFinite(correction?.endChar) ? correction.endChar : undefined,
    source: correction?.source === 'LANGUAGETOOL' ? 'LANGUAGETOOL' : 'AI', editable: Boolean(correction?.editable) };
}

export function buildTranscriptPageViews(options: { submissionId: string; fileIds: string[]; ocrPages: any[]; corrections: any[];
  overallOcrStatus?: string }): TranscriptPageView[] {
  const order = new Map(options.fileIds.map((fileId, index) => [String(fileId), index]));
  const persistedOrder = new Map<any, number>();
  options.ocrPages.forEach((page, index) => persistedOrder.set(page, index));
  const pages = [...options.ocrPages];
  for (const fileId of options.fileIds) if (!pages.some((page) => id(page?.fileId) === fileId)) pages.push({ fileId, pageNumber: 1,
    status: options.overallOcrStatus === 'failed' ? 'failed' : 'processing', words: [], text: '' });
  pages.sort((a, b) => (order.get(id(a?.fileId)) ?? Number.MAX_SAFE_INTEGER) - (order.get(id(b?.fileId)) ?? Number.MAX_SAFE_INTEGER)
    || pageNumber(a?.pageNumber ?? a?.page) - pageNumber(b?.pageNumber ?? b?.page)
    || (persistedOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (persistedOrder.get(b) ?? Number.MAX_SAFE_INTEGER));

  return pages.map((page, index) => {
    const fileId = id(page?.fileId); const number = pageNumber(page?.pageNumber ?? page?.page); const words = wordsForPage(page);
    const wordIds = new Set(words.map((word) => word.id)); const seen = new Set<string>();
    const annotations = options.corrections.map((correction) => {
      const correctionFileId = id(correction?.fileId); const correctionPage = pageNumber(correction?.pageNumber ?? correction?.page);
      if (correctionFileId && correctionFileId !== fileId) return null;
      if (correctionPage !== number) return null;
      const next = annotation(correction, options.submissionId, wordIds);
      if (!next || seen.has(next._id)) return null;
      seen.add(next._id); return next;
    }).filter((item): item is FeedbackAnnotation => Boolean(item));
    const explicitStatus = String(page?.status || page?.ocrStatus || '').toLowerCase();
    const status: TranscriptPageView['status'] = explicitStatus === 'failed' ? 'failed'
      : words.length || String(page?.text || '').trim() ? 'ready' : explicitStatus === 'completed' ? 'ready' : 'processing';
    return { key: `${fileId}:${number}`, displayNumber: index + 1, fileId, pageNumber: number, words, annotations,
      text: typeof page?.text === 'string' ? page.text : '', status };
  });
}
