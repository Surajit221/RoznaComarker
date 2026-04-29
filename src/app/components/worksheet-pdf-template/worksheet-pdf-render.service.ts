/**
 * WorksheetPdfRenderService
 *
 * Mounts the WorksheetPdfTemplateComponent into an off-screen host element,
 * lets Angular render it, then runs html2canvas+jsPDF capture and triggers a
 * cross-platform download. Cleans up the component+host afterwards.
 *
 * Used by:
 *   - worksheet-viewer.ts (student "Download My Worksheet" after submit)
 *   - worksheet-report.ts (teacher per-student download in report table)
 */
import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Injectable,
  createComponent,
  inject,
} from '@angular/core';
import {
  WorksheetPdfTemplateComponent,
  type WorksheetPdfInput,
} from './worksheet-pdf-template';
import {
  createOffscreenHost,
  destroyOffscreenHost,
  downloadPdfFromElement,
} from '../../utils/pdf-export.util';
import { WorksheetViewerComponent } from '../worksheet-viewer/worksheet-viewer';
import type { Worksheet } from '../../api/worksheet-api.service';

export interface ViewerPdfInput {
  worksheet: Worksheet;
  worksheetId: string;
  studentName: string;
  date: string;
  submittedAnswers: Array<{ questionId: string; sectionId: string; studentAnswer: string; isCorrect?: boolean }>;
  totalPointsEarned?: number;
  totalPointsPossible?: number;
  percentage?: number;
  timeTaken?: number;
}

@Injectable({ providedIn: 'root' })
export class WorksheetPdfRenderService {
  private readonly appRef    = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  /**
   * [LEGACY] Render the WorksheetPdfTemplate off-screen, capture as PDF, download.
   * Kept for backward compatibility. Prefer renderFromElement or renderViewerOffscreen.
   */
  async render(data: WorksheetPdfInput, fileName: string): Promise<void> {
    const host = createOffscreenHost(794);
    let compRef: ComponentRef<WorksheetPdfTemplateComponent> | null = null;

    try {
      compRef = createComponent(WorksheetPdfTemplateComponent, {
        environmentInjector: this.envInjector,
        hostElement: host,
      });
      compRef.setInput('data', data);
      this.appRef.attachView(compRef.hostView);
      compRef.changeDetectorRef.detectChanges();

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      await downloadPdfFromElement(host, { fileName });
    } finally {
      if (compRef) {
        try { this.appRef.detachView(compRef.hostView); } catch { /* ignore */ }
        try { compRef.destroy(); } catch { /* ignore */ }
      }
      destroyOffscreenHost(host);
    }
  }

  /**
   * Capture an already-rendered on-screen element (e.g. the real worksheet-viewer)
   * directly via html2canvas. Temporarily removes overflow/height constraints so
   * the full content is captured, then restores them.
   */
  async renderFromElement(element: HTMLElement, fileName: string): Promise<void> {
    const saved = new Map<HTMLElement, { overflow: string; height: string; maxHeight: string }>();

    // Temporarily expand any scroll containers so html2canvas sees everything.
    const all = element.querySelectorAll<HTMLElement>('*');
    all.forEach((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.overflow !== 'visible' || cs.maxHeight !== 'none') {
        saved.set(el, {
          overflow:  el.style.overflow,
          height:    el.style.height,
          maxHeight: el.style.maxHeight,
        });
        el.style.overflow  = 'visible';
        el.style.height    = 'auto';
        el.style.maxHeight = 'none';
      }
    });
    // Also expand the root element itself.
    const rootSaved = {
      overflow:  element.style.overflow,
      height:    element.style.height,
      maxHeight: element.style.maxHeight,
    };
    element.style.overflow  = 'visible';
    element.style.height    = 'auto';
    element.style.maxHeight = 'none';

    try {
      await new Promise<void>((r) => setTimeout(r, 300));
      await downloadPdfFromElement(element, {
        fileName,
        pageWidthPx: element.scrollWidth || 794,
      });
    } finally {
      // Restore original styles.
      element.style.overflow  = rootSaved.overflow;
      element.style.height    = rootSaved.height;
      element.style.maxHeight = rootSaved.maxHeight;
      saved.forEach((styles, el) => {
        el.style.overflow  = styles.overflow;
        el.style.height    = styles.height;
        el.style.maxHeight = styles.maxHeight;
      });
    }
  }

  /**
   * Mount the real WorksheetViewerComponent off-screen in reviewMode, wait for it
   * to render with the student's submission data, capture via html2canvas, then
   * clean up. Used by the teacher report page which has no viewer on screen.
   */
  async renderViewerOffscreen(input: ViewerPdfInput, fileName: string): Promise<void> {
    const host = createOffscreenHost(794);
    // Give the host an explicit overflow:visible so html2canvas isn't clipped.
    host.style.overflow = 'visible';
    let compRef: ComponentRef<WorksheetViewerComponent> | null = null;

    try {
      compRef = createComponent(WorksheetViewerComponent, {
        environmentInjector: this.envInjector,
        hostElement: host,
      });
      compRef.setInput('worksheetId', input.worksheetId);
      compRef.setInput('reviewMode', true);
      compRef.setInput('submittedAnswers', input.submittedAnswers);
      compRef.setInput('reviewMeta', {
        studentName: input.studentName,
        date: input.date,
        totalPointsEarned: input.totalPointsEarned,
        totalPointsPossible: input.totalPointsPossible,
        percentage: input.percentage,
        timeTaken: input.timeTaken,
      });
      this.appRef.attachView(compRef.hostView);
      compRef.changeDetectorRef.detectChanges();

      // Wait for the viewer to fetch the worksheet and hydrate.
      // The viewer calls api.getById internally via worksheetId.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      compRef.changeDetectorRef.detectChanges();
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      await this.renderFromElement(host, fileName);
    } finally {
      if (compRef) {
        try { this.appRef.detachView(compRef.hostView); } catch { /* ignore */ }
        try { compRef.destroy(); } catch { /* ignore */ }
      }
      destroyOffscreenHost(host);
    }
  }
}
