import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanonicalResultViewState, categoryCodeCounts, categoryDisplay, categoryStatistic, normalizeCanonicalResult } from '../../utils/canonical-result-state.util';
import { CorrectionStatistics } from './correction-statistics';

const STATISTICS = { content: 0, grammar: 3, organization: 0, vocabulary: 3, mechanics: 16, total: 22 };
const state = (patch: Record<string, unknown> = {}): CanonicalResultViewState => normalizeCanonicalResult({ submissionId: 's', correctionStatus: 'completed', semanticStatus: 'completed', evaluationStatus: 'completed',
  statistics: STATISTICS, statisticsCompleteness: 'canonical', statisticsStatus: 'complete', correctionsAvailable: true,
  categoryAvailability: { content: 'available', grammar: 'available', organization: 'available', vocabulary: 'available', mechanics: 'available' }, ...patch }, null);

const CORRECTIONS = [
  ...['SP', 'SP', 'SP', 'P', 'P', 'CAP', 'SP', 'CAP', 'SPC', 'SP', 'SP', 'P', 'SP', 'SP', 'CAP', 'SP'].map(symbol => ({ category: 'MECHANICS', symbol })),
  { category: 'GRAMMAR', symbol: 'AGR' }, { category: 'GRAMMAR', symbol: 'AGR' }, { category: 'GRAMMAR', symbol: 'PREP' },
  { category: 'VOCABULARY', symbol: 'WC' }, { category: 'VOCABULARY', symbol: 'WF' }, { category: 'VOCABULARY', symbol: 'WC' }];

describe('categoryStatistic', () => {
  it('is the plain count, for every category, also when zero', () => {
    expect(categoryStatistic(state(), 'organization')).toEqual({ value: 0 });
    expect(categoryStatistic(state(), 'content')).toEqual({ value: 0 });
    expect(categoryStatistic(state(), 'grammar')).toEqual({ value: 3 });
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, organization: 2 } }), 'organization')).toEqual({ value: 2 });
  });
  it('a count that is not a whole number is never shown as a count', () => {
    for (const bad of [1.7, -1, '2.5', 'many', NaN]) {
      expect(categoryStatistic(state({ statistics: { ...STATISTICS, grammar: bad } }), 'grammar').value).toBe('Unavailable');
    }
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, grammar: '4' } }), 'grammar').value).toBe(4);
  });
  it('still analysing or failed stays as it was', () => {
    const pending = state({ categoryAvailability: { content: 'pending', organization: 'failed' } });
    expect(categoryStatistic(pending, 'content').value).toBe('Analyzing…');
    expect(categoryStatistic(pending, 'organization').value).toBe('Unavailable');
    expect(categoryStatistic(null, 'content').value).toBe('Analyzing…');
  });
  it('categoryDisplay still gives the raw count', () => {
    expect(categoryDisplay(state(), 'organization')).toBe(0);
  });
});

describe('categoryCodeCounts', () => {
  it('lists the codes of a category, most frequent first', () => {
    expect(categoryCodeCounts(CORRECTIONS, 'mechanics', 16)).toBe('SP 9 · CAP 3 · P 3 · SPC 1');
    expect(categoryCodeCounts(CORRECTIONS, 'grammar', 3)).toBe('AGR 2 · PREP 1');
  });
  it('says nothing when the corrections do not add up to the count, or the count is zero or not a number', () => {
    expect(categoryCodeCounts(CORRECTIONS, 'grammar', 4)).toBe('');
    expect(categoryCodeCounts(CORRECTIONS, 'content', 0)).toBe('');
    expect(categoryCodeCounts(CORRECTIONS, 'grammar', 'Unavailable')).toBe('');
    expect(categoryCodeCounts(null, 'grammar', 3)).toBe('');
  });
  it('Content and Organization use their own codes the same way', () => {
    expect(categoryCodeCounts([{ category: 'CONTENT', symbol: 'DEV' }, { category: 'CONTENT', symbol: 'REL' }, { category: 'ORGANIZATION', symbol: 'CO' }], 'content', 2)).toBe('DEV 1 · REL 1');
  });
});

describe('CorrectionStatistics', () => {
  let fixture: ComponentFixture<CorrectionStatistics>;
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [CorrectionStatistics] });
    fixture = TestBed.createComponent(CorrectionStatistics);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const row = (dom: HTMLElement, category: string) => dom.querySelector<HTMLElement>(`[data-statistic="${category}"]`)!;
  const value = (dom: HTMLElement, category: string) => row(dom, category).querySelector('[data-statistic-value]')!.textContent;
  const codes = (dom: HTMLElement, category: string) => row(dom, category).querySelector('[data-statistic-codes]')?.textContent ?? null;

  it('every row is the same: its name, Issues, a whole number, its colour, its codes', () => {
    const dom = render({ state: state(), corrections: CORRECTIONS, barWidths: { grammar: '14%', vocabulary: '14%', mechanics: '73%', content: '0%', organization: '0%' } });
    expect([value(dom, 'content'), value(dom, 'grammar'), value(dom, 'organization'), value(dom, 'vocabulary'), value(dom, 'mechanics')]).toEqual(['0', '3', '0', '3', '16']);
    expect(row(dom, 'organization').textContent).toContain('Organization Issues');
    expect(codes(dom, 'mechanics')).toBe('SP 9 · CAP 3 · P 3 · SPC 1');
    expect(codes(dom, 'vocabulary')).toBe('WC 2 · WF 1');
    expect(codes(dom, 'content')).toBeNull();
    expect(row(dom, 'mechanics').querySelector<HTMLElement>('.h-full')!.classList.contains('bg-yellow-400')).toBeTrue();
  });
  it('shows no score, no fraction and none of the old words', () => {
    const dom = render({ state: state(), corrections: CORRECTIONS });
    expect(dom.textContent).not.toMatch(/holistic|whole piece|\/20|·\s*\d+\/\d+/i);
    for (const category of ['content', 'grammar', 'organization', 'vocabulary', 'mechanics']) expect(value(dom, category)).toMatch(/^\d+$/);
  });
  it('without the corrections list: the counts, without codes', () => {
    const dom = render({ state: state() });
    expect(value(dom, 'mechanics')).toBe('16');
    expect(dom.querySelector('[data-statistic-codes]')).toBeNull();
  });
});
