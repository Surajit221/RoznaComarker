import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';

import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, browserTimeZone, type AssignmentReport } from '../../../api/assignment-report-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';
import { PdfApiService } from '../../../api/pdf-api.service';

function report(overrides: Partial<AssignmentReport> = {}): AssignmentReport {
  const base: AssignmentReport = {
    version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
    assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: '2026-11-20T00:00:00.000Z', writingType: 'Persuasive' },
    counts: { total: 5, bySource: { class: 3, guest: 1, teacherUpload: 1 }, scored: 3, inProgress: 1, notScored: 1, reviewed: 1, late: 1, skippedRows: 0, capped: false },
    scores: { average: 68.7, median: 66, highest: 85, lowest: 55, onTrack: 1, needsRevision: 1, needsAttention: 1, needsRevisionPct: 67, needsAttentionPct: 33, reviewedPct: 20,
      bands: [['0-49', 0, 49, 0], ['50-59', 50, 59, 1], ['60-69', 60, 69, 1], ['70-79', 70, 79, 0], ['80-89', 80, 89, 1], ['90-100', 90, 100, 0]]
        .map(([key, min, max, count]) => ({ key: key as string, label: key as string, min: min as number, max: max as number, count: count as number })) },
    rubric: { kind: 'builtin', strongestKey: 'CONTENT', weakestKey: 'GRAMMAR', criteria: [
      { key: 'CONTENT', label: 'Content', averagePct: 80, count: 3 }, { key: 'GRAMMAR', label: 'Grammar', averagePct: 60, count: 3 },
      { key: 'MECHANICS', label: 'Mechanics', averagePct: 70, count: 3 }] },
    errors: { basis: 'ai_analysis', total: 7, symbolTotal: 7, submissionsWithCorrections: 2, categories: [
      { key: 'CONTENT', label: 'Content', color: null, count: 0, pct: 0 }, { key: 'ORGANIZATION', label: 'Organization', color: null, count: 0, pct: 0 },
      { key: 'GRAMMAR', label: 'Grammar', color: null, count: 4, pct: 57 }, { key: 'VOCABULARY', label: 'Vocabulary', color: null, count: 1, pct: 14 },
      { key: 'MECHANICS', label: 'Mechanics', color: null, count: 2, pct: 29 }],
      symbols: [{ symbol: 'AGR', label: 'Agreement', category: 'GRAMMAR', count: 3, pct: 43 }] },
    timeline: { granularity: 'day', points: [{ date: '2026-11-10', count: 1 }, { date: '2026-11-11', count: 0 }, { date: '2026-11-12', count: 4 }] },
    students: [
      { submissionId: 's1', name: 'Ana Ray', source: 'class', score: 85, band: 'on_track', assessment: 'scored', notScoredReason: null, reviewed: true,
        topIssue: { symbol: 'SP', label: 'Spelling', count: 2 }, submittedAt: '2026-11-10T09:00:00.000Z', isLate: false, draftNumber: 1, needsAttention: false, attentionReasons: [] },
      { submissionId: 's2', name: 'Gus Guest', source: 'guest', score: 55, band: 'needs_attention', assessment: 'scored', notScoredReason: null, reviewed: false,
        topIssue: null, submittedAt: '2026-11-12T08:00:00.000Z', isLate: false, draftNumber: 1, needsAttention: true, attentionReasons: ['LOW_SCORE'] },
      { submissionId: 's3', name: 'Uma Upload', source: 'teacher_upload', score: 66, band: 'needs_revision', assessment: 'scored', notScoredReason: null, reviewed: false,
        topIssue: null, submittedAt: '2026-11-12T09:00:00.000Z', isLate: true, draftNumber: 1, needsAttention: false, attentionReasons: [] },
      { submissionId: 's4', name: 'Fay Failed', source: 'class', score: null, band: null, assessment: 'not_scored', notScoredReason: 'FAILED', reviewed: false,
        topIssue: null, submittedAt: '2026-11-12T10:00:00.000Z', isLate: false, draftNumber: 1, needsAttention: true, attentionReasons: ['NOT_SCORED'] },
      { submissionId: 's5', name: 'Pat Pending', source: 'class', score: null, band: null, assessment: 'in_progress', notScoredReason: null, reviewed: false,
        topIssue: null, submittedAt: '2026-11-12T11:00:00.000Z', isLate: false, draftNumber: 1, needsAttention: false, attentionReasons: [] }],
    insights: [{ code: 'AVERAGE', text: 'The average score is 68.7% across 3 scored submissions.' },
      { code: 'TOP_ERROR_CATEGORY', text: 'Grammar errors are the most common issue (57% of 7 corrections).' }],
    smallData: { distributionHidden: false, timelineHidden: false }
  };
  return { ...base, ...overrides };
}

