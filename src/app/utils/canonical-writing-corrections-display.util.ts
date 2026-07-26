import type { WritingCorrectionIssue } from '../api/writing-corrections-api.service';

export interface PersistedCanonicalCorrection {
  startChar?: number;
  endChar?: number;
  quotedText?: string;
  suggestedText?: string;
  category?: string;
  group?: string;
  symbol?: string;
  color?: string;
  message?: string;
}

export function buildCanonicalWritingIssues(
  transcript: string,
  corrections: readonly PersistedCanonicalCorrection[] | null | undefined
): WritingCorrectionIssue[] {
  const text = typeof transcript === 'string' ? transcript : '';
  return (Array.isArray(corrections) ? corrections : [])
    .map((correction): WritingCorrectionIssue | null => {
      const start = Number(correction?.startChar);
      const end = Number(correction?.endChar);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return null;
      const symbol = String(correction?.symbol || '').trim();
      const message = String(correction?.message || '').trim();
      return {
        start,
        end,
        wrongText: String(correction?.quotedText || text.slice(start, end)),
        suggestion: String(correction?.suggestedText || ''),
        groupKey: String(correction?.category || correction?.group || ''),
        groupLabel: String(correction?.category || correction?.group || ''),
        symbol,
        symbolLabel: symbol,
        description: message,
        color: String(correction?.color || '#FF0000'),
        message
      };
    })
    .filter((issue): issue is WritingCorrectionIssue => issue !== null);
}
