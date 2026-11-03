import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import { TranscriptPageView, buildTranscriptPageViews } from '../../../utils/transcript-page-views.util';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import type { SharedPageImages } from '../../submission-page-review/shared-page-images';
import type { AnnotationSnapshot, CorrectionRow } from './annotation-editor.logic';
import { APPROXIMATE_POSITION, NO_IMAGE_POSITION, RowPosition, nextInCycle, panelScrollTop, preferCurrent, syncStates, workspaceCorrections } from './annotation-sync.logic';
import { CorrectionSelection, SelectionSource } from './correction-selection';

export interface SyncPointer { ids: string[]; kind: 'hover' | 'leave' | 'focus' | 'activate'; }

/** Every view scrolls the same way: inside its own panel, never the window, and without animation when the user asked for less motion. */
export function scrollPanelTo(panel: HTMLElement | undefined, target: Element | null | undefined): void {
  if (!panel || !target) return;
  const box = panel.getBoundingClientRect(), place = target.getBoundingClientRect();
  const top = panelScrollTop({ top: box.top, height: box.height, scrollTop: panel.scrollTop }, { top: place.top, height: place.height });
  if (top === null) return;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

/** What one pointer or keyboard action in a view does to the shared selection. */
export function applySyncPointer(selection: CorrectionSelection, event: SyncPointer, source: SelectionSource): void {
  if (event.kind === 'leave') { selection.hoverEnd(); return; }
  const id = event.kind === 'activate' ? nextInCycle(event.ids, selection.pinnedId()) : preferCurrent(event.ids, selection.activeId());
  if (id === null) return;
  if (event.kind === 'hover') selection.hover(id, source); else selection.pin(id, source);
}

/**
 * Image and transcript side by side, for the teacher, built from the saved snapshot: hidden and removed items too, where they have a safe position.
 * It exists only while the teacher has it open. The image is the one the page already downloaded; closing destroys this component and its listeners.
 */
@Component({
  selector: 'app-review-workspace',
  imports: [CorrectionOverlay, TokenizedTranscript],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-workspace.html',
  styleUrl: './review-workspace.css',
})
export class ReviewWorkspace implements OnDestroy {
  readonly submissionId = input.required<string>();
  readonly snapshot = input.required<AnnotationSnapshot>();
  readonly rows = input.required<CorrectionRow[]>();
  readonly positions = input.required<Map<string, RowPosition>>();
  /** The page's already-loaded image, for a submission of images. */
  readonly imageUrl = input<string | null>(null);
  readonly imageLoading = input(false);
  readonly imageFailed = input(false);
  readonly activeFileId = input<string | null>(null);
  readonly isPdf = input(false);
  readonly imageStore = input<SharedPageImages | null>(null);
  /** The teacher moved to a correction or page on another uploaded file: the page loads it, once, for both views. */
  readonly fileRequested = output<string>();
  readonly drawnChange = output<{ key: string; ids: Set<string> }>();

  readonly selection = inject(CorrectionSelection);
  private readonly injector = inject(Injector);
  private readonly imagePanel = viewChild<ElementRef<HTMLElement>>('imagePanel');
  private readonly transcriptPanel = viewChild<ElementRef<HTMLElement>>('transcriptPanel');

  private readonly pdfIndex = signal(0);
  private readonly pdfImage = signal<{ source: string; url: string | null; failed: boolean }>({ source: '', url: null, failed: false });
  private heldSource = '';
  private keepInView = false;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pdfSequence = 0;

  readonly states = computed(() => syncStates(this.rows()));
  readonly views = computed(() => {
    const snapshot = this.snapshot();
    return buildTranscriptPageViews({ submissionId: this.submissionId(), fileIds: [...new Set((snapshot.pages ?? []).map(p => String(p.fileId)))], ocrPages: snapshot.pages ?? [],
      corrections: workspaceCorrections(this.rows(), this.positions(), snapshot) });
  });
  readonly viewIndex = computed(() => {
    if (this.isPdf()) return Math.min(this.pdfIndex(), Math.max(0, this.views().length - 1));
    return Math.max(0, this.views().findIndex(view => view.fileId === this.activeFileId()));
  });
  readonly view = computed<TranscriptPageView | undefined>(() => this.views()[this.viewIndex()]);
  readonly overlayAnnotations = computed<FeedbackAnnotation[]>(() => {
    const positions = this.positions();
    return (this.view()?.annotations ?? []).filter(annotation => positions.get(annotation._id)?.image !== 'none');
  });
  readonly displayUrl = computed(() => this.isPdf() ? this.pdfImage().url : this.imageUrl());
  readonly displayLoading = computed(() => this.isPdf() ? Boolean(this.view()?.imageUrl) && !this.pdfImage().url && !this.pdfImage().failed : this.imageLoading());
  readonly displayFailed = computed(() => this.isPdf() ? this.pdfImage().failed : this.imageFailed());
  readonly noImage = computed(() => this.isPdf() && !this.view()?.imageUrl);
  readonly approximateShown = computed(() => { const positions = this.positions(); return this.overlayAnnotations().some(a => positions.get(a._id)?.image === 'approximate'); });
  readonly activeRow = computed(() => { const id = this.selection.activeId(); return id ? this.rows().find(row => row.key === id) ?? null : null; });
  readonly activeNote = computed(() => {
    const row = this.activeRow(), image = row ? this.positions().get(row.key)?.image : undefined;
    return image === 'none' ? NO_IMAGE_POSITION : image === 'approximate' ? APPROXIMATE_POSITION : '';
  });
  /** Announced for what the teacher chose; hovering would flood a screen reader. */
  readonly announcement = computed(() => {
    const id = this.selection.pinnedId(), row = id ? this.rows().find(r => r.key === id) : null;
    if (!row) return '';
    const status = row.status === 'hidden' ? 'hidden from the student' : row.status === 'archived' ? 'removed' : 'visible to the student';
    const image = this.positions().get(row.key)?.image;
    return `Selected ${row.symbol || 'correction'}${row.quotedText ? `, ${row.quotedText}` : ''}, page ${row.page}, ${status}${image === 'none' ? `. ${NO_IMAGE_POSITION}` : image === 'approximate' ? `. ${APPROXIMATE_POSITION}` : ''}.`;
  });

  constructor() {
    // The page image for a PDF submission: shared with the page's own view, held only while it is the one on screen.
    effect(() => {
      if (!this.isPdf()) return;
      const source = this.view()?.imageUrl ?? '', store = this.imageStore();
      untracked(() => { void this.holdPdfImage(source, store); });
    });
    // A correction on another page brings that page here; then the other views scroll to it.
    effect(() => {
      const id = this.selection.activeId(), source = this.selection.source();
      if (!id) return;
      const position = untracked(this.positions).get(id);
      untracked(() => {
        if (position && position.image !== 'none') this.showPage(position.fileId, position.page);
        afterNextRender(() => this.scrollViews(source), { injector: this.injector });
      });
    });
  }

  private async holdPdfImage(source: string, store: SharedPageImages | null): Promise<void> {
    if (source === this.heldSource) return;
    const sequence = ++this.pdfSequence;
    if (this.heldSource) store?.release(this.heldSource);
    this.heldSource = source;
    this.pdfImage.set({ source, url: null, failed: false });
    if (!source || !store) return;
    try {
      const url = await store.acquire(source);
      if (sequence === this.pdfSequence) this.pdfImage.set({ source, url, failed: false }); else store.release(source);
    } catch { if (sequence === this.pdfSequence) { this.heldSource = ''; this.pdfImage.set({ source, url: null, failed: true }); } }
  }

  private showPage(fileId: string, page: number): void {
    const index = this.views().findIndex(view => view.fileId === fileId && view.pageNumber === page);
    if (index >= 0 && index !== this.viewIndex()) this.goTo(index);
  }
  goTo(index: number): void {
    const view = this.views()[index];
    if (!view) return;
    if (this.isPdf()) { this.pdfIndex.set(index); return; }
    this.keepInView = true;
    this.fileRequested.emit(view.fileId);
  }

  private scrollViews(source: SelectionSource | null): void {
    if (source !== 'image') scrollPanelTo(this.imagePanel()?.nativeElement, this.imagePanel()?.nativeElement.querySelector('.correction-overlay__marker.is-sync-active'));
    if (source !== 'transcript') scrollPanelTo(this.transcriptPanel()?.nativeElement, this.transcriptPanel()?.nativeElement.querySelector('.is-sync-active'));
  }
  /** Markers exist only once the image has loaded, possibly after the selection moved to its page. */
  onDrawn(ids: Set<string>): void {
    const view = this.view();
    if (this.keepInView && this.displayUrl()) {
      // The page's own image above has just changed size, which moved this workspace.
      this.keepInView = false;
      afterNextRender(() => this.host.nativeElement.scrollIntoView({ block: 'start', behavior: 'auto' }), { injector: this.injector });
    }
    if (view) this.drawnChange.emit({ key: `${view.fileId}:${view.pageNumber}`, ids });
    if (this.selection.source() !== 'image') afterNextRender(() => scrollPanelTo(this.imagePanel()?.nativeElement, this.imagePanel()?.nativeElement.querySelector('.correction-overlay__marker.is-sync-active')), { injector: this.injector });
  }
  onPointer(event: SyncPointer, source: SelectionSource): void { applySyncPointer(this.selection, event, source); }

  ngOnDestroy(): void {
    this.pdfSequence++;
    if (this.heldSource) this.imageStore()?.release(this.heldSource);
  }
}
