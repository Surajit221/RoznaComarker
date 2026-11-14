import { CATEGORY_TONES } from '../../../../constants/category-palette';

/**
 * Display helpers for the Reports page's "Essay Analysis Overview". They only change HOW the page's existing values are shown:
 * the values, their order and their calculation stay exactly as the page computes them (report-pages.ts).
 */
export interface OverviewIssue { label: string; pctText: string }
export interface IssueBar { label: string; pctText: string; percent: number; color: string }

// Each issue label takes the colour of the correction category its number comes from (report-pages.ts commonIssues).
const ISSUE_CATEGORY: Readonly<Record<string, keyof typeof CATEGORY_TONES>> = Object.freeze({
  'Grammar and punctuation errors': 'GRAMMAR',
  'Weak thesis statements': 'ORGANIZATION',
  'Insufficient supporting evidence': 'CONTENT',
  'Poor paragraph structure': 'ORGANIZATION',
  'Vocabulary repetition': 'VOCABULARY',
});

const percentOf = (text: unknown): number | null => {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(String(text ?? ''));
  return match ? Number(match[1]) : null;
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function issueBars(issues: unknown): IssueBar[] {
  if (!Array.isArray(issues)) return [];
  return issues.filter((i) => i && typeof i === 'object').map((i: OverviewIssue) => {
    const label = String(i.label ?? ''), pctText = String(i.pctText ?? '');
    const key = ISSUE_CATEGORY[label];
    return { label, pctText, percent: clamp(percentOf(pctText) ?? 0), color: key ? CATEGORY_TONES[key].edge : 'var(--color-primary)' };
  });
}

export type TrendTile =
  | { kind: 'metric'; key: 'average' | 'revision'; label: string; valueText: string; percent: number; text: string }
  | { kind: 'change'; key: 'scoreChange' | 'revisionChange'; label: string; valueText: string; direction: 'up' | 'down' | 'none';
      tone: 'good' | 'warn' | 'neutral'; directionText: string; text: string }
  | { kind: 'pill'; key: 'essayType'; label: string; valueText: string; muted: boolean; text: string }
  | { kind: 'text'; key: string; label: string; valueText: string; text: string };

const ORDER = ['average', 'revision', 'scoreChange', 'revisionChange', 'essayType'];

function change(key: 'scoreChange' | 'revisionChange', label: string, n: number, sentence: string, upIsGood: boolean): TrendTile {
  // The sentence says "improved by n" (score) or "decreased by n" (revision rate): the real direction is the sign of the change.
  const realChange = key === 'scoreChange' ? n : -n;
  const direction = realChange > 0 ? 'up' : realChange < 0 ? 'down' : 'none';
  const tone = direction === 'none' ? 'neutral' : (direction === 'up') === upIsGood ? 'good' : 'warn';
  return { kind: 'change', key, label, valueText: `${Math.abs(n)}%`, direction, tone,
    directionText: direction === 'up' ? 'Up' : direction === 'down' ? 'Down' : 'No change', text: sentence };
}

/** The trend sentences as tiles. A sentence the helper does not recognise is still shown, as a plain text tile. */
export function trendTiles(trends: unknown): TrendTile[] {
  if (!Array.isArray(trends)) return [];
  const known: TrendTile[] = [], other: TrendTile[] = [];
  trends.forEach((raw, index) => {
    const sentence = String(raw ?? '');
    let m: RegExpExecArray | null;
    if ((m = /^Average score: (-?\d+(?:\.\d+)?)%$/.exec(sentence))) {
      known.push({ kind: 'metric', key: 'average', label: 'Average score', valueText: `${m[1]}%`, percent: clamp(Number(m[1])), text: sentence });
    } else if ((m = /^Revision rate: (-?\d+(?:\.\d+)?)%$/.exec(sentence))) {
      known.push({ kind: 'metric', key: 'revision', label: 'Revision rate', valueText: `${m[1]}%`, percent: clamp(Number(m[1])), text: sentence });
    } else if ((m = /^Average score improved by (-?\d+(?:\.\d+)?)% this month$/.exec(sentence))) {
      known.push(change('scoreChange', 'Score change this month', Number(m[1]), sentence, true));
    } else if ((m = /^Revision rate decreased by (-?\d+(?:\.\d+)?)%$/.exec(sentence))) {
      known.push(change('revisionChange', 'Revision-rate change', Number(m[1]), sentence, false));
    } else if ((m = /^Most common essay type: (.+)$/.exec(sentence))) {
      const value = m[1].trim();
      const na = /^\(?\s*n\/?a\s*\)?$/i.test(value);
      known.push({ kind: 'pill', key: 'essayType', label: 'Most common essay type', valueText: na ? 'N/A' : value, muted: na, text: sentence });
    } else {
      const colon = sentence.indexOf(':');
      other.push({ kind: 'text', key: `text-${index}`, label: colon > 0 ? sentence.slice(0, colon).trim() : sentence,
        valueText: colon > 0 ? sentence.slice(colon + 1).trim() : '', text: sentence });
    }
  });
  known.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return [...known, ...other];
}
