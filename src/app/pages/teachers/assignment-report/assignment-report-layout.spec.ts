// The assignment report layout: balanced two-column rows (score distribution | rubric, insights | submissions over time), insights as
// highlighted callouts, a short summary above the timeline (busiest day, late), then one "Common errors" card, then a compact students
// table with search and a status filter. Synthetic data only.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, type AssignmentReport } from '../../../api/assignment-report-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';
import { PdfApiService } from '../../../api/pdf-api.service';

const student = (submissionId: string, name: string, over: Partial<AssignmentReport['students'][number]> = {}): AssignmentReport['students'][number] => ({
  submissionId, name, source: 'class', score: 70, band: 'needs_revision', assessment: 'scored', notScoredReason: null, reviewed: false, topIssue: null,
  submittedAt: '2026-11-12T09:00:00.000Z', isLate: false, draftNumber: 1, needsAttention: false, attentionReasons: [], ...over });
function report(over: Partial<AssignmentReport> = {}): AssignmentReport {
  return {
    version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
    assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: null, writingType: null },
    counts: { total: 5, bySource: { class: 5, guest: 0, teacherUpload: 0 }, scored: 4, inProgress: 0, notScored: 1, reviewed: 1, late: 1, skippedRows: 0, capped: false },
    scores: { average: 70, median: 70, highest: 85, lowest: 55, onTrack: 1, needsRevision: 2, needsAttention: 1, needsRevisionPct: 50, needsAttentionPct: 25, reviewedPct: 20,
      bands: [{ key: '50-59', label: '50-59', min: 50, max: 59, count: 1 }, { key: '60-69', label: '60-69', min: 60, max: 69, count: 2 }, { key: '80-89', label: '80-89', min: 80, max: 89, count: 1 }] },
    rubric: { kind: 'builtin', strongestKey: 'CONTENT', weakestKey: 'GRAMMAR', criteria: [{ key: 'CONTENT', label: 'Content', averagePct: 80, count: 4 },
      { key: 'GRAMMAR', label: 'Grammar', averagePct: 60, count: 4 }] },
    errors: { basis: 'ai_analysis', total: 3, symbolTotal: 3, submissionsWithCorrections: 2, categories: [{ key: 'GRAMMAR', label: 'Grammar', color: null, count: 3, pct: 100 }],
      symbols: [{ symbol: 'VF', label: 'Verb Form', category: 'GRAMMAR', count: 3, pct: 100 }] },
    timeline: { granularity: 'day', points: [{ date: '2026-11-10', count: 1 }, { date: '2026-11-11', count: 0 }, { date: '2026-11-12', count: 4 }] },
    students: [student('s1', 'Ana Ray', { reviewed: true, band: 'on_track', score: 85 }), student('s2', 'Gus Guest', { needsAttention: true, band: 'needs_attention', score: 55 }),
      student('s3', 'Uma Upload', { isLate: true }), student('s4', 'Fay Failed', { score: null, band: null, assessment: 'not_scored', notScoredReason: 'FAILED', needsAttention: true }),
      student('s5', 'Pat Plain')],
    insights: [{ code: 'AVERAGE', text: 'The average score is 70% across 4 scored submissions.' }, { code: 'LATE', text: '1 submission arrived late.' }],
    smallData: { distributionHidden: false, timelineHidden: false }, ...over
  };
}

