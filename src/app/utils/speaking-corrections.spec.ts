import { groupSpeakingCorrections, speakingCorrectionStatistics } from './speaking-corrections';
import type { SpeakingCorrection } from '../api/speaking-api.service';

const c = (id: string, over: Partial<SpeakingCorrection> = {}): SpeakingCorrection => ({ id, category: 'GRAMMAR', symbol: 'VF', quotedText: 'builded',
  startChar: 0, endChar: 7, message: 'Built is the past form.', suggestedText: 'built', ...over });

describe('groupSpeakingCorrections (the plain list: identical corrections once, with a count)', () => {
  it('17 identical corrections become one group of 17, in order of first appearance; each keeps its own id', () => {
    const list = [c('x0', { symbol: 'AGR', quotedText: 'It have', suggestedText: 'It has', message: 'Use has with it.' }),
      ...Array.from({ length: 17 }, (_, i) => c(`b${i}`, { startChar: 100 + i * 50, endChar: 107 + i * 50 }))];
    const groups = groupSpeakingCorrections(list);
    expect(groups.map(g => [g.quotedText, g.count])).toEqual([['It have', 1], ['builded', 17]]);
    expect(groups[1].ids.length).toBe(17);
    expect(groups[1]).toEqual(jasmine.objectContaining({ symbol: 'VF', suggestedText: 'built', category: 'GRAMMAR' }));
  });

  it('same symbol, quoted text and replacement: case and spacing at the edges do not split a group; anything else does', () => {
    const groups = groupSpeakingCorrections([c('a'), c('b', { quotedText: 'Builded ' }), c('c', { suggestedText: 'build' }), c('d', { symbol: 'WF' })]);
    expect(groups.map(g => g.count)).toEqual([2, 1, 1]);
  });
});

describe('speakingCorrectionStatistics (counts every occurrence, like the essay Correction Statistics)', () => {
  it('Grammar and Vocabulary issue counts with the codes that make them up', () => {
    const stats = speakingCorrectionStatistics([...Array.from({ length: 17 }, (_, i) => c(`b${i}`)), c('a', { symbol: 'AGR' }),
      c('v', { category: 'VOCABULARY', symbol: 'WC', quotedText: 'by walk', suggestedText: 'on foot' })]);
    expect(stats).toEqual([
      { category: 'grammar', title: 'Grammar', value: 18, codes: 'VF 17 · AGR 1', width: '95%' },
      { category: 'vocabulary', title: 'Vocabulary', value: 1, codes: 'WC 1', width: '5%' }
    ]);
  });

  it('no corrections: both rows at 0 with no codes', () => {
    expect(speakingCorrectionStatistics([]).map(r => [r.value, r.codes, r.width])).toEqual([[0, '', '0%'], [0, '', '0%']]);
  });
});
