import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportColumnChart } from './report-column-chart';
import { columnChartGeometry } from './report-chart-geometry';

const BANDS = [
  { label: '0-49', value: 0 }, { label: '50-59', value: 1 }, { label: '60-69', value: 2 },
  { label: '70-79', value: 0 }, { label: '80-89', value: 4 }, { label: '90-100', value: 1 }
];

describe('ReportColumnChart', () => {
  let fixture: ComponentFixture<ReportColumnChart>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReportColumnChart] }).compileComponents();
    fixture = TestBed.createComponent(ReportColumnChart);
    host = fixture.nativeElement;
  });

  const render = (inputs: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  };

  it('renders one bar per band with a responsive viewBox and an accessible name', () => {
    render({ points: BANDS, ariaLabel: 'Score distribution', valueName: 'submissions' });
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('Score distribution');
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
    expect(svg.getAttribute('width')).toBeNull();
    expect(host.querySelectorAll('path.report-column-chart__bar').length).toBe(6);
    expect(svg.textContent).toContain('80-89');
  });

  it('gives screen readers a table with every value', () => {
    render({ points: BANDS, ariaLabel: 'Score distribution', valueName: 'submissions' });
    const table = host.querySelector('table.sr-only')!;
    expect(table).not.toBeNull();
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map((c) => c.textContent!.trim()).join(' '));
    expect(rows).toEqual(['0-49 0', '50-59 1', '60-69 2', '70-79 0', '80-89 4', '90-100 1']);
    expect(table.querySelector('caption')!.textContent).toContain('Score distribution');
  });

  it('hides the chart and explains why when the data is too small', () => {
    render({ points: BANDS, ariaLabel: 'Score distribution', hiddenReason: 'Not enough scored submissions to show a fair distribution.' });
    expect(host.querySelector('svg')).toBeNull();
    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('Not enough scored submissions to show a fair distribution.');
  });

  it('uses theme colours and no hard-coded font family', () => {
    render({ points: BANDS, ariaLabel: 'Score distribution' });
    expect(host.innerHTML).not.toMatch(/font-family/i);
    const bar = host.querySelector('path.report-column-chart__bar')!;
    expect(bar.getAttribute('fill')).toBe('var(--color-primary)');
  });

  it('thins axis labels when there are many points but keeps every value in the table', () => {
    const days = Array.from({ length: 40 }, (_, i) => ({ label: `D${i}`, value: i % 3 }));
    render({ points: days, ariaLabel: 'Submissions over time' });
    expect(host.querySelectorAll('text.report-column-chart__label').length).toBeLessThanOrEqual(10);
    expect(host.querySelectorAll('table tbody tr').length).toBe(40);
  });
});

describe('columnChartGeometry', () => {
  it('scales bars to the largest value and keeps zero bars visible as a baseline', () => {
    const g = columnChartGeometry(BANDS, { width: 600, height: 240 });
    expect(g.bars.length).toBe(6);
    const tallest = g.bars.reduce((a, b) => (b.height > a.height ? b : a));
    expect(tallest.label).toBe('80-89');
    expect(g.bars[0].height).toBe(0);
    expect(g.bars.every((b) => b.x >= 0 && b.x + b.width <= 600)).toBeTrue();
    expect(g.maxValue).toBe(4);
  });

  it('handles an all-zero or empty series without dividing by zero', () => {
    expect(columnChartGeometry([{ label: 'a', value: 0 }], { width: 600, height: 240 }).bars[0].height).toBe(0);
    expect(columnChartGeometry([], { width: 600, height: 240 }).bars).toEqual([]);
  });
});
