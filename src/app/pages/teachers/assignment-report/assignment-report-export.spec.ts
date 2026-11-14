import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';

import { AssignmentReportPage } from './assignment-report';
import { AssignmentReportApiService, browserTimeZone, type AssignmentReport } from '../../../api/assignment-report-api.service';
import { PdfApiService } from '../../../api/pdf-api.service';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';

// "Export PDF" on the report page (Stage 3): idle, generating (disabled, spinner, text), success (file saved), error (fixed messages).
const REPORT = {
  version: 'assignment-report-v1', generatedAt: '2026-11-14T10:00:00.000Z', timeZone: 'UTC',
  assignment: { id: 'assignment-1', title: 'Persuasive essay', className: 'Writing 7B', deadline: null, writingType: null },
  counts: { total: 1, bySource: { class: 1, guest: 0, teacherUpload: 0 }, scored: 1, inProgress: 0, notScored: 0, reviewed: 0, late: 0, skippedRows: 0, capped: false },
  scores: { average: 80, median: 80, highest: 80, lowest: 80, onTrack: 1, needsRevision: 0, needsAttention: 0, needsRevisionPct: 0, needsAttentionPct: 0, reviewedPct: 0, bands: [] },
  rubric: { kind: 'builtin', criteria: [], strongestKey: null, weakestKey: null },
  errors: { basis: 'ai_analysis', total: 0, symbolTotal: 0, submissionsWithCorrections: 0, categories: [], symbols: [] },
  timeline: { granularity: 'day', points: [] }, students: [], insights: [], smallData: { distributionHidden: true, timelineHidden: true }
} as unknown as AssignmentReport;

describe('AssignmentReportPage Export PDF', () => {
  let fixture: ComponentFixture<AssignmentReportPage>;
  let host: HTMLElement;
  let pdfApi: jasmine.SpyObj<PdfApiService>;
  let save: jasmine.Spy;

  beforeEach(async () => {
    const api = jasmine.createSpyObj<AssignmentReportApiService>('AssignmentReportApiService', ['getReport']);
    api.getReport.and.resolveTo(REPORT);
    pdfApi = jasmine.createSpyObj<PdfApiService>('PdfApiService', ['downloadAssignmentReportPdf']);
    await TestBed.configureTestingModule({
      imports: [AssignmentReportPage],
      providers: [...routedComponentProviders({ assignmentId: 'assignment-1' }), { provide: AssignmentReportApiService, useValue: api }, { provide: PdfApiService, useValue: pdfApi }]
    }).compileComponents();
    fixture = TestBed.createComponent(AssignmentReportPage);
    host = fixture.nativeElement;
    save = spyOn(fixture.componentInstance, 'saveFile');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const button = () => host.querySelector('button.assignment-report__export') as HTMLButtonElement;
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };

  it('sits next to Back once the report is loaded', () => {
    const topbar = host.querySelector('.assignment-report__topbar')!;
    expect(topbar.querySelector('.assignment-report__back')).not.toBeNull();
    expect(topbar.contains(button())).toBeTrue();
    expect(button().textContent).toContain('Export PDF');
    expect(button().disabled).toBeFalse();
  });

  it('shows a disabled generating state with a spinner, ignores double clicks, then saves with the server filename', async () => {
    let resolve!: (v: { blob: Blob; filename: string | null }) => void;
    pdfApi.downloadAssignmentReportPdf.and.returnValue(new Promise((r) => (resolve = r)));
    button().click(); button().click();
    fixture.detectChanges();
    expect(pdfApi.downloadAssignmentReportPdf).toHaveBeenCalledOnceWith('assignment-1', browserTimeZone());
    expect(button().disabled).toBeTrue();
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().textContent).toContain('Preparing PDF');
    expect(button().querySelector('.bx-spin')).not.toBeNull();
    button().click();
    expect(pdfApi.downloadAssignmentReportPdf).toHaveBeenCalledTimes(1);
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    resolve({ blob, filename: 'Rubrilo-report-persuasive-essay-2026-11-14.pdf' });
    await settle();
    expect(save).toHaveBeenCalledOnceWith(blob, 'Rubrilo-report-persuasive-essay-2026-11-14.pdf');
    expect(button().disabled).toBeFalse();
    expect(button().textContent).toContain('Export PDF');
    expect(host.querySelector('.assignment-report__pdf-status')!.textContent).toContain('PDF downloaded');
  });

  it('falls back to a safe filename built the same way as the server when the header is not readable', async () => {
    pdfApi.downloadAssignmentReportPdf.and.resolveTo({ blob: new Blob(['%PDF']), filename: null });
    button().click();
    await settle();
    expect(save.calls.mostRecent().args[1]).toMatch(/^Rubrilo-report-persuasive-essay-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  const failures: [number, string][] = [[503, 'The PDF service is busy, please try again in a minute'], [429, 'The PDF service is busy, please try again in a minute'],
    [404, 'Report not found'], [409, 'Reports are only available for essay assignments'], [500, 'The PDF could not be created. Please try again.']];
  for (const [status, message] of failures) {
    it(`shows "${message}" for HTTP ${status}, never the server text, and allows another try`, async () => {
      pdfApi.downloadAssignmentReportPdf.and.rejectWith(new HttpErrorResponse({ status, error: new Blob(['{"message":"RAW SERVER TEXT"}']) }));
      button().click();
      await settle();
      const alert = host.querySelector('.assignment-report__pdf-status[role="alert"]')!;
      expect(alert.textContent).toContain(message);
      expect(host.textContent).not.toContain('RAW SERVER TEXT');
      expect(save).not.toHaveBeenCalled();
      expect(button().disabled).toBeFalse();
      pdfApi.downloadAssignmentReportPdf.and.resolveTo({ blob: new Blob(['%PDF']), filename: null });
      button().click();
      await settle();
      expect(pdfApi.downloadAssignmentReportPdf).toHaveBeenCalledTimes(2);
      expect(host.querySelector('.assignment-report__pdf-status[role="alert"]')).toBeNull();
    });
  }
});
