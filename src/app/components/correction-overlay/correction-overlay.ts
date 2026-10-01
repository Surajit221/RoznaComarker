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
  inject
} from '@angular/core';

import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
import { DeviceService } from '../../services/device.service';
import { buildAnnotationVisuals, type AnnotationSegment } from './annotation-geometry';

type TooltipPlacement = 'right' | 'left' | 'bottom' | 'top' | 'mobile';

interface CorrectionMarker {
  annotation: FeedbackAnnotation;
  left: number;
  top: number;
  offsetX: number;
  offsetY: number;
  code: string;
  label: string;
  textColor: string;
  semantic: boolean;
}

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
  @Input() alt = 'Uploaded submission';
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
  tooltipPlacement: TooltipPlacement = 'right';
  tooltipStyle: Record<string, string> = { visibility: 'hidden' };
  mediaState: MediaLoadState = 'idle';
  displayImageUrl: string | null = null;

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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageUrl']) {
      this.beginImageLoad(this.imageUrl);
    }
    if ((changes['sourceLoading'] || changes['sourceLoadError']) && !this.imageUrl) {
      this.displayImageUrl = null;
      this.setMediaState(this.sourceLoading ? 'fetching' : this.sourceLoadError ? 'error' : 'idle');
    }
    if (changes['annotations'] || changes['page'] || changes['ocrWords']) {
      const activeId = this.activeMarker?.annotation._id || null;
      this.rebuildMarkers();
      if (!activeId) return;
      const replacement = this.markers.find((marker) => marker.annotation._id === activeId) || null;
      if (!replacement) {
        this.closeTooltip();
        return;
      }
      this.activeMarker = replacement;
      if (this.tooltipTarget) this.schedulePosition();
    }
  }

  ngAfterViewInit(): void {
    this.updateResponsiveMode();
    if (this.displayImageUrl) this.checkCachedImage(this.displayImageUrl);
    document.addEventListener('scroll', this.documentScrollHandler, true);
    if (typeof ResizeObserver !== 'undefined' && this.overlayEl?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => this.schedulePosition());
      this.resizeObserver.observe(this.overlayEl.nativeElement);
    }
  }

  

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.documentScrollHandler, true);
    this.resizeObserver?.disconnect();
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
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
    this.setMediaState('loaded');
    this.rebuildMarkers();
    this.schedulePosition();
  }

  onImageError(): void {
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.markers = [];
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
    if (!this.isPinned) this.openTooltip(marker, event.currentTarget as HTMLElement, false);
  }

  onMarkerLeave(marker: CorrectionMarker, event: PointerEvent): void {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (!this.isPinned && this.activeMarker?.annotation._id === marker.annotation._id) this.closeTooltip();
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
    requestAnimationFrame(() => {
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
    this.closeTooltip();
  }

  @HostListener('window:resize')
  @HostListener('window:orientationchange')
  onViewportChange(): void {
    this.updateResponsiveMode();
    this.schedulePosition();
  }

  get categoryName(): string {
    return (this.activeMarker?.annotation.group || 'Correction').trim();
  }

  get explanation(): string {
    return (this.activeMarker?.annotation.message || '').trim();
  }

  get suggestion(): string {
    return (this.activeMarker?.annotation.suggestedText || '').trim();
  }

  get originalText(): string {
    const annotation = this.activeMarker?.annotation as (FeedbackAnnotation & { originalText?: string; text?: string; quotedText?: string }) | undefined;
    return String(annotation?.originalText || annotation?.quotedText || annotation?.text || '').trim();
  }

  get tip(): string {
    const annotation = this.activeMarker?.annotation as (FeedbackAnnotation & { tip?: string }) | undefined;
    return typeof annotation?.tip === 'string' ? annotation.tip.trim() : '';
  }

  private rebuildMarkers(): void {
    if (this.mediaState !== 'loaded' || !this.imageWidth || !this.imageHeight) {
      this.markers = [];
      this.underlineSegments = [];
      this.semanticRails = [];
      this.cdr.markForCheck();
      return;
    }
    const visuals = buildAnnotationVisuals(Array.isArray(this.annotations) ? this.annotations : [],
      Array.isArray(this.ocrWords) ? this.ocrWords : [], this.page, this.imageWidth, this.imageHeight);
    const localSegments = visuals.filter((visual) => !visual.semantic).flatMap((visual) => visual.segments);
    const seenSegments = new Set<string>();
    this.underlineSegments = localSegments.filter((line) => {
      const key = [line.left.toFixed(2), line.top.toFixed(2), line.width.toFixed(2)].join(':');
      if (seenSegments.has(key)) return false;
      seenSegments.add(key);
      return true;
    });
    this.semanticRails = visuals.filter((visual) => visual.semantic).flatMap((visual) => visual.segments);
    const positions: { left: number; top: number }[] = [];
    const renderedWidth = this.imageEl?.nativeElement.clientWidth || this.imageWidth;
    const renderedHeight = this.imageEl?.nativeElement.clientHeight || this.imageHeight;
    this.markers = visuals
      .filter((visual) => Boolean(visual.annotation.symbol?.trim()))
      .map(({ annotation, segments, semantic }) => {
        const final = segments[segments.length - 1];
        const left = final.left + final.width;
        const top = final.anchorTop;
        const nearby = positions.filter((position) =>
          Math.abs(position.left - left) * renderedWidth / 100 < 29
          && Math.abs(position.top - top) * renderedHeight / 100 < 29).length;
        positions.push({ left, top });
        const fullCode = annotation.symbol!.trim();
        const code = semantic && (left <= 5 || left >= 95) ? fullCode.slice(0, 1) : fullCode;
        const color = annotation.color || '#d64545';
        return {
          annotation,
          left,
          top,
          offsetX: nearby >= 2 ? (left > 50 ? -26 : 26) : 0,
          offsetY: nearby === 1 || nearby >= 3 ? (top > 50 ? -26 : 26) : 0,
          code,
          label: `${fullCode}: ${annotation.group || 'Correction'}`,
          textColor: this.contrastColor(color),
          semantic
        };
      });
    this.cdr.markForCheck();
  }

  private openTooltip(marker: CorrectionMarker, target: HTMLElement, pinned: boolean): void {
    this.updateResponsiveMode();
    const wasMobileOpen = this.isMobile && this.activeMarker !== null;
    this.activeMarker = marker;
    this.tooltipTarget = target;
    this.isPinned = pinned || this.isMobile;
    if (this.isMobile) {
      this.tooltipPlacement = 'mobile';
      this.tooltipStyle = { visibility: 'visible' };
      if (!wasMobileOpen) this.lockBodyScroll();
      this.cdr.detectChanges();
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
      this.cdr.markForCheck();
    }
  }

  private closeTooltip(): void {
    const wasMobile = this.isMobile && this.activeMarker !== null;
    this.activeMarker = null;
    this.isPinned = false;
    this.tooltipTarget = null;
    this.tooltipStyle = { visibility: 'hidden' };
    if (wasMobile) {
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
    this.previousScrollY = window.scrollY;
    this.originalBodyStyle = document.body.style.cssText || '';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.previousScrollY}px`;
    document.body.style.width = '100%';
  }

  private unlockBodyScroll(): void {
    if (this.originalBodyStyle !== '') {
      document.body.style.cssText = this.originalBodyStyle;
    } else {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    }
    window.scrollTo(0, this.previousScrollY);
    this.previousScrollY = 0;
    this.originalBodyStyle = '';
  }
}
