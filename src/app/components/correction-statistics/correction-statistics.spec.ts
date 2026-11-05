import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanonicalResultViewState, categoryDisplay, categoryStatistic, normalizeCanonicalResult } from '../../utils/canonical-result-state.util';
import { CorrectionStatistics } from './correction-statistics';

const STATISTICS = { content: 0, grammar: 3, organization: 0, vocabulary: 3, mechanics: 16, total: 22 };
const state = (patch: Record<string, unknown> = {}): CanonicalResultViewState => normalizeCanonicalResult({ submissionId: 's', correctionStatus: 'completed', semanticStatus: 'completed', evaluationStatus: 'completed',
  statistics: STATISTICS, statisticsCompleteness: 'canonical', statisticsStatus: 'complete', correctionsAvailable: true,
  categoryAvailability: { content: 'available', grammar: 'available', organization: 'available', vocabulary: 'available', mechanics: 'available' }, ...patch }, null);
const RUBRIC = { CONTENT: { score: 16, maxScore: 20 }, ORGANIZATION: { score: 14, maxScore: 20 }, GRAMMAR: { score: 20, maxScore: 25 } };

describe('categoryStatistic', () => {
  it('a holistic category with no counted correction reads Holistic with its rubric score, not 0', () => {
    expect(categoryStatistic(state(), 'organization', RUBRIC)).toEqual({ value: 'Holistic · 14/20', holistic: true, score: '14/20', percent: 70 });
    expect(categoryStatistic(state(), 'content', RUBRIC).value).toBe('Holistic · 16/20');
  });
  it('without a score (marks hidden, no current evaluation): just Holistic', () => {
    for (const scores of [null, undefined, {}, { ORGANIZATION: null }, { ORGANIZATION: { score: null, maxScore: 20 } }, { ORGANIZATION: { score: 5, maxScore: 0 } }]) {
      expect(categoryStatistic(state(), 'organization', scores)).toEqual({ value: 'Holistic', holistic: true, score: null, percent: null });
    }
  });
  it('a custom rubric\'s total is not made of these categories: no score beside Holistic', () => {
    expect(categoryStatistic(state({ hasValidCustomRubric: true }), 'organization', RUBRIC).value).toBe('Holistic');
  });
  it('counted categories keep their numbers, also when zero', () => {
    expect(categoryStatistic(state(), 'grammar', RUBRIC)).toEqual({ value: 3, holistic: false, score: null, percent: null });
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, grammar: 0 } }), 'grammar', RUBRIC).value).toBe(0);
  });
  it('a holistic category that really has counted corrections shows the count', () => {
    expect(categoryStatistic(state({ statistics: { ...STATISTICS, organization: 2 } }), 'organization', RUBRIC)).toEqual({ value: 2, holistic: false, score: null, percent: null });
  });
  it('still analysing or failed stays as it was: never Holistic', () => {
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

  it('the case from QA: Holistic for Content and Organization, Grammar 3, Vocabulary 3, Mechanics 16', () => {
    const dom = render({ state: state(), rubricScores: RUBRIC, barWidths: { grammar: '14%', vocabulary: '14%', mechanics: '73%', content: '0%', organization: '0%' } });
    expect(value(dom, 'content')).toBe('Holistic · 16/20');
    expect(value(dom, 'organization')).toBe('Holistic · 14/20');
    expect([value(dom, 'grammar'), value(dom, 'vocabulary'), value(dom, 'mechanics')]).toEqual(['3', '3', '16']);
    expect(row(dom, 'organization').textContent).not.toContain('Issues');
    expect(row(dom, 'grammar').textContent).toContain('Grammar Issues');
  });
  it('holistic rows have a neutral bar at the rubric share; counted rows keep their colour and width', () => {
    const dom = render({ state: state(), rubricScores: RUBRIC, barWidths: { mechanics: '73%' } });
    const bar = (category: string) => row(dom, category).querySelector<HTMLElement>('.h-full')!;
    expect(bar('organization').classList.contains('bg-gray-400')).toBeTrue();
    expect(bar('organization').classList.contains('bg-blue-400')).toBeFalse();
    expect(bar('organization').style.width).toBe('70%');
    expect(bar('mechanics').classList.contains('bg-yellow-400')).toBeTrue();
    expect(bar('mechanics').style.width).toBe('73%');
  });
  it('the explanation is on the row and in plain text, for touch screens that have no hover', () => {
    const dom = render({ state: state(), rubricScores: RUBRIC });
    expect(row(dom, 'organization').getAttribute('title')).toBe('Assessed on the whole piece, not by individual corrections.');
    expect(row(dom, 'grammar').getAttribute('title')).toBeNull();
    expect(dom.querySelector('[data-statistic-help]')!.textContent).toBe('Assessed on the whole piece, not by individual corrections.');
  });
  it('marks hidden: Holistic without a score, the bar empty', () => {
    const dom = render({ state: state(), rubricScores: null });
    expect(value(dom, 'organization')).toBe('Holistic');
    expect(dom.textContent).not.toContain('14/20');
    expect(row(dom, 'organization').querySelector<HTMLElement>('.h-full')!.style.width).toBe('0%');
  });
  it('no holistic row: no explanation', () => {
    const dom = render({ state: state({ statistics: { ...STATISTICS, content: 1, organization: 1 } }), rubricScores: RUBRIC });
    expect(dom.querySelector('[data-statistic-help]')).toBeNull();
    expect(value(dom, 'content')).toBe('1');
  });
});
