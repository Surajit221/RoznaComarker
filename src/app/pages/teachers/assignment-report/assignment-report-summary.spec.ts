import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';

import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, type AssignmentReport, type ReportSummaryBlock, type SummaryGenerateResult } from '../../../api/assignment-report-api.service';
import { PdfApiService } from '../../../api/pdf-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';

// AI summary card (Stage 4): hidden when off; not enough data / none / generating / ready / out of date / fallback / error / limit reached.
const CURRENT = { headline: 'The class average is 68.7% across 3 scored submissions.', findings: ['Grammar is the most common issue.', 'Content is the strongest area.', 'Most work needs revision.'],
  nextSteps: ['Teach subject-verb agreement.', 'Model how to use evidence.'], caution: 'Counts come from the AI analysis.', generatedAt: '2026-11-14T10:00:00.000Z',
  label: 'AI-generated summary. Please review before sharing.' };
function reportWith(summary: ReportSummaryBlock | undefined): AssignmentReport {
  return {
    version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
    assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: null, writingType: null },
    counts: { total: 3, bySource: { class: 3, guest: 0, teacherUpload: 0 }, scored: 3, inProgress: 0, notScored: 0, reviewed: 0, late: 0, skippedRows: 0, capped: false },
    scores: { average: 68.7, median: 66, highest: 85, lowest: 55, onTrack: 1, needsRevision: 1, needsAttention: 1, needsRevisionPct: 67, needsAttentionPct: 33, reviewedPct: 0, bands: [] },
    rubric: { kind: 'builtin', criteria: [], strongestKey: null, weakestKey: null },
    errors: { basis: 'ai_analysis', total: 0, symbolTotal: 0, submissionsWithCorrections: 0, categories: [], symbols: [] },
    timeline: { granularity: 'day', points: [] }, students: [],
    insights: [{ code: 'AVERAGE', text: 'The average score is 68.7% across 3 scored submissions.' }],
    smallData: { distributionHidden: true, timelineHidden: true }, summary
  };
}
const enabled = (patch: Partial<ReportSummaryBlock>): ReportSummaryBlock =>
  ({ enabled: true, state: 'none', minimumScored: 3, dailyLimit: 5, remainingToday: 5, current: null, ...patch } as ReportSummaryBlock);

