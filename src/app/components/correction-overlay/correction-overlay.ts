import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';

import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox } from '../../models/ocr-token.model';

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
}

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
  @Input() annotations: FeedbackAnnotation[] | null = null;
  @Input() page = 1;
  @Input() alt = 'Uploaded submission';

  @ViewChild('overlayEl') private overlayEl?: ElementRef<HTMLElement>;
  @ViewChild('tooltipEl') private tooltipEl?: ElementRef<HTMLElement>;

  markers: CorrectionMarker[] = [];
  activeMarker: CorrectionMarker | null = null;
  isPinned = false;
  isMobile = false;
  tooltipPlacement: TooltipPlacement = 'right';
  tooltipStyle: Record<string, string> = { visibility: 'hidden' };

  private readonly cdr = inject(ChangeDetectorRef);
  private imageWidth = 0;
  private imageHeight = 0;
  private tooltipTarget: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private positionFrame: number | null = null;
  private readonly documentScrollHandler = (): void => this.schedulePosition();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['annotations'] || changes['page']) {
      this.rebuildMarkers();
      this.closeTooltip();
    }
  }

  ngAfterViewInit(): void {
    this.updateResponsiveMode();
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
  }

  onImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    this.imageWidth = image.naturalWidth;
    this.imageHeight = image.naturalHeight;
    this.rebuildMarkers();
    this.schedulePosition();
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
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    if (this.isPinned && this.activeMarker?.annotation._id === marker.annotation._id) {
      this.closeTooltip();
      return;
    }
    this.openTooltip(marker, target, true);
  }

  onMarkerKeydown(marker: CorrectionMarker, event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    this.openTooltip(marker, event.currentTarget as HTMLElement, true);
  }

  closeFromControl(event?: Event): void {
    event?.stopPropagation();
    const target = this.tooltipTarget;
    this.closeTooltip();
    target?.focus();
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

  get tip(): string {
    const annotation = this.activeMarker?.annotation as (FeedbackAnnotation & { tip?: string }) | undefined;
    return typeof annotation?.tip === 'string' ? annotation.tip.trim() : '';
  }

  private rebuildMarkers(): void {
    const annotations = Array.isArray(this.annotations) ? this.annotations : [];
    const positions: { left: number; top: number }[] = [];
    this.markers = annotations
      .filter((annotation) => annotation && Boolean(annotation.symbol?.trim()) && (!annotation.page || Number(annotation.page) === Number(this.page)))
      .map((annotation) => {
        const box = this.unionBox(annotation.bboxList || []);
        if (!box) return null;
        const usesPercentCoordinates = [box.x, box.y, box.w, box.h].every((value) => Math.abs(value) <= 100);
        const x = usesPercentCoordinates || !this.imageWidth ? box.x : (box.x / this.imageWidth) * 100;
        const y = usesPercentCoordinates || !this.imageHeight ? box.y : (box.y / this.imageHeight) * 100;
        const w = usesPercentCoordinates || !this.imageWidth ? box.w : (box.w / this.imageWidth) * 100;
        const h = usesPercentCoordinates || !this.imageHeight ? box.h : (box.h / this.imageHeight) * 100;
        const left = Math.max(0.5, Math.min(99.5, x + w));
        const top = Math.max(0.5, Math.min(99.5, y + Math.max(0, h * 0.15)));
        const nearby = positions.filter((position) => Math.abs(position.left - left) < 1.5 && Math.abs(position.top - top) < 1.5).length;
        positions.push({ left, top });
        const code = annotation.symbol!.trim();
        const color = annotation.color || '#d64545';
        return {
          annotation,
          left,
          top,
          offsetX: (nearby % 3) * 20,
          offsetY: Math.floor(nearby / 3) * 18 + (nearby % 2 ? 8 : 0),
          code,
          label: `${code}: ${annotation.group || 'Correction'}`,
          textColor: this.contrastColor(color)
        };
      })
      .filter(Boolean) as CorrectionMarker[];
    this.cdr.markForCheck();
  }

  private unionBox(boxes: OcrBBox[]): OcrBBox | null {
    const valid = boxes
      .map((box) => ({ x: Number(box?.x), y: Number(box?.y), w: Number(box?.w), h: Number(box?.h) }))
      .filter((box) => [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0);
    if (!valid.length) return null;
    const left = Math.min(...valid.map((box) => box.x));
    const top = Math.min(...valid.map((box) => box.y));
    const right = Math.max(...valid.map((box) => box.x + box.w));
    const bottom = Math.max(...valid.map((box) => box.y + box.h));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  private openTooltip(marker: CorrectionMarker, target: HTMLElement, pinned: boolean): void {
    this.activeMarker = marker;
    this.tooltipTarget = target;
    this.isPinned = pinned || this.isMobile;
    this.tooltipStyle = { visibility: 'hidden', left: '-10000px', top: '-10000px' };
    this.cdr.markForCheck();
    this.schedulePosition();
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
    const tooltip = this.tooltipEl?.nativeElement;
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
    if (!markerRect.width || !markerRect.height || !tooltipRect.width || !tooltipRect.height) return;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = tooltipRect.width;
    const height = tooltipRect.height;
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
    const next = typeof window !== 'undefined' && window.innerWidth < 768;
    if (next !== this.isMobile) {
      this.isMobile = next;
      this.cdr.markForCheck();
    }
  }

  private closeTooltip(): void {
    this.activeMarker = null;
    this.isPinned = false;
    this.tooltipTarget = null;
    this.tooltipStyle = { visibility: 'hidden' };
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
}
