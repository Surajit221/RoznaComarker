import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  isDevMode
} from '@angular/core';

import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
import { DeviceService } from '../../services/device.service';
import { buildAnnotationVisuals, type AnnotationSegment, type AnnotationVisual } from './annotation-geometry';
import { layoutAnnotationGroups, sharedSegments } from './annotation-layout';
import type { AnnotationLeader } from './annotation-placement';
import { annotationBadgeMetrics } from './annotation-badge-metrics';
import { refineBadgeStrokeClearance } from './annotation-badge-clearance';
import { annotationMatchesImage } from '../../utils/correction-bbox.util';
import { imagePresentationGeometry, sourceGeometryMatchesImage, type AnnotationImageGeometry } from './annotation-image-geometry';

type TooltipPlacement = 'right' | 'left' | 'bottom' | 'top' | 'mobile';

interface CorrectionMarker {
  id: string;
  annotations: FeedbackAnnotation[];
  annotation: FeedbackAnnotation;
  width: number;
  left: number;
  top: number;
  offsetX: number;
  offsetY: number;
  code: string;
  label: string;
  textColor: string;
  semantic: boolean;
  leaders?: AnnotationLeader[];
}
const LINE_LEVEL_NOTE = 'Marked by line: the exact word could not be located on the image.';

export type MediaLoadState = 'idle' | 'fetching' | 'decoding' | 'rendering' | 'loaded' | 'error';