describe('AssignmentReportPage', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let api: jasmine.SpyObj<AssignmentReportApiService>;
  let host: HTMLElement;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport']);
    await TestBed.configureTestingModule({
      imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api },
        { provide: PdfApiService, useValue: jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']) }]
    }).compileComponents();
  });

  async function open(result: Promise<AssignmentReport>) {
    api.getReport.and.returnValue(result);
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const text = () => host.textContent!.replace(/\s+/g, ' ');
  const httpError = (status: number) => Promise.reject(new HttpErrorResponse({ status, error: { message: 'RAW SERVER TEXT' } }));

  it('shows a loading skeleton while the report loads, with the browser time zone in the request', async () => {
    let resolve!: (r: AssignmentReport) => void;
    api.getReport.and.returnValue(new Promise((r) => (resolve = r)));
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges();
    expect(api.getReport).toHaveBeenCalledOnceWith('assignment-1', browserTimeZone());
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('.assignment-report__skeleton')).not.toBeNull();
    resolve(report());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.assignment-report__skeleton')).toBeNull();
  });

  it('stays inside the teacher shell\'s single scroll container: positioned host, no second <main> landmark', async () => {
    await open(Promise.resolve(report()));
    // Visually hidden (sr-only) text is position:absolute. Without a positioned host it is placed against the whole page, stretches the
    // document and makes the window scroll too, taking the fixed sidebar and header with it.
    expect(getComputedStyle(host).position).toBe('relative');
    expect(host.querySelectorAll('.sr-only').length).toBeGreaterThan(0);
    // The layout already provides the page's <main>; a second one is a duplicate landmark.
    expect(host.querySelector('main')).toBeNull();
    expect(host.querySelector('.assignment-report')!.tagName).toBe('DIV');
  });

  it('renders the header, KPI cards, charts, rubric, errors note, insights and no PDF or summary button yet', async () => {
    await open(Promise.resolve(report()));
    const t = text();
    expect(host.querySelector('h1')!.textContent).toContain('Persuasive essay');
    expect(t).toContain('Writing 7B');
    expect(t).toContain('Nov 20, 2026');
    const kpis = Array.from(host.querySelectorAll('.assignment-report__kpi')).map((k) => Array.from(k.children).map((c) => c.textContent!.trim()).join(' '));
    for (const expected of ['Total submissions 5', 'Scored 3', 'Average 68.7%', 'Median 66%', 'Highest 85%', 'Lowest 55%', 'Needs revision 67%', 'Late 1', 'Not scored 1'])
      expect(kpis).toContain(jasmine.stringContaining(expected));
    expect(host.querySelector('app-report-column-chart[data-chart="distribution"] svg')).not.toBeNull();
    expect(host.querySelector('app-report-column-chart[data-chart="timeline"] svg')).not.toBeNull();
    const rubric = host.querySelector('[data-section="rubric"]')!.textContent!;
    expect(rubric).toContain('Strongest'); expect(rubric).toContain('Weakest');
    expect(t).toContain('Counts are from the AI analysis and may include items you removed.');
    expect(t).toContain('Grammar errors are the most common issue (57% of 7 corrections).');
    expect(t).toContain('Export PDF');            // Stage 3
    expect(t).not.toMatch(/Generate summary/i);   // Stage 4
    expect(t).not.toMatch(/Rozna|roznahub/i);
  });

  it('groups needs-attention students first and shows Not scored and In progress as labelled statuses, never 0', async () => {
    await open(Promise.resolve(report()));
    const rows = Array.from(host.querySelectorAll('table.assignment-report__table tbody tr'));
    const cells = rows.map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    const groupIndex = cells.findIndex((c) => c === 'Needs attention');
    expect(groupIndex).toBe(0);
    const attention = cells.slice(1, 3).join(' | ');
    expect(attention).toContain('Gus Guest'); expect(attention).toContain('Fay Failed');
    const fay = cells.find((c) => c.includes('Fay Failed'))!;
    expect(fay).toContain('Not scored'); expect(fay).not.toMatch(/\b0%?\b/);
    const pat = cells.find((c) => c.includes('Pat Pending'))!;
    expect(pat).toContain('In progress'); expect(pat).not.toMatch(/\b0%?\b/);
    const uma = cells.find((c) => c.includes('Uma Upload'))!;
    expect(uma).toContain('66%'); expect(uma).toContain('Late');
    expect(cells.find((c) => c.includes('Ana Ray'))).toContain('Reviewed');
  });

  it('sorts the table in the browser and keeps the attention group on top', async () => {
    await open(Promise.resolve(report()));
    const names = () => Array.from(host.querySelectorAll('table.assignment-report__table tbody tr td:first-child'))
      .map((td) => td.textContent!.trim()).filter((n) => n && n !== 'Needs attention' && n !== 'Other students');
    const scoreHeader = Array.from(host.querySelectorAll('th button')).find((b) => b.textContent!.includes('Score')) as HTMLButtonElement;
    scoreHeader.click(); fixture.detectChanges();
    expect(host.querySelector('th[aria-sort="ascending"]')).not.toBeNull();
    let order = names().map((n) => n.split(' ')[0]);
    expect(order.slice(0, 2)).toEqual(['Gus', 'Fay']);
    expect(order.slice(2)).toEqual(['Uma', 'Ana', 'Pat']);
    scoreHeader.click(); fixture.detectChanges();
    expect(host.querySelector('th[aria-sort="descending"]')).not.toBeNull();
    order = names().map((n) => n.split(' ')[0]);
    expect(order.slice(2)).toEqual(['Ana', 'Uma', 'Pat']);
  });

  it('filters the table with the search box', async () => {
    await open(Promise.resolve(report()));
    const input = host.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'uma'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    const rows = Array.from(host.querySelectorAll('table.assignment-report__table tbody tr')).map((r) => r.textContent!);
    expect(rows.some((r) => r.includes('Uma Upload'))).toBeTrue();
    expect(rows.some((r) => r.includes('Ana Ray'))).toBeFalse();
  });

  it('hides the distribution and trend when the data is small and says why', async () => {
    await open(Promise.resolve(report({ smallData: { distributionHidden: true, timelineHidden: true } })));
    expect(host.querySelector('app-report-column-chart[data-chart="distribution"] svg')).toBeNull();
    expect(host.querySelector('app-report-column-chart[data-chart="timeline"] svg')).toBeNull();
    expect(text()).toContain('Not enough scored submissions to show a fair distribution');
    expect(text()).toContain('Not enough submissions to show a trend');
  });

  it('shows a capped notice when only part of the submissions is included', async () => {
    const r = report(); r.counts = { ...r.counts, capped: true };
    await open(Promise.resolve(r));
    expect(host.querySelector('[role="status"].assignment-report__notice')!.textContent).toMatch(/only the first part of the submissions/i);
  });

  it('shows an empty state with no submissions, and a no-scores state when nothing is scored yet', async () => {
    const empty = report({ students: [], insights: [{ code: 'NO_SUBMISSIONS', text: 'No submissions yet. The report fills in as students submit.' }] });
    empty.counts = { ...empty.counts, total: 0, scored: 0, inProgress: 0, notScored: 0, late: 0, reviewed: 0, bySource: { class: 0, guest: 0, teacherUpload: 0 } };
    await open(Promise.resolve(empty));
    expect(text()).toContain('No submissions yet');
    expect(host.querySelector('table.assignment-report__table')).toBeNull();

    const unscored = report({ scores: { ...report().scores, average: null, median: null, highest: null, lowest: null, needsRevisionPct: null } });
    unscored.counts = { ...unscored.counts, scored: 0 };
    await open(Promise.resolve(unscored));
    expect(text()).toContain('No scored submissions yet');
    expect(Array.from(host.querySelectorAll('.assignment-report__kpi')).find((k) => k.textContent!.includes('Average'))!.textContent).toContain('—');
  });

  const failures: [number, string][] = [[404, 'Report not found'], [409, 'Reports are only available for essay assignments'],
    [429, 'Too many requests, try again in a minute'], [503, 'Too many requests, try again in a minute']];
  for (const [status, message] of failures) {
    it(`maps HTTP ${status} to "${message}" without the raw server message`, async () => {
      await open(httpError(status));
      expect(host.querySelector('[role="alert"]')!.textContent).toContain(message);
      expect(text()).not.toContain('RAW SERVER TEXT');
    });
  }

  it('shows a generic error with a working retry', async () => {
    await open(httpError(500));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('The report could not be loaded');
    expect(text()).not.toContain('RAW SERVER TEXT');
    api.getReport.and.returnValue(Promise.resolve(report()));
    (Array.from(host.querySelectorAll('button')).find((b) => b.textContent!.includes('Try again')) as HTMLButtonElement).click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(api.getReport).toHaveBeenCalledTimes(2);
    expect(host.querySelector('h1')!.textContent).toContain('Persuasive essay');
  });
});
