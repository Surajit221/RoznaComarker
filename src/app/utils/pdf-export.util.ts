/**
 * Shared client-side PDF generation utility (Approach A: html2canvas + jsPDF).
 *
 * Used by:
 *   - Worksheet PDF (student + teacher)
 *   - Flashcard PDF  (student + teacher)
 *
 * Renders a DOM element to canvas, slices it into A4 pages, returns a Blob.
 * Cross-platform download is delegated to triggerBlobDownload (iOS / Android / desktop).
 *
 * NOTE: html2canvas and jspdf must be installed:
 *   npm install html2canvas jspdf
 */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { triggerBlobDownload } from './file-download.util';

export interface GeneratePdfOptions {
  /** Final filename (with .pdf extension). */
  fileName?: string;
  /** Canvas pixel scale. Higher = sharper but bigger file. */
  scale?: number;
  /** A4 width in CSS pixels at 96 DPI = 794px. Element width should match. */
  pageWidthPx?: number;
  /** Background color used by html2canvas if no element bg. */
  backgroundColor?: string;
  /** If true, also calls pdf.save(). Default: false. We download via Blob for iOS support. */
  saveDirectly?: boolean;
  /** PDF-only blocks that should not be cut when choosing canvas page boundaries. */
  pageBreakAvoidSelector?: string;
  /** PDF-only headings that should stay with the next protected block. */
  keepWithNextSelector?: string;
}

/**
 * Generate a PDF Blob from an in-DOM element.
 * The element MUST be rendered (in the DOM tree); html2canvas cannot capture
 * elements with display:none or visibility:hidden. Use position:absolute;
 * left:-9999px to keep it off-screen but visible to the renderer.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions = {}
): Promise<Blob> {
  const {
    scale = 2,
    pageWidthPx = 794,
    backgroundColor = '#ffffff',
    pageBreakAvoidSelector,
    keepWithNextSelector,
  } = options;

  // Wait for any pending fonts before rasterizing so the PDF matches the UI.
  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch {
    /* font API unavailable – ignore */
  }

  // Give the layout one frame to settle.
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor,
    windowWidth: pageWidthPx,
    logging: false,
    onclone: (clonedDoc: Document) => {
      // Force backgrounds, gradients and colored borders to render in the PDF.
      const all = clonedDoc.querySelectorAll<HTMLElement>('*');
      all.forEach((el) => {
        const s = el.style as any;
        s.webkitPrintColorAdjust = 'exact';
        s.printColorAdjust = 'exact';
        s.colorAdjust = 'exact';
      });
    },
  });

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();   // 210
  const pdfHeight = pdf.internal.pageSize.getHeight(); // 297

  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const cssPageHeight = pageWidthPx * (pdfHeight / pdfWidth);
  const rootRect = element.getBoundingClientRect();
  const protectedRanges = pageBreakAvoidSelector
    ? Array.from(element.querySelectorAll<HTMLElement>(pageBreakAvoidSelector)).map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top - rootRect.top, bottom: rect.bottom - rootRect.top };
      })
    : [];
  if (keepWithNextSelector) {
    for (const heading of Array.from(element.querySelectorAll<HTMLElement>(keepWithNextSelector))) {
      const next = heading.parentElement?.querySelector<HTMLElement>(pageBreakAvoidSelector || '');
      if (!next) continue;
      const headingRect = heading.getBoundingClientRect();
      const nextRect = next.getBoundingClientRect();
      protectedRanges.push({ top: headingRect.top - rootRect.top, bottom: nextRect.bottom - rootRect.top });
    }
  }

  const cssHeight = canvas.height / scale;
  const boundaries = [0];
  while (boundaries[boundaries.length - 1] < cssHeight - 0.5) {
    const start = boundaries[boundaries.length - 1];
    let end = Math.min(start + cssPageHeight, cssHeight);
    const crossing = protectedRanges
      .filter((range) => range.top < end && range.bottom > end && range.top > start + 24)
      .sort((a, b) => a.top - b.top)[0];
    if (crossing) end = crossing.top;
    if (end <= start + 24) end = Math.min(start + cssPageHeight, cssHeight);
    boundaries.push(end);
  }

  for (let pageIndex = 0; pageIndex < boundaries.length - 1; pageIndex++) {
    if (pageIndex > 0) pdf.addPage();
    const sourceY = Math.round(boundaries[pageIndex] * scale);
    const sourceBottom = Math.round(boundaries[pageIndex + 1] * scale);
    const sourceHeight = Math.max(1, sourceBottom - sourceY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourceHeight;
    pageCanvas.getContext('2d')?.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
    const renderedHeight = (sourceHeight / canvas.width) * pdfWidth;
    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, renderedHeight);
  }

  return pdf.output('blob');
}

/**
 * Convenience wrapper: render to PDF and trigger a cross-platform download.
 * Reuses the existing triggerBlobDownload helper for iOS/Android/desktop.
 */
export async function downloadPdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions & { fileName: string }
): Promise<void> {
  const blob = await generatePdfFromElement(element, options);
  triggerBlobDownload(blob, {
    filename: options.fileName,
    mimeType: 'application/pdf',
  });
}

/**
 * Mounts an off-screen container, runs an async render callback, captures the
 * resulting DOM as PDF, then cleans up. Used by Angular call sites that build
 * a hidden template component just for PDF export.
 *
 * The host element is appended to <body> with off-screen positioning so
 * html2canvas can still render it (display:none would break capture).
 */
export function createOffscreenHost(widthPx = 794): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('data-pdf-host', '');
  host.style.position = 'absolute';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.width = `${widthPx}px`;
  host.style.background = '#ffffff';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
}

export function destroyOffscreenHost(host: HTMLDivElement | null): void {
  if (!host) return;
  if (host.parentNode) host.parentNode.removeChild(host);
}