describe('AssignmentReportPage AI summary', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let host: HTMLElement;
  let api: jasmine.SpyObj<AssignmentReportApiService>;

  async function open(summary: ReportSummaryBlock | undefined) {
    api.getReport.and.resolveTo(reportWith(summary));
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  beforeEach(async () => {
    api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport', 'generateSummary']);
    await TestBed.configureTestingModule({
      imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api },
        { provide: PdfApiService, useValue: jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']) }]
    }).compileComponents();
  });
  const card = () => host.querySelector('[data-section="summary"]');
  const button = () => card()?.querySelector('button.assignment-report__summary-button') as HTMLButtonElement | null;
  const text = () => card()!.textContent!.replace(/\s+/g, ' ');
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  it('is not shown at all when the feature is off (or the field is missing)', async () => {
    await open({ enabled: false, state: 'disabled' });
    expect(card()).toBeNull();
    expect(host.textContent).not.toMatch(/Generate summary/);
    await open(undefined);
    expect(card()).toBeNull();
  });

  it('not enough data: explains the minimum, no button', async () => {
    await open(enabled({ state: 'not_enough_data' }));
    expect(text()).toContain('A summary needs at least 3 scored submissions.');
    expect(button()).toBeNull();
  });

  it('none -> generating (disabled, spinner, no double request) -> ready with the label and no button', async () => {
    await open(enabled({ state: 'none' }));
    expect(button()!.textContent).toContain('Generate summary');
    let resolve!: (v: SummaryGenerateResult) => void;
    api.generateSummary.and.returnValue(new Promise((r) => (resolve = r)));
    button()!.click(); button()!.click();
    fixture.detectChanges();
    expect(api.generateSummary).toHaveBeenCalledOnceWith('assignment-1');
    expect(button()!.disabled).toBeTrue();
    expect(button()!.textContent).toContain('Writing summary');
    expect(button()!.querySelector('.bx-spin')).not.toBeNull();
    resolve({ source: 'ai', cached: false, state: 'fresh', current: CURRENT, remainingToday: 4 });
    await settle();
    expect(text()).toContain('AI-generated summary. Please review before sharing.');
    expect(text()).toContain(CURRENT.headline);
    expect(text()).toContain('Teach subject-verb agreement.');
    expect(text()).toContain('Counts come from the AI analysis.');
    expect(button()).toBeNull();
  });

  it('out of date: shows the old summary marked out of date with a Regenerate button', async () => {
    await open(enabled({ state: 'stale', current: CURRENT, remainingToday: 3 }));
    expect(text()).toContain('Out of date');
    expect(text()).toContain(CURRENT.headline);
    expect(button()!.textContent).toContain('Regenerate');
    api.generateSummary.and.resolveTo({ source: 'ai', cached: false, state: 'fresh', current: { ...CURRENT, headline: 'A newer summary headline.' }, remainingToday: 2 });
    button()!.click();
    await settle();
    expect(text()).toContain('A newer summary headline.');
    expect(text()).not.toContain('Out of date');
  });

  it('fallback: a fixed note and the insights stay; nothing raw', async () => {
    await open(enabled({ state: 'none' }));
    api.generateSummary.and.resolveTo({ source: 'fallback', reason: 'AI_UNAVAILABLE', insights: [], state: 'none', current: null, remainingToday: 4 });
    button()!.click();
    await settle();
    expect(text()).toContain('The AI summary is not available right now. The insights below are built directly from your data.');
    expect(host.textContent).toContain('The average score is 68.7% across 3 scored submissions.');
    expect(host.textContent).not.toContain('AI_UNAVAILABLE');
    expect(button()!.disabled).toBeFalse();
  });

  it('limit reached: the daily-limit message and a disabled button; also when the report says 0 remain', async () => {
    await open(enabled({ state: 'none' }));
    api.generateSummary.and.rejectWith(new HttpErrorResponse({ status: 429, error: { code: 'SUMMARY_DAILY_LIMIT', message: 'RAW SERVER TEXT' } }));
    button()!.click();
    await settle();
    expect(text()).toContain('You have reached today\'s summary limit for this assignment. Please try again tomorrow.');
    expect(button()!.disabled).toBeTrue();
    expect(host.textContent).not.toContain('RAW SERVER TEXT');
    await open(enabled({ state: 'stale', current: CURRENT, remainingToday: 0 }));
    expect(button()!.disabled).toBeTrue();
    expect(button()!.textContent).toContain('Daily limit reached');
  });

  const errors: [number, string | undefined, string][] = [
    [429, 'RATE_LIMITED', 'Too many requests, try again in a minute'],
    [422, 'SUMMARY_NOT_ENOUGH_DATA', 'A summary needs at least 3 scored submissions.'],
    [404, 'SUMMARY_DISABLED', 'Summaries are not available for this report.'],
    [500, undefined, 'The summary could not be created. Please try again.']];
  for (const [status, code, message] of errors) {
    it(`error ${status}${code ? ` ${code}` : ''}: "${message}", never the server text, retry allowed`, async () => {
      await open(enabled({ state: 'none' }));
      api.generateSummary.and.rejectWith(new HttpErrorResponse({ status, error: { code, message: 'RAW SERVER TEXT' } }));
      button()!.click();
      await settle();
      expect(card()!.querySelector('[role="alert"]')!.textContent).toContain(message);
      expect(host.textContent).not.toContain('RAW SERVER TEXT');
      if (status !== 422) expect(button()!.disabled).toBeFalse();
    });
  }
});
