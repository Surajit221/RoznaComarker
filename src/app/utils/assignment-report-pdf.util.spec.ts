import { HttpErrorResponse } from '@angular/common/http';

import { assignmentReportPdfFilename, filenameFromContentDisposition, reportPdfErrorMessage, slugifyReportTitle } from './assignment-report-pdf.util';

describe('assignment report PDF helpers', () => {
  const NOW = new Date('2026-11-14T20:30:00.000Z');

  it('builds the same filename as the server: Rubrilo-report-<slug>-<YYYY-MM-DD>.pdf in the teacher\'s zone', () => {
    expect(assignmentReportPdfFilename('Persuasive essay', NOW, 'Asia/Dhaka')).toBe('Rubrilo-report-persuasive-essay-2026-11-15.pdf');
    expect(assignmentReportPdfFilename('Persuasive essay', NOW, 'UTC')).toBe('Rubrilo-report-persuasive-essay-2026-11-14.pdf');
    expect(assignmentReportPdfFilename('"quoted"; filename=evil.exe', NOW, 'Not/AZone')).toBe('Rubrilo-report-quoted-filename-evil-exe-2026-11-14.pdf');
  });

  it('slugifies exactly like the server (same cases as the backend test)', () => {
    expect(slugifyReportTitle('../../etc/passwd')).toBe('etc-passwd');
    expect(slugifyReportTitle('C:\\Windows\\system32')).toBe('c-windows-system32');
    expect(slugifyReportTitle('Café crème: naïve "essay"')).toBe('cafe-creme-naive-essay');
    expect(slugifyReportTitle('日本語のタイトル')).toBe('assignment');
    expect(slugifyReportTitle('')).toBe('assignment');
    expect(slugifyReportTitle(null)).toBe('assignment');
    expect(slugifyReportTitle('a'.repeat(200)).length).toBe(60);
    expect(slugifyReportTitle('Essay\r\nContent-Type: x')).toBe('essay-content-type-x');
    expect(slugifyReportTitle('Persuasive essay: Should school start later? (Term 2 final draft)')).toBe('persuasive-essay-should-school-start-later-term-2-final');
  });

  it('reads a safe filename from Content-Disposition and rejects anything else', () => {
    expect(filenameFromContentDisposition('attachment; filename="Rubrilo-report-essay-2026-11-14.pdf"')).toBe('Rubrilo-report-essay-2026-11-14.pdf');
    expect(filenameFromContentDisposition('attachment; filename=Rubrilo-report-a-2026-11-14.pdf')).toBe('Rubrilo-report-a-2026-11-14.pdf');
    for (const bad of [null, '', 'attachment', 'attachment; filename="../../evil.pdf"', 'attachment; filename="x.exe"', 'attachment; filename="a b.pdf"',
      `attachment; filename="${'a'.repeat(200)}.pdf"`]) expect(filenameFromContentDisposition(bad)).toBeNull();
  });

  it('maps errors to fixed messages and never to the server text', () => {
    const err = (status: number) => new HttpErrorResponse({ status, error: new Blob(['{"message":"RAW SERVER TEXT"}']) });
    expect(reportPdfErrorMessage(err(503))).toBe('The PDF service is busy, please try again in a minute');
    expect(reportPdfErrorMessage(err(429))).toBe('The PDF service is busy, please try again in a minute');
    expect(reportPdfErrorMessage(err(404))).toBe('Report not found');
    expect(reportPdfErrorMessage(err(409))).toBe('Reports are only available for essay assignments');
    expect(reportPdfErrorMessage(err(504))).toBe('Creating the PDF took too long. Please try again in a moment.');
    for (const e of [err(500), err(413), err(0), new Error('RAW'), null]) expect(reportPdfErrorMessage(e)).toBe('The PDF could not be created. Please try again.');
  });
});
