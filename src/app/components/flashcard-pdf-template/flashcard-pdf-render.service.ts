/**
 * FlashcardPdfRenderService
 *
 * Mounts FlashcardPdfTemplateComponent into an off-screen host, renders, then
 * captures with html2canvas + jsPDF (via the shared pdf-export utility).
 * Mirrors WorksheetPdfRenderService.
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
  FlashcardPdfTemplateComponent,
  type FlashcardPdfInput,
} from './flashcard-pdf-template';
import {
  createOffscreenHost,
  destroyOffscreenHost,
  downloadPdfFromElement,
} from '../../utils/pdf-export.util';

@Injectable({ providedIn: 'root' })
export class FlashcardPdfRenderService {
  private readonly appRef      = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  async render(data: FlashcardPdfInput, fileName: string): Promise<void> {
    const host = createOffscreenHost(794);
    let compRef: ComponentRef<FlashcardPdfTemplateComponent> | null = null;

    try {
      compRef = createComponent(FlashcardPdfTemplateComponent, {
        environmentInjector: this.envInjector,
        hostElement: host,
      });
      compRef.setInput('data', data);
      this.appRef.attachView(compRef.hostView);
      compRef.changeDetectorRef.detectChanges();

      // Two animation frames so layout settles.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      await downloadPdfFromElement(host, { fileName });
    } finally {
      if (compRef) {
        try { this.appRef.detachView(compRef.hostView); } catch { /* ignore */ }
        try { compRef.destroy(); } catch { /* ignore */ }
      }
      destroyOffscreenHost(host);
    }
  }
}
