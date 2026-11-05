import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanonicalResultViewState, categoryDisplay, categoryStatistic, normalizeCanonicalResult } from '../../utils/canonical-result-state.util';
import { CorrectionStatistics } from './correction-statistics';

const STATISTICS = { content: 0, grammar: 3, organization: 0, vocabulary: 3, mechanics: 16, total: 22 };
const state = (patch: Record<string, unknown> = {}): CanonicalResultViewState => normalizeCanonicalResult({ submissionId: 's', correctionStatus: 'completed', semanticStatus: 'completed', evaluationStatus: 'completed',
  statistics: STATISTICS, statisticsCompleteness: 'canonical', statisticsStatus: 'complete', correctionsAvailable: true,
  categoryAvailability: { content: 'available', grammar: 'available', organization: 'available', vocabulary: 'available', mechanics: 'available' }, ...patch }, null);
const RUBRIC = { CONTENT: { score: 16, maxScore: 20 }, ORGANIZATION: { score: 14, maxScore: 20 }, GRAMMAR: { score: 20, maxScore: 25 } };

describe('categoryStatistic', () => {
  it('no counted finding and marks lost: the count with the rubric score', () => {
    expect(categoryStatistic(state(), 'organization', RUBRIC)).toEqual({ value: '0 · 14/20', score: '14/20' });
    expect(categoryStatistic(state(), 'content', RUBRIC).value).toBe('0 · 16/20');
  });
  it('no counted finding and full marks: just 0', () => {
    expect(categoryStatistic(state(), 'organization', { ORGANIZATION: { score: 20, maxScore: 20 } })).toEqual({ value: 0, score: null });
  });
  it('without a score (marks hidden, no current evaluation): just the count', () => {
    for (const scores of [null, undefined, {}, { ORGANIZATION: null }, { ORGANIZATION: { score: null, maxScore: 20 } }, { ORGANIZATION: { score: 5, maxScore: 0 } }]) {
      expect(categoryStatistic(state(), 'organization', scores)).toEqual({ value: 0, score: null });
    }
  });
  it('a custom rubric\'s total is not made of these categories: no score beside the count', () => {
    expect(categoryStatistic(state({ hasValidCustomRubric: true }), 'organization', RUBRIC).value).toBe(0);
  });
  it('other categories keep their numbers, also when zero', () => {
    expect(categoryStatistic(state(), 'grammar', RUBRIC)).toEqual({ value: 3, score: null });
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, grammar: 0 } }), 'grammar', RUBRIC).value).toBe(0);
  });
  it('real findings show their count', () => {
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, organization: 2 } }), 'organization', RUBRIC)).toEqual({ value: 2, score: null });
  });
  it('still analysing or failed stays as it was', () => {
    const pending = state({ categoryAvailability: { content: 'pending', organization: 'failed' } });
    expect(categoryStatistic(pending, 'content', RUBRIC).value).toBe('Analyzing…');
    expect(categoryStatistic(pending, 'organization', RUBRIC).value).toBe('Unavailable');
    expect(categoryStatistic(null, 'content', RUBRIC).value).toBe('Analyzing…');
  });
  it('categoryDisplay still gives the raw count', () => {
    expect(categoryDisplay(state(), 'organization')).toBe(0);
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

  it('every row is the same: its name, Issues, its value, its colour', () => {
    const dom = render({ state: state({ statistics: { ...STATISTICS, content: 2 } }), rubricScores: RUBRIC, barWidths: { content: '9%', grammar: '14%', vocabulary: '14%', mechanics: '73%', organization: '0%' } });
    expect(value(dom, 'content')).toBe('2');
    expect(value(dom, 'organization')).toBe('0 · 14/20');
    expect([value(dom, 'grammar'), value(dom, 'vocabulary'), value(dom, 'mechanics')]).toEqual(['3', '3', '16']);
    expect(row(dom, 'organization').textContent).toContain('Organization Issues');
    expect(row(dom, 'content').textContent).toContain('Content Issues');
    const bar = (category: string) => row(dom, category).querySelector<HTMLElement>('.h-full')!;
    expect(bar('content').classList.contains('bg-red-400')).toBeTrue();
    expect(bar('content').style.width).toBe('9%');
    expect(bar('organization').classList.contains('bg-blue-400')).toBeTrue();
    expect(bar('organization').style.width).toBe('0%');
  });
  it('no surface says the old words', () => {
    const dom = render({ state: state(), rubricScores: RUBRIC });
    expect(dom.textContent).not.toMatch(/holistic|whole piece/i);
    expect(dom.innerHTML).not.toMatch(/holistic|whole piece/i);
  });
  it('marks hidden: the count without a score, the bar empty', () => {
    const dom = render({ state: state(), rubricScores: null });
    expect(value(dom, 'organization')).toBe('0');
    expect(dom.textContent).not.toContain('14/20');
    expect(row(dom, 'organization').querySelector<HTMLElement>('.h-full')!.style.width).toBe('0%');
  });
});
