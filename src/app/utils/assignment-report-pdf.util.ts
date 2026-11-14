import { HttpErrorResponse } from '@angular/common/http';

/**
 * Helpers for the assignment report PDF download. The filename rules mirror the backend (src/pdf/assignmentReportTemplate.js
 * slugifyTitle / reportPdfFilename): the browser cannot read Content-Disposition on a cross-origin response unless the server
 * exposes it, so the page builds the same name itself when the header is not readable.
 */
export function slugifyReportTitle(title: unknown): string {
  let slug = String(title ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length > 60) {
    const cut = slug.slice(0, 61);
    const boundary = cut.lastIndexOf('-');
    slug = boundary >= 30 ? cut.slice(0, boundary) : slug.slice(0, 60);
  }
  return slug.replace(/-+$/g, '') || 'assignment';
}

function dayIn(date: Date, timeZone: string): string {
  const format = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  let day: string;
  try { day = format(timeZone); } catch { day = format('UTC'); }
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : date.toISOString().slice(0, 10);
}

/** Rubrilo-report-<slug>-<YYYY-MM-DD>.pdf, the date in the given zone (UTC when the zone is not valid). */
export function assignmentReportPdfFilename(title: unknown, date: Date = new Date(), timeZone = 'UTC'): string {
  return `Rubrilo-report-${slugifyReportTitle(title)}-${dayIn(date, timeZone)}.pdf`;
}

/** The filename from a Content-Disposition header, only when it is a plain safe PDF name; otherwise null. */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(String(header || ''));
  const name = match ? match[1].trim() : '';
  return /^[A-Za-z0-9._-]{1,150}\.pdf$/.test(name) && !name.includes('..') ? name : null;
}

/** A fixed message for a failed PDF download. The server's own text is never shown. */
export function reportPdfErrorMessage(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 503 || status === 429) return 'The PDF service is busy, please try again in a minute';
  if (status === 404) return 'Report not found';
  if (status === 409) return 'Reports are only available for essay assignments';
  if (status === 504) return 'Creating the PDF took too long. Please try again in a moment.';
  return 'The PDF could not be created. Please try again.';
}
