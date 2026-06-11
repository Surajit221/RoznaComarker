// worksheet-export.util.ts
// Export utilities for the WorksheetDocument renderer.
// Wraps the existing pdf-export.util.ts so all worksheet export logic
// lives in one place.

import { downloadPdfFromElement } from './pdf-export.util';
import type { WorksheetDocument } from '../models/worksheet-document.model';

/** Root element ID stamped on the renderer — must match WorksheetRendererComponent. */
const RENDER_ROOT_ID = 'worksheet-render-root';

/**
 * Captures the rendered WorksheetDocument as an A4 PDF and triggers download.
 * Requires the WorksheetRendererComponent to be mounted in the DOM.
 */
export async function exportWorksheetToPdf(worksheet: WorksheetDocument): Promise<void> {
  const element = document.getElementById(RENDER_ROOT_ID);
  if (!element) {
    throw new Error(
      'Worksheet render element not found. Ensure WorksheetRendererComponent is mounted.'
    );
  }

  const safeName = worksheet.meta.title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 60)
    .toLowerCase();

  await downloadPdfFromElement(element, {
    fileName: `worksheet-${safeName}.pdf`,
    scale: 2,
    pageWidthPx: 794,
    backgroundColor: '#ffffff',
  });
}

/**
 * Exports the rendered worksheet as a self-contained HTML string.
 * Includes all computed CSS from loaded stylesheets so the output is portable.
 */
export function exportWorksheetToHtml(worksheet: WorksheetDocument): string {
  const element = document.getElementById(RENDER_ROOT_ID);
  if (!element) {
    throw new Error('Worksheet render element not found.');
  }

  // Collect all CSS rules that can be read without CORS errors
  const allStyles = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText);
      } catch {
        return []; // cross-origin stylesheets throw SecurityError — skip
      }
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${worksheet.meta.language ?? 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${worksheet.meta.title}</title>
  <style>
    body { margin: 0; padding: 24px; background: #f0f0f0; }
    ${allStyles}
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`;
}

/**
 * Opens the browser print dialog.
 * The .no-print CSS class (in worksheet.css) hides action buttons during printing.
 */
export function printWorksheet(): void {
  window.print();
}