@Component({
  selector: 'app-correction-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './correction-overlay.html',
  styleUrl: './correction-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CorrectionOverlay implements OnChanges, AfterViewInit, OnDestroy {
  @Input() imageUrl: string | null = null;
  @Input() sourceLoading = false;
  @Input() sourceLoadError = false;
  @Input() annotations: FeedbackAnnotation[] | null = null;
  @Input() ocrWords: OcrWord[] | null = null;
  @Input() page = 1;
  @Input() fileId: string | null = null;
  @Input() submissionId: string | null = null;
  @Input() sourceGeometry: AnnotationImageGeometry | null = null;
  @Input() alt = 'Uploaded submission';
  /** The teacher's review workspace (Task 6C). Off everywhere else: no listeners, no attributes, no behaviour change. */
  @Input() syncMode = false;
  @Input() syncActiveId: string | null = null;
  /** Corrections that are not visible to the student, by id. */
  @Input() syncStates: ReadonlyMap<string, 'hidden' | 'archived'> | null = null;
  @Output() syncPointer = new EventEmitter<{ ids: string[]; kind: 'hover' | 'leave' | 'focus' | 'activate' }>();
  /** Which corrections are really drawn, so a target the image's geometry refuses is reported as having no position. */
  @Output() syncDrawn = new EventEmitter<Set<string>>();
  @Output() mediaStateChange = new EventEmitter<MediaLoadState>();
  @Output() retryRequested = new EventEmitter<void>();

  @ViewChild('overlayEl') private overlayEl?: ElementRef<HTMLElement>;
  @ViewChild('imageEl') private imageEl?: ElementRef<HTMLImageElement>;
  @ViewChild('tooltipEl', { static: true }) private tooltipEl!: ElementRef<HTMLElement>;

  markers: CorrectionMarker[] = [];
  underlineSegments: AnnotationSegment[] = [];
  semanticRails: AnnotationSegment[] = [];
  activeMarker: CorrectionMarker | null = null;
  isPinned = false;
  isMobile = false;
  badgeMetrics = annotationBadgeMetrics(Infinity);
  tooltipPlacement: TooltipPlacement = 'right';
  tooltipStyle: Record<string, string> = { visibility: 'hidden' };
  mediaState: MediaLoadState = 'idle';
  displayImageUrl: string | null = null;
  readonly lineLevelNote = LINE_LEVEL_NOTE;
  /** Shown under the image, so a missing marker is explained on every page. */
  unlocatedCount = 0;
  lineLevelCount = 0;
  private lineLevelIds = new Set<string>();
  selectedAnnotation: FeedbackAnnotation | null = null;
  selectedId: string | null = null;
  debugWords: OcrWord[] = [];
  get debugOverlay(): boolean {
    return isDevMode() && typeof location !== 'undefined' && new URLSearchParams(location.search).get('debugOverlay') === '1';
  }
  private geometryWarningShown = false;
  private destroyed = false;
  private readonly fontLoadHandler = (): void => this.scheduleLayout();
  private static nextId = 0;
  readonly detailId = `correction-detail-${CorrectionOverlay.nextId++}`;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly device = inject(DeviceService);
  private imageWidth = 0;
  private imageHeight = 0;
  private tooltipTarget: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private positionFrame: number | null = null;
  private readonly documentScrollHandler = (): void => this.schedulePosition();
  private previousScrollY = 0;
  private originalBodyStyle = '';
  private suppressNextFocusReopen = false;
  private visuals: AnnotationVisual[] = [];
  private layoutFrame: number | null = null;
  private hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private bodyLocked = false;
  private blurFrame: number | null = null;
  private syncUnlisten: (() => void) | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['page'] && !changes['page'].firstChange) this.closeTooltip();
    if (changes['imageUrl']) {
      this.beginImageLoad(this.imageUrl);
    }
    if ((changes['sourceLoading'] || changes['sourceLoadError']) && !this.imageUrl) {
      this.displayImageUrl = null;
      this.setMediaState(this.sourceLoading ? 'fetching' : this.sourceLoadError ? 'error' : 'idle');
    }
    if (changes['annotations'] || changes['page'] || changes['ocrWords'] || changes['fileId'] || changes['submissionId'] || changes['sourceGeometry']) {
      const activeId = this.selectedId;
      this.rebuildMarkers();
      if (!activeId) return;
      const replacement = this.markers.find((marker) => marker.annotations.some((a) => a._id === activeId)) || null;
      if (!replacement) {
        this.closeTooltip();
        return;
      }
      this.activeMarker = replacement;
      this.selectedAnnotation = replacement.annotations.find((a) => a._id === activeId) || null;
      if (this.tooltipTarget) this.schedulePosition();
    }
  }

  ngAfterViewInit(): void {
    this.updateResponsiveMode();
    if (this.syncMode) this.listenForSync();
    if (this.displayImageUrl) this.checkCachedImage(this.displayImageUrl);
    document.addEventListener('scroll', this.documentScrollHandler, true);
    document.fonts?.addEventListener('loadingdone', this.fontLoadHandler);
    document.fonts?.ready.then(() => { if (!this.destroyed) this.scheduleLayout(); });
    if (typeof ResizeObserver !== 'undefined' && this.overlayEl?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
      this.resizeObserver.observe(this.overlayEl.nativeElement);
    }
  }

  

  ngOnDestroy(): void {
    this.destroyed = true;
    this.syncUnlisten?.();
    document.fonts?.removeEventListener('loadingdone', this.fontLoadHandler);
    document.removeEventListener('scroll', this.documentScrollHandler, true);
    this.resizeObserver?.disconnect();
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    if (this.blurFrame !== null) cancelAnimationFrame(this.blurFrame);
    this.cancelHoverClose();
    this.unlockBodyScroll();
  }

  onImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!this.displayImageUrl || image !== this.imageEl?.nativeElement) return;
    if (!image.naturalWidth || !image.naturalHeight) {
      this.setMediaState('error');
      return;
    }
    this.imageWidth = image.naturalWidth;
    this.imageHeight = image.naturalHeight;
    this.resizeObserver?.observe(image);
    this.setMediaState('loaded');
    this.rebuildMarkers();
    this.schedulePosition();
  }

  onImageError(): void {
    this.closeTooltip();
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.markers = [];
    this.underlineSegments = [];
    this.semanticRails = [];
    this.visuals = [];
    this.setMediaState('error');
  }

  retryImage(): void {
    const url = this.imageUrl;
    if (!url) {
      this.retryRequested.emit();
      return;
    }
    this.displayImageUrl = null;
    this.setMediaState('fetching');
    this.cdr.detectChanges();
    queueMicrotask(() => {
      if (url !== this.imageUrl) return;
      this.displayImageUrl = url;
      this.setMediaState('decoding');
      this.cdr.markForCheck();
      this.checkCachedImage(url);
    });
  }

  onMarkerEnter(marker: CorrectionMarker, event: PointerEvent): void {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    this.cancelHoverClose();
    if (!this.isPinned) this.openTooltip(marker, event.currentTarget as HTMLElement, false);
  }

  onMarkerLeave(marker: CorrectionMarker, event: PointerEvent): void {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (!this.isPinned && this.activeMarker === marker) this.scheduleHoverClose();
  }

  cancelHoverClose(): void {
    if (this.hoverCloseTimer !== null) clearTimeout(this.hoverCloseTimer);
    this.hoverCloseTimer = null;
  }

  scheduleHoverClose(): void {
    this.cancelHoverClose();
    if (!this.isPinned) this.hoverCloseTimer = setTimeout(() => this.closeTooltip(), 220);
  }

  selectCorrection(annotation: FeedbackAnnotation): void {
    this.selectedAnnotation = annotation;
    this.selectedId = annotation._id;
    this.isPinned = true;
    this.schedulePosition();
  }

  isLineLevel(annotation: FeedbackAnnotation | null): boolean { return !!annotation && this.lineLevelIds.has(annotation._id); }

  isSelected(segment: AnnotationSegment): boolean {
    if (this.syncActiveId !== null) return segment.correctionIds.includes(this.syncActiveId);
    return this.selectedId !== null && segment.correctionIds.includes(this.selectedId);
  }

  isSyncActive(marker: CorrectionMarker): boolean {
    return this.syncActiveId !== null && marker.annotations.some(a => a._id === this.syncActiveId);
  }

  /** The state of a drawn item when it is not visible to the student; null for everything on a student's page. */
  syncState(ids: string[]): 'hidden' | 'archived' | null {
    if (!this.syncStates || !ids.length) return null;
    // Shared with something the student does see: it must not read as hidden.
    const states = ids.map(id => this.syncStates!.get(id));
    return states.every(Boolean) ? states[0]! : null;
  }
  markerIds(marker: CorrectionMarker): string[] { return marker.annotations.map(a => a._id); }
  syncMarkerLabel(marker: CorrectionMarker): string {
    const state = this.syncState(this.markerIds(marker));
    return state ? `${marker.label}, ${state === 'hidden' ? 'hidden from the student' : 'removed'}, approximate position` : marker.label;
  }

  /** One set of listeners on the overlay, however many markers it draws. Capture phase: a marker's own click handler stops propagation. */
  private listenForSync(): void {
    const root = this.overlayEl?.nativeElement;
    if (!root) return;
    const idsAt = (event: Event): string[] | null => {
      const id = (event.target as Element | null)?.closest?.('[data-marker-id]')?.getAttribute('data-marker-id');
      const marker = id ? this.markers.find(m => m.id === id) : undefined;
      return marker ? this.markerIds(marker) : null;
    };
    const emit = (event: Event, kind: 'hover' | 'leave' | 'focus' | 'activate'): void => { const ids = idsAt(event); if (ids) this.syncPointer.emit({ ids, kind }); };
    const over = (event: PointerEvent): void => { if (event.pointerType === 'mouse') emit(event, 'hover'); };
    const out = (event: PointerEvent): void => { if (event.pointerType === 'mouse') emit(event, 'leave'); };
    // A pointer press is the click that follows, not a keyboard focus (it would count twice).
    const focus = (event: Event): void => { if ((event.target as Element).matches?.(':focus-visible')) emit(event, 'focus'); };
    const click = (event: Event): void => emit(event, 'activate');
    const key = (event: KeyboardEvent): void => { if (event.key === 'Enter' || event.key === ' ') emit(event, 'activate'); };
    root.addEventListener('pointerover', over, true); root.addEventListener('pointerout', out, true);
    root.addEventListener('focusin', focus, true); root.addEventListener('click', click, true); root.addEventListener('keydown', key, true);
    this.syncUnlisten = () => {
      root.removeEventListener('pointerover', over, true); root.removeEventListener('pointerout', out, true);
      root.removeEventListener('focusin', focus, true); root.removeEventListener('click', click, true); root.removeEventListener('keydown', key, true);
    };
  }

  onMarkerFocus(marker: CorrectionMarker, event: FocusEvent): void {
    if (this.isMobile) return;
    if (this.suppressNextFocusReopen) {
      this.suppressNextFocusReopen = false;
      return;
    }
    if (!this.isPinned) this.openTooltip(marker, event.currentTarget as HTMLElement, false);
  }


  onMarkerBlur(): void {
    if (this.isPinned) return;
    const marker = this.activeMarker;
    if (this.blurFrame !== null) cancelAnimationFrame(this.blurFrame);
    this.blurFrame = requestAnimationFrame(() => {
      this.blurFrame = null;
      if (this.isPinned || this.activeMarker !== marker) return;
      const active = document.activeElement as Element | null;
      if (!active?.closest('.correction-overlay__tooltip')) this.closeTooltip();
    });
  }

  onMarkerClick(marker: CorrectionMarker, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    // VisualViewport can settle after initial render on Android Chrome. Resolve
    // the presentation mode at activation so the first tap opens the sheet.
    if (this.device.isMobile()) this.isMobile = true;
    const target = event.currentTarget as HTMLElement;
    if (!this.isMobile && this.isPinned && this.activeMarker?.annotation._id === marker.annotation._id) {
      this.closeTooltip();
      return;
    }
    if (!this.isMobile && !this.isPinned && this.activeMarker?.annotation._id === marker.annotation._id) {
      this.isPinned = true;
      this.tooltipTarget = target;
      this.cdr.markForCheck();
      return;
    }
    this.openTooltip(marker, target, true);
  }

  onMarkerKeydown(marker: CorrectionMarker, event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.device.isMobile()) this.isMobile = true;
    this.openTooltip(marker, event.currentTarget as HTMLElement, true);
  }

  preventControlPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  closeFromControl(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const target = this.tooltipTarget;
    const shouldRestoreFocus = !this.isMobile;
    this.closeTooltip();
    if (!shouldRestoreFocus || !target) return;
    requestAnimationFrame(() => {
      if (this.activeMarker) return;
      this.suppressNextFocusReopen = true;
      target.focus({ preventScroll: true });
      this.suppressNextFocusReopen = false;
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.activeMarker) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('.correction-overlay__marker, .correction-overlay__tooltip')) return;
    this.closeTooltip();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeFromControl();
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (!this.isMobile || event.key !== 'Tab') return;
    const controls = Array.from(this.tooltipEl.nativeElement.querySelectorAll<HTMLElement>('button'));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  get selectedTextColor(): string {
    return this.contrastColor(this.selectedAnnotation?.color || '#d64545');
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange(): void {
    this.updateResponsiveMode();
    this.scheduleLayout();
  }

  get categoryName(): string {
    return (this.selectedAnnotation?.group || this.selectedAnnotation?.category || 'Correction').trim();
  }

  get explanation(): string {
    return (this.selectedAnnotation?.message || '').trim();
  }

  get suggestion(): string {
    return (this.selectedAnnotation?.suggestedText || '').trim();
  }

  get originalText(): string {
    const annotation = this.selectedAnnotation as (FeedbackAnnotation & { originalText?: string; text?: string; quotedText?: string }) | null;
    return String(annotation?.originalText || annotation?.quotedText || annotation?.text || '').trim();
  }

  get tip(): string {
    const annotation = this.selectedAnnotation as (FeedbackAnnotation & { tip?: string }) | null;
    return typeof annotation?.tip === 'string' ? annotation.tip.trim() : '';
  }

  private rebuildMarkers(): void {
    if (this.mediaState !== 'loaded' || !this.imageWidth || !this.imageHeight) {
      this.markers = [];
      this.underlineSegments = [];
      this.semanticRails = [];
      this.unlocatedCount = 0; this.lineLevelCount = 0; this.lineLevelIds = new Set();
      this.cdr.markForCheck();
      return;
    }
    const annotations = (Array.isArray(this.annotations) ? this.annotations : []).filter(annotation =>
      annotationMatchesImage(annotation, { fileId: this.fileId, submissionId: this.submissionId, page: this.page }));
    if (!sourceGeometryMatchesImage(this.sourceGeometry, this.fileId, this.page, this.imageWidth, this.imageHeight)) {
      if (isDevMode() && !this.geometryWarningShown) {
        console.warn({ event: 'annotation_geometry_mismatch', ambiguous: this.sourceGeometry?.ambiguous === true });
        this.geometryWarningShown = true;
      }
      this.markers = []; this.underlineSegments = []; this.semanticRails = []; this.visuals = []; this.debugWords = [];
      this.unlocatedCount = annotations.length; this.lineLevelCount = 0; this.lineLevelIds = new Set();
      if (this.syncMode) this.syncDrawn.emit(new Set());
      this.cdr.markForCheck(); return;
    }
    const presentation = imagePresentationGeometry(annotations, Array.isArray(this.ocrWords) ? this.ocrWords : [],
      this.sourceGeometry, this.fileId, this.page, this.imageWidth, this.imageHeight);
    this.debugWords = presentation.words;
    this.visuals = buildAnnotationVisuals(presentation.annotations, presentation.words, this.page, this.imageWidth, this.imageHeight);
    this.underlineSegments = sharedSegments(this.visuals, false);
    this.semanticRails = sharedSegments(this.visuals, true);
    this.lineLevelIds = new Set(this.visuals.filter(v => v.lineLevel).map(v => v.annotation._id));
    this.lineLevelCount = this.lineLevelIds.size;
    const placed = new Set(this.visuals.filter(v => v.segments.length).map(v => v.annotation._id));
    this.unlocatedCount = annotations.filter(a => !placed.has(a._id)).length;
    this.layoutMarkers();
    if (this.syncMode) this.syncDrawn.emit(new Set(this.visuals.filter(v => v.segments.length).map(v => v.annotation._id)));
  }

  private layoutMarkers(): void {
    const rect = this.imageEl?.nativeElement.getBoundingClientRect();
    const width = rect?.width || 0;
    const height = rect?.height || 0;
    this.renderedWidth = width;
    this.renderedHeight = height;
    this.badgeMetrics = annotationBadgeMetrics(typeof window === 'undefined' ? Infinity : window.innerWidth);
    const groups = layoutAnnotationGroups(this.visuals, width, height, 110, this.badgeMetrics, this.debugWords);
    this.markers = refineBadgeStrokeClearance(groups, this.visuals, width, height, this.badgeMetrics, this.debugWords).map((group) => ({
      ...group, annotation: group.annotations[0], offsetX: 0, offsetY: 0,
      label: group.annotations.some(a => this.lineLevelIds.has(a._id)) ? `${group.label}. ${LINE_LEVEL_NOTE}` : group.label,
      textColor: this.contrastColor(group.annotations[0].color || '#d64545')
    }));
    if (this.selectedId) {
      this.activeMarker = this.markers.find((m) => m.annotations.some((a) => a._id === this.selectedId)) || null;
      if (!this.activeMarker) this.closeTooltip();
    }
    this.cdr.markForCheck();
  }

  private scheduleLayout(): void {
    if (this.layoutFrame !== null) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      const rect = this.imageEl?.nativeElement.getBoundingClientRect();
      if (this.mediaState === 'loaded' && (Math.abs((rect?.width || 0) - this.renderedWidth) > 0.25
        || Math.abs((rect?.height || 0) - this.renderedHeight) > 0.25
        || annotationBadgeMetrics(window.innerWidth).height !== this.badgeMetrics.height)) {
        this.layoutMarkers();
        this.cdr.detectChanges();
        if (this.activeMarker) {
          this.tooltipTarget = this.overlayEl?.nativeElement.querySelector<HTMLElement>(
            '[data-marker-id="' + CSS.escape(this.activeMarker.id) + '"]') || null;
        }
      }
      this.schedulePosition();
    });
  }

  private openTooltip(marker: CorrectionMarker, target: HTMLElement, pinned: boolean): void {
    if (this.syncMode) return;   // the workspace's list shows the details
    this.cancelHoverClose();
    this.updateResponsiveMode();
    const wasMobileOpen = this.isMobile && this.activeMarker !== null;
    this.activeMarker = marker;
    this.selectedAnnotation = marker.annotation;
    this.selectedId = marker.annotation._id;
    this.tooltipTarget = target;
    this.isPinned = pinned || this.isMobile;
    if (this.isMobile) {
      this.tooltipPlacement = 'mobile';
      this.tooltipStyle = { visibility: 'visible' };
      if (!wasMobileOpen) this.lockBodyScroll();
      this.cdr.detectChanges();
      this.tooltipEl.nativeElement.querySelector<HTMLElement>('.correction-overlay__close')?.focus({ preventScroll: true });
      return;
    }
    this.tooltipStyle = { visibility: 'hidden' };
    this.cdr.detectChanges();
    this.positionTooltip();
  }

  private schedulePosition(): void {
    if (!this.activeMarker || !this.tooltipTarget) return;
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null;
      this.positionTooltip();
    });
  }

  private positionTooltip(): void {
    const target = this.tooltipTarget;
    const tooltip = this.tooltipEl.nativeElement;
    if (!target || !tooltip || !this.activeMarker) return;

    this.updateResponsiveMode();
    if (this.isMobile) {
      this.tooltipPlacement = 'mobile';
      this.tooltipStyle = { visibility: 'visible' };
      this.cdr.markForCheck();
      return;
    }

    const markerRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = tooltipRect.width || Math.min(340, Math.max(180, viewportWidth - 24));
    const height = tooltipRect.height || Math.min(240, Math.max(96, viewportHeight - 24));
    const gap = 14;
    const pad = 12;
    const candidates: { placement: Exclude<TooltipPlacement, 'mobile'>; left: number; top: number }[] = [
      { placement: 'right', left: markerRect.right + gap, top: markerRect.top + markerRect.height / 2 - height / 2 },
      { placement: 'left', left: markerRect.left - gap - width, top: markerRect.top + markerRect.height / 2 - height / 2 },
      { placement: 'bottom', left: markerRect.left + markerRect.width / 2 - width / 2, top: markerRect.bottom + gap },
      { placement: 'top', left: markerRect.left + markerRect.width / 2 - width / 2, top: markerRect.top - gap - height }
    ];
    const fits = (candidate: { left: number; top: number }) =>
      candidate.left >= pad && candidate.top >= pad && candidate.left + width <= viewportWidth - pad && candidate.top + height <= viewportHeight - pad;
    const chosen = candidates.find(fits) || candidates[0];
    const left = Math.max(pad, Math.min(viewportWidth - width - pad, chosen.left));
    const top = Math.max(pad, Math.min(viewportHeight - height - pad, chosen.top));
    const arrowX = Math.max(16, Math.min(width - 16, markerRect.left + markerRect.width / 2 - left));
    const arrowY = Math.max(16, Math.min(height - 16, markerRect.top + markerRect.height / 2 - top));

    this.tooltipPlacement = chosen.placement;
    this.tooltipStyle = {
      visibility: 'visible',
      left: `${left}px`,
      top: `${top}px`,
      '--arrow-x': `${arrowX}px`,
      '--arrow-y': `${arrowY}px`
    };
    this.cdr.markForCheck();
  }

  private updateResponsiveMode(): void {
    const next = this.device.isMobile();
    if (next !== this.isMobile) {
      this.isMobile = next;
      if (this.activeMarker) {
        if (next) this.lockBodyScroll(); else this.unlockBodyScroll();
      }
      this.cdr.markForCheck();
    }
  }

  private closeTooltip(): void {
    this.cancelHoverClose();
    this.activeMarker = null;
    this.selectedAnnotation = null;
    this.selectedId = null;
    this.isPinned = false;
    this.tooltipTarget = null;
    this.tooltipStyle = { visibility: 'hidden' };
    if (this.bodyLocked) {
      this.unlockBodyScroll();
    }
    this.cdr.markForCheck();
  }

  private contrastColor(color: string): string {
    const hex = color.trim().replace('#', '');
    const normalized = hex.length === 3 ? hex.split('').map((value) => value + value).join('') : hex;
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#ffffff';
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#172033' : '#ffffff';
  }

  private beginImageLoad(url: string | null): void {
    this.closeTooltip();
    if (this.imageEl) this.resizeObserver?.unobserve(this.imageEl.nativeElement);
    this.renderedWidth = 0;
    this.geometryWarningShown = false;
    this.renderedHeight = 0;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.markers = [];
    this.underlineSegments = [];
    this.displayImageUrl = url;
    this.setMediaState(url ? 'decoding' : 'idle');
    if (url) this.checkCachedImage(url);
  }

  private checkCachedImage(expectedUrl: string): void {
    queueMicrotask(() => {
      if (expectedUrl !== this.imageUrl) return;
      const image = this.imageEl?.nativeElement;
      if (!image?.complete) return;
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        this.onImageLoad({ target: image } as unknown as Event);
      } else {
        this.onImageError();
      }
    });
  }

  private setMediaState(state: MediaLoadState): void {
    if (this.mediaState === state) return;
    this.mediaState = state;
    this.mediaStateChange.emit(state);
    this.cdr.markForCheck();
  }

  private lockBodyScroll(): void {
    if (this.bodyLocked) return;
    this.bodyLocked = true;
    this.previousScrollY = window.scrollY;
    this.originalBodyStyle = document.body.style.cssText || '';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.previousScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.boxSizing = 'border-box';
  }

  private unlockBodyScroll(): void {
    if (!this.bodyLocked) return;
    this.bodyLocked = false;
    document.body.style.cssText = this.originalBodyStyle;
    window.scrollTo(0, this.previousScrollY);
    this.previousScrollY = 0;
    this.originalBodyStyle = '';
  }
}
