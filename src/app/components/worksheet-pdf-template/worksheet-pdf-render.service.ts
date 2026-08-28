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
  isDevMode,
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

export function normalizeViewerPdfInput(input: ViewerPdfInput): WorksheetPdfInput {
  const worksheet: any = { ...input.worksheet };
  const activities = Array.isArray((input.worksheet as any).activities) ? (input.worksheet as any).activities : [];
  const typeMap: Record<string, string> = {
    ordering: 'activity1', dragDrop: 'activity1', sorting: 'activity1',
    classification: 'activity2', multipleChoice: 'activity3',
    fillBlanks: 'activity4', 'fill-blanks': 'activity4',
    matching: 'activity5', trueFalse: 'activity6', 'true-false': 'activity6',
  };
  const sourceIds: Record<string, string[]> = {};
  activities.forEach((activity: any, index: number) => {
    const canonicalId = typeMap[String(activity?.type || '')];
    if (!canonicalId) return;
    worksheet[canonicalId] = { ...(activity?.data || {}), title: activity?.title || activity?.data?.title || '', instructions: activity?.instructions || activity?.data?.instructions || '' };
    sourceIds[canonicalId] = [`activity_${index}`, canonicalId];
  });
  for (let index = 1; index <= 6; index += 1) {
    const id = `activity${index}`;
    if (!sourceIds[id]) sourceIds[id] = [id];
  }
  const bySection = (canonicalId: string) => input.submittedAnswers.filter((answer) => sourceIds[canonicalId].includes(answer.sectionId));
  const answerMap = (canonicalId: string) => Object.fromEntries(bySection(canonicalId).map((answer) => [answer.questionId, answer.studentAnswer]));
  const items = worksheet.activity1?.items ?? [];
  const a1Answers = answerMap('activity1');
  const a1Slots = items.map((_: any, index: number) => items.find((item: any) => item.id === a1Answers[`slot_${index}`]) ?? null);
  const a6Answers = Object.fromEntries(bySection('activity6').map((answer) => [answer.questionId, answer.studentAnswer.toLowerCase() === 'true']));
  const counts = {
    mcq: worksheet.activity3?.questions?.length ?? 0,
    fill: (worksheet.activity4?.sentences ?? []).reduce((total: number, sentence: any) => total + (sentence.parts ?? []).filter((part: any) => part.type === 'blank').length, 0),
    matching: worksheet.activity5?.pairs?.length ?? 0,
    trueFalse: worksheet.activity6?.questions?.length ?? 0,
  };
  const totalGradable = counts.mcq + counts.fill + counts.matching + counts.trueFalse + (worksheet.activity1?.items?.length ?? 0) + (worksheet.activity2?.items?.length ?? 0);
  if (isDevMode()) console.info('[STUDENT WORKSHEET PDF]', { worksheetTitle: worksheet.title || '', sectionCount: Object.values(counts).filter((count) => count > 0).length, ...counts, totalGradable });
  const expected = input.totalPointsPossible ?? 0;
  if (expected > 0 && totalGradable === 0) throw new Error(`Student worksheet PDF mapping failed: expected ${expected} gradable items but resolved 0.`);
  return {
    worksheet,
    studentName: input.studentName,
    date: input.date,
    a1Slots,
    a1Checked: true,
    a2Answers: answerMap('activity2'),
    a2Revealed: Object.fromEntries(bySection('activity2').map((answer) => [answer.questionId, true])),
    a3Answers: answerMap('activity3'),
    a4Blanks: answerMap('activity4'),
    a4Checked: true,
    a5Matches: answerMap('activity5'),
    a6Answers,
    totalPointsEarned: input.totalPointsEarned ?? 0,
    totalPointsPossible: expected,
    percentage: input.percentage ?? 0,
    timeTaken: input.timeTaken,
  };
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
    host.classList.add('pdf-worksheet-result');
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

      await downloadPdfFromElement(host, {
        fileName,
        pageBreakAvoidSelector: '.wv-pdf-avoid-break',
        keepWithNextSelector: '.wv-pdf-keep-with-next',
      });
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
   * Normalize a persisted student submission into the dedicated worksheet-style
   * PDF template. The normal on-screen worksheet component is not modified.
   */
  async renderViewerOffscreen(input: ViewerPdfInput, fileName: string): Promise<void> {
    await this.render(normalizeViewerPdfInput(input), fileName);
  }
}
