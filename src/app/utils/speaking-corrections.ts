import type { SpeakingCorrection } from '../api/speaking-api.service';

/**
 * The plain list of a speaking result's corrections (stage 7f): identical corrections (same symbol, quoted text and replacement) are one row with a
 * count, in order of first appearance. The transcript still highlights every occurrence at its own place, and the statistics count every
 * occurrence (as the essay Correction Statistics do: one stored correction, one issue).
 */
export interface SpeakingCorrectionGroup {
  key: string;
  ids: string[];
  count: number;
  category: string;
  symbol: string;
  quotedText: string;
  suggestedText: string;
  message: string;
}

const same = (value: string | undefined) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function groupSpeakingCorrections(corrections: readonly SpeakingCorrection[]): SpeakingCorrectionGroup[] {
  const groups = new Map<string, SpeakingCorrectionGroup>();
  for (const c of corrections) {
    const key = [same(c.symbol), same(c.quotedText), same(c.suggestedText)].join('\u0000');
    const group = groups.get(key);
    if (group) { group.ids.push(c.id); group.count++; continue; }
    groups.set(key, { key, ids: [c.id], count: 1, category: c.category, symbol: c.symbol, quotedText: String(c.quotedText ?? '').trim(),
      suggestedText: String(c.suggestedText ?? '').trim(), message: c.message });
  }
  return [...groups.values()];
}

export interface SpeakingStatisticRow { category: 'grammar' | 'vocabulary'; title: string; value: number; codes: string; width: string; }

/** Grammar and Vocabulary issue counts (every occurrence), the codes behind each ("VF 17 · AGR 1") and each row's share of all issues. */
export function speakingCorrectionStatistics(corrections: readonly SpeakingCorrection[]): SpeakingStatisticRow[] {
  const total = corrections.length;
  return (['grammar', 'vocabulary'] as const).map(category => {
    const mine = corrections.filter(c => String(c.category || '').toLowerCase() === category);
    const tally = new Map<string, number>();
    for (const c of mine) { const symbol = String(c.symbol || '').trim(); if (symbol) tally.set(symbol, (tally.get(symbol) || 0) + 1); }
    const codes = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([symbol, n]) => `${symbol} ${n}`).join(' · ');
    return { category, title: category === 'grammar' ? 'Grammar' : 'Vocabulary', value: mine.length, codes,
      width: total ? `${Math.round((mine.length / total) * 100)}%` : '0%' };
  });
}