describe('AssignmentReportPage: layout', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let host: HTMLElement;
  async function open(r: AssignmentReport) {
    const api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport']);
    api.getReport.and.resolveTo(r);
    await TestBed.configureTestingModule({ imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api },
        { provide: PdfApiService, useValue: jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']) }] }).compileComponents();
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const names = () => Array.from(host.querySelectorAll('table.assignment-report__table tbody .assignment-report__name')).map(text);
  const filter = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('[data-status-filter] button')).find(b => text(b).startsWith(label))!;

  it('balanced rows: score distribution | rubric, then insights | submissions over time, then Common errors, then Students', async () => {
    await open(report());
    const charts = host.querySelector('[data-row="charts"]')!, overview = host.querySelector('[data-row="overview"]')!;
    expect(Array.from(charts.children).map(c => c.getAttribute('data-section'))).toEqual(['distribution', 'rubric']);
    expect(Array.from(overview.children).map(c => c.getAttribute('data-section'))).toEqual(['insights', 'timeline']);
    const order = ['[data-row="charts"]', '[data-row="overview"]', '[data-section="common-errors"]', '[data-section="students"]'].map(s => host.querySelector(s)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('insights are highlighted callouts, one per insight, each with an icon and its text', async () => {
    await open(report());
    const callouts = Array.from(host.querySelectorAll<HTMLElement>('[data-section="insights"] [data-insight]'));
    expect(callouts.map(text)).toEqual(['The average score is 70% across 4 scored submissions.', '1 submission arrived late.']);
    for (const c of callouts) expect(c.querySelector('i[aria-hidden="true"]')).not.toBeNull();
  });

  it('without insights the timeline takes the whole row', async () => {
    await open(report({ insights: [] }));
    const overview = host.querySelector('[data-row="overview"]')!;
    expect(Array.from(overview.children).map(c => c.getAttribute('data-section'))).toEqual(['timeline']);
    expect(host.querySelector('[data-section="insights"]')).toBeNull();
  });

  it('submissions over time leads with a short summary: the busiest day and how many were late', async () => {
    await open(report());
    expect(text(host.querySelector('[data-timeline-busiest]'))).toBe('4 of 5 on Nov 12 (busiest day)');
    expect(text(host.querySelector('[data-timeline-late]'))).toBe('1 late');
    expect(host.querySelector('app-report-column-chart[data-chart="timeline"]')).not.toBeNull();
  });

  it('a hidden timeline (too little data) shows no summary', async () => {
    await open(report({ smallData: { distributionHidden: false, timelineHidden: true } }));
    expect(host.querySelector('[data-timeline-busiest]')).toBeNull();
  });

  it('weekly timelines name the week', async () => {
    await open(report({ timeline: { granularity: 'week', points: [{ date: '2026-11-09', count: 5 }] } }));
    expect(text(host.querySelector('[data-timeline-busiest]'))).toBe('5 of 5 in the week of Nov 9 (busiest week)');
  });

  it('students: a status filter with counts (pressed state), combined with search; the page resets to 1', async () => {
    await open(report());
    const group = host.querySelector('[data-status-filter]')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Filter students by status');
    expect(Array.from(group.querySelectorAll('button')).map(text)).toEqual(['All 5', 'Needs attention 2', 'Not reviewed 4', 'Late 1']);
    expect(filter('All').getAttribute('aria-pressed')).toBe('true');
    filter('Late').click(); fixture.detectChanges();
    expect(filter('Late').getAttribute('aria-pressed')).toBe('true');
    expect(filter('All').getAttribute('aria-pressed')).toBe('false');
    expect(names()).toEqual(['Uma Upload']);
    expect(text(host.querySelector('.assignment-report__result'))).toBe('Showing 1 of 5 students');
    filter('Needs attention').click(); fixture.detectChanges();
    expect(names().sort()).toEqual(['Fay Failed', 'Gus Guest']);
    fixture.componentInstance.onSearch('gus'); fixture.detectChanges();
    expect(names()).toEqual(['Gus Guest']);
    fixture.componentInstance.onSearch('nobody'); fixture.detectChanges();
    expect(text(host.querySelector('table.assignment-report__table tbody'))).toBe('No students match your search.');
    fixture.componentInstance.onSearch(''); filter('All').click(); fixture.detectChanges();
    expect(names().length).toBe(5);
  });

  it('the filter goes back to page 1', async () => {
    const many = Array.from({ length: 23 }, (_, i) => student(`m${i}`, `Student ${String(i).padStart(2, '0')}`, { isLate: i % 2 === 0 }));
    await open(report({ students: many, counts: { ...report().counts, total: 23 } }));
    fixture.componentInstance.goToPage(3); fixture.detectChanges();
    expect(fixture.componentInstance.currentPage()).toBe(3);
    filter('Late').click(); fixture.detectChanges();
    expect(fixture.componentInstance.currentPage()).toBe(1);
    expect(text(host.querySelector('.assignment-report__result'))).toBe('Showing 12 of 23 students');
  });
});
