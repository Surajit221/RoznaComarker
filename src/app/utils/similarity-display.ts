// Similarity panel display helpers: source colours (always shown with the source number: colour is never the only signal), percentages,
// and the fixed English texts for states and reasons.
import type { SimilaritySource } from '../api/similarity-api.service';

export const SIMILARITY_COLORS: readonly string[] = ['#f8c9c9', '#c9dff8', '#cdeccf', '#f8e2c0', '#e3d1f5', '#c8eeee', '#f5d0e6', '#e6e6b8'];
export const colorFor = (number: number | null | undefined): string =>
  number ? SIMILARITY_COLORS[(number - 1) % SIMILARITY_COLORS.length] : '#e5e7eb';

/** "20%", "<1%" for a source with words that rounds to 0, "" when there is no percentage (excluded, not compared). */
export function percentText(source: Pick<SimilaritySource, 'percent' | 'words'>): string {
  if (source.percent === null || source.percent === undefined) return '';
  return source.percent === 0 && source.words > 0 ? '<1%' : `${source.percent}%`;
}
export const overallText = (percent: number, matchedWords: number): string => (percent === 0 && matchedWords > 0 ? '<1%' : `${percent}%`);

export const NOT_ELIGIBLE_TEXT: Readonly<Record<string, string>> = {
  no_text: 'This essay has no text to check yet.',
  transcript_not_confirmed: 'The similarity check needs a confirmed transcript. Review the source text first.',
  too_long: 'This essay is too long for a similarity check.'
};

export const ERROR_TEXT: Readonly<Record<string, string>> = {
  SIMILARITY_IN_PROGRESS: 'A similarity check is already running for this essay.',
  SIMILARITY_SUBMISSION_CAP: 'This essay has been checked the maximum number of times.',
  SIMILARITY_DAILY_CAP: 'You have used all of today\'s similarity checks. Try again tomorrow.',
  SIMILARITY_NOT_RETRYABLE: 'There is nothing to try again for this check.',
  SIMILARITY_NOT_ELIGIBLE: 'This essay cannot be checked yet.',
  SIMILARITY_REVISION_CONFLICT: 'This report changed and has been reloaded.'
};

export function externalNote(state: string, reason: string | null): string {
  switch (state) {
    case 'not_permitted': return 'Compared with other essays in Rubrilo only: this essay was submitted before the similarity notice.';
    case 'not_configured': return 'Compared with other essays in Rubrilo only.';
    case 'skipped': return reason === 'daily_spend_reached'
      ? 'Compared with other essays in Rubrilo only: today\'s internet check limit was reached.' : 'Compared with other essays in Rubrilo only.';
    case 'submitted': case 'pending': return 'Rubrilo comparison done. The internet check is still running.';
    case 'failed': return reason === 'service_unavailable'
      ? 'The internet check is unavailable right now. Compared with other essays in Rubrilo only.' : 'The internet check could not be completed. Compared with other essays in Rubrilo only.';
    case 'expired': return 'The internet check did not finish. Compared with other essays in Rubrilo only.';
    default: return '';
  }
}

/**
 * Display only: the essay as flowing paragraphs. A single line break (the handwriting's line ends) becomes a space; a paragraph break (a
 * blank line, also with spaces or a carriage return on it) and the page separator stay. Same length and every other character unchanged,
 * so highlight offsets stay exact. Never applied to the stored text or to anything sent to the server.
 */
export function flowText(text: string): string {
  const t = typeof text === 'string' ? text : '';
  const out = t.split('');
  const blank = (c: string) => c === ' ' || c === '\t' || c === '\r';
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '\n') continue;
    let j = i - 1; while (j >= 0 && blank(t[j])) j--;
    let k = i + 1; while (k < t.length && blank(t[k])) k++;
    if ((j >= 0 && t[j] === '\n') || (k < t.length && t[k] === '\n')) continue;
    out[i] = ' ';
    if (i > 0 && t[i - 1] === '\r') out[i - 1] = ' ';
  }
  return out.join('');
}
