import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EssayAnalysisOverview } from './essay-analysis-overview';
import { issueBars, trendTiles } from './essay-analysis-overview.util';
import { CATEGORY_TONES } from '../../../../constants/category-palette';

// The Reports page's "Essay Analysis Overview", drawn visually from exactly the same values the page computes today.
const ISSUES = [
  { label: 'Grammar and punctuation errors', pctText: '42%' },
  { label: 'Weak thesis statements', pctText: '18%' },
  { label: 'Insufficient supporting evidence', pctText: '9%' },
  { label: 'Poor paragraph structure', pctText: '18%' },
  { label: 'Vocabulary repetition', pctText: '0%' }
];
const LOADED_TRENDS = ['Average score improved by 0% this month', 'Revision rate decreased by 0%', 'Most common essay type: (N/A)', 'Average score: 72%', 'Revision rate: 33%'];
const DEFAULT_TRENDS = ['Average score improved by 0% this month', 'Revision rate decreased by 0%', 'Most common essay type: (N/A)', 'Longest essay: 0 words', 'Shortest essay: 0 words'];

describe('EssayAnalysisOverview', () => {
  let fixture: ComponentFixture<EssayAnalysisOverview>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EssayAnalysisOverview] }).compileComponents();
    fixture = TestBed.createComponent(EssayAnalysisOverview);
    host = fixture.nativeElement;
  });
  const render = (commonIssues: unknown, performanceTrends: unknown) => {
    fixture.componentRef.setInput('commonIssues', commonIssues);
    fixture.componentRef.setInput('performanceTrends', performanceTrends);
    fixture.detectChanges();
  };
  const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  it('Common Issues: one bar row per issue in the same order, label and percentage as text, category colours, header icon', () => {
    render(ISSUES, LOADED_TRENDS);
    const card = host.querySelector('[data-card="issues"]')!;
    expect(card.querySelector('h3')!.textContent).toContain('Common Issues Detected');
    expect(card.querySelector('h3 i.bx')!.getAttribute('aria-hidden')).toBe('true');
    const rows = Array.from(card.querySelectorAll('[role="listitem"]'));
    expect(rows.map((r) => text(r.querySelector('.overview-bar__label')))).toEqual(ISSUES.map((i) => i.label));
    expect(rows.map((r) => text(r.querySelector('.overview-bar__value')))).toEqual(ISSUES.map((i) => i.pctText));
    const fills = rows.map((r) => r.querySelector('.overview-bar__fill') as HTMLElement);
    expect(fills.map((f) => f.style.width)).toEqual(['42%', '18%', '9%', '18%', '0%']);
    expect(fills.every((f) => f.getAttribute('aria-hidden') === 'true')).toBeTrue();
    expect(card.querySelector('[role="list"]')!.getAttribute('aria-label')).toBe('Common issues detected');
  });

  it('Performance Trends: metric tiles with bars, change chips, essay-type pill, all values as text', () => {
    render(ISSUES, LOADED_TRENDS);
    const card = host.querySelector('[data-card="trends"]')!;
    expect(card.querySelector('h3')!.textContent).toContain('Performance Trends');
    expect(card.querySelector('h3 i.bx')).not.toBeNull();
    const tiles = Array.from(card.querySelectorAll('.overview-tile'));
    expect(tiles.map((t) => t.getAttribute('data-tile'))).toEqual(['average', 'revision', 'scoreChange', 'revisionChange', 'essayType']);
    const avg = tiles[0];
    expect(text(avg)).toContain('Average score');
    expect(text(avg.querySelector('.overview-tile__big'))).toBe('72%');
    expect((avg.querySelector('.overview-tile__fill') as HTMLElement).style.width).toBe('72%');
    expect(text(tiles[1].querySelector('.overview-tile__big'))).toBe('33%');
    expect((tiles[1].querySelector('.overview-tile__fill') as HTMLElement).style.width).toBe('33%');
    for (const sentence of LOADED_TRENDS) {
      const value = sentence.match(/-?\d+%|\(N\/A\)/)![0].replace(/[()]/g, '');
      expect(text(card)).toContain(value);
    }
  });

  it('a 0% change is a neutral chip with a text label, never coloured up or down', () => {
    render(ISSUES, LOADED_TRENDS);
    for (const key of ['scoreChange', 'revisionChange']) {
      const chip = host.querySelector(`[data-tile="${key}"] .overview-chip`)!;
      expect(chip.classList).toContain('overview-chip--neutral');
      expect(text(chip)).toContain('0%');
      expect(text(chip)).toContain('No change');
      expect(chip.querySelector('i.bx')!.getAttribute('aria-hidden')).toBe('true');
    }
    expect(text(host.querySelector('[data-tile="scoreChange"]'))).toContain('Average score improved by 0% this month');
    expect(text(host.querySelector('[data-tile="revisionChange"]'))).toContain('Revision rate decreased by 0%');
  });

  it('non-zero changes: arrows follow the direction, colour follows whether it is good (score up, revision rate down)', () => {
    render(ISSUES, ['Average score improved by 5% this month', 'Revision rate decreased by 3%']);
    const score = host.querySelector('[data-tile="scoreChange"] .overview-chip')!;
    expect(score.classList).toContain('overview-chip--good');
    expect(text(score)).toContain('Up');
    expect(score.querySelector('.bx-up-arrow-alt')).not.toBeNull();
    const revision = host.querySelector('[data-tile="revisionChange"] .overview-chip')!;
    expect(revision.classList).toContain('overview-chip--good');
    expect(text(revision)).toContain('Down');
    expect(revision.querySelector('.bx-down-arrow-alt')).not.toBeNull();
    render(ISSUES, ['Average score improved by -2% this month', 'Revision rate decreased by -4%']);
    expect(host.querySelector('[data-tile="scoreChange"] .overview-chip')!.classList).toContain('overview-chip--warn');
    expect(text(host.querySelector('[data-tile="scoreChange"] .overview-chip'))).toContain('Down');
    expect(host.querySelector('[data-tile="revisionChange"] .overview-chip')!.classList).toContain('overview-chip--warn');
    expect(text(host.querySelector('[data-tile="revisionChange"] .overview-chip'))).toContain('Up');
  });

  it('N/A essay type is a muted pill that still says N/A; a real type is a normal pill', () => {
    render(ISSUES, LOADED_TRENDS);
    const pill = host.querySelector('[data-tile="essayType"] .overview-pill')!;
    expect(pill.classList).toContain('overview-pill--muted');
    expect(text(pill)).toBe('N/A');
    render(ISSUES, ['Most common essay type: Persuasive']);
    const real = host.querySelector('[data-tile="essayType"] .overview-pill')!;
    expect(real.classList).not.toContain('overview-pill--muted');
    expect(text(real)).toBe('Persuasive');
  });

  it('the page\'s default (not yet loaded) values still all show, including the word counts as text tiles', () => {
    render(ISSUES.map((i) => ({ ...i, pctText: '0%' })), DEFAULT_TRENDS);
    const tiles = Array.from(host.querySelectorAll('.overview-tile')).map((t) => t.getAttribute('data-tile'));
    expect(tiles).toEqual(['scoreChange', 'revisionChange', 'essayType', 'text-3', 'text-4']);
    expect(text(host.querySelector('[data-tile="text-3"]'))).toContain('Longest essay');
    expect(text(host.querySelector('[data-tile="text-3"]'))).toContain('0 words');
    expect(text(host.querySelector('[data-tile="text-4"]'))).toContain('Shortest essay');
    const fills = Array.from(host.querySelectorAll('.overview-bar__fill')) as HTMLElement[];
    expect(fills.every((f) => f.style.width === '0%')).toBeTrue();
  });

  it('empty or odd input never breaks: no bars says so, an unknown sentence is shown as text', () => {
    render([], ['Something new']);
    expect(text(host.querySelector('[data-card="issues"]'))).toContain('No issues to show yet.');
    expect(text(host.querySelector('[data-tile="text-0"]'))).toContain('Something new');
    render(null, null);
    expect(host.querySelectorAll('.overview-tile').length).toBe(0);
  });
});

describe('essay analysis overview helpers', () => {
  it('maps each issue to the category its number comes from, using the shared palette', () => {
    expect(issueBars(ISSUES).map((b) => b.color)).toEqual([CATEGORY_TONES.GRAMMAR.edge, CATEGORY_TONES.ORGANIZATION.edge,
      CATEGORY_TONES.CONTENT.edge, CATEGORY_TONES.ORGANIZATION.edge, CATEGORY_TONES.VOCABULARY.edge]);
    expect(issueBars([{ label: 'Unknown', pctText: 'abc' }])[0]).toEqual(jasmine.objectContaining({ percent: 0, pctText: 'abc', color: 'var(--color-primary)' }));
    expect(issueBars([{ label: 'Grammar and punctuation errors', pctText: '140%' }])[0].percent).toBe(100);
  });

  it('keeps the original sentence on every tile', () => {
    for (const tile of trendTiles(LOADED_TRENDS)) expect(LOADED_TRENDS).toContain(tile.text);
  });
});
