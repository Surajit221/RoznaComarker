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

  const imgData = canvas.toDataURL('image/png');

  let position = 0;
  let remaining = imgHeight;
  let pageIndex = 0;

  // Slice the tall canvas across A4 pages by translating the image upward.
  while (remaining > 0) {
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
    position += pdfHeight;
    remaining -= pdfHeight;
    pageIndex++;
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
