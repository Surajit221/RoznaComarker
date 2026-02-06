import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox } from '../../models/ocr-token.model';

type WritingCorrectionsImageAnnotation = {
  page: number;
  bbox: { x: number; y: number; width: number; height: number };
  legendKey: string;
  message: string;
  suggestion: string;
  color?: string;
};

type OverlayBox = {
  annotationId: string;
  page?: number;
  bbox: OcrBBox;
  color: string | null;
  symbol: string;
  group: string;
  message: string;
};

@Component({
  selector: 'app-image-annotation-overlay',
  imports: [CommonModule],
  templateUrl: './image-annotation-overlay.html',
  styleUrl: './image-annotation-overlay.css',
})
export class ImageAnnotationOverlayComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() imageUrl: string | null = null;
  @Input() annotations: FeedbackAnnotation[] | null = null;
  @Input() imageAnnotations: WritingCorrectionsImageAnnotation[] | null = null;
  @Input() page: number | null = null;
  @Input() role: 'student' | 'teacher' = 'student';

  @ViewChild('imgEl', { static: false }) imgEl?: ElementRef<HTMLImageElement>;
  @ViewChild('containerEl', { static: false }) containerEl?: ElementRef<HTMLElement>;
  @ViewChild('tooltipEl', { static: false }) tooltipEl?: ElementRef<HTMLElement>;

  overlayBoxes: OverlayBox[] = [];

  private naturalWidth = 0;
  private naturalHeight = 0;
  private renderedWidth = 0;
  private renderedHeight = 0;

  private resizeObserver: ResizeObserver | null = null;

  activeBox: OverlayBox | null = null;
  tooltipText = '';
  tooltipStyle: Record<string, string> = { display: 'none' };

  ngAfterViewInit(): void {
    const img = this.imgEl?.nativeElement;
    if (!img) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.recomputeRenderedSize();
      this.repositionTooltip(0);
    });

    this.resizeObserver.observe(img);

    // If already loaded from cache
    if (img.complete && img.naturalWidth > 0) {
      this.naturalWidth = img.naturalWidth;
      this.naturalHeight = img.naturalHeight;
      this.recomputeRenderedSize();
      this.rebuildOverlayBoxes();
      this.repositionTooltip(0);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['annotations'] || changes['imageAnnotations'] || changes['page']) {
      this.rebuildOverlayBoxes();
    }

    if (changes['imageUrl']) {
      // Reset until the new image loads
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.renderedWidth = 0;
      this.renderedHeight = 0;
      this.overlayBoxes = [];
      this.activeBox = null;
      this.tooltipText = '';
      this.tooltipStyle = { display: 'none' };
    }
  }

  ngOnDestroy(): void {
    const img = this.imgEl?.nativeElement;
    if (img && this.resizeObserver) {
      try {
        this.resizeObserver.unobserve(img);
      } catch {
        // ignore
      }
    }
    this.resizeObserver = null;
  }

  onImageLoad(): void {
    const img = this.imgEl?.nativeElement;
    if (!img) return;

    this.naturalWidth = img.naturalWidth;
    this.naturalHeight = img.naturalHeight;

    this.recomputeRenderedSize();
    this.rebuildOverlayBoxes();
    this.repositionTooltip(0);
  }

  private recomputeRenderedSize(): void {
    const img = this.imgEl?.nativeElement;
    if (!img) return;

    // Use layout size (not natural size)
    const rect = img.getBoundingClientRect();
    this.renderedWidth = rect.width;
    this.renderedHeight = rect.height;
  }

  onBoxEnter(box: OverlayBox): void {
    this.activeBox = box;
    this.tooltipText = this.getTooltipText(box);
    // Set an initial anchored position immediately so the tooltip never flashes at (0,0)
    // if measurement isn't available until a later frame.
    this.tooltipStyle = { display: 'block', left: '0%', top: '0%' };

    const normalized = this.normalizeBboxToPercent(box.bbox);
    if (normalized) {
      const clamped = this.clampBboxPercent(normalized);
      const anchorX = Math.max(0, Math.min(100, clamped.x + clamped.w / 2));
      const anchorY = Math.max(0, Math.min(100, clamped.y));
      this.tooltipStyle = { display: 'block', left: `${anchorX}%`, top: `${anchorY}%` };
    }

    // Wait for tooltip to render so we can measure and clamp precisely.
    requestAnimationFrame(() => this.repositionTooltip(0));
  }

  onBoxLeave(box: OverlayBox): void {
    if (this.activeBox?.annotationId !== box.annotationId) return;
    this.activeBox = null;
    this.tooltipText = '';
    this.tooltipStyle = { display: 'none' };
  }

  private repositionTooltip(attempt: number): void {
    const box = this.activeBox;
    const container = this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    if (!box || !container || !tooltip) return;
    if (!this.renderedWidth || !this.renderedHeight) return;

    const normalized = this.normalizeBboxToPercent(box.bbox);
    if (!normalized) return;
    const clamped = this.clampBboxPercent(normalized);

    const bboxPx = {
      x: (clamped.x / 100) * this.renderedWidth,
      y: (clamped.y / 100) * this.renderedHeight,
      w: (clamped.w / 100) * this.renderedWidth,
      h: (clamped.h / 100) * this.renderedHeight,
    };

    const padding = Math.max(6, Math.min(14, Math.round(this.renderedWidth * 0.012)));
    const gap = Math.max(6, Math.min(14, Math.round(this.renderedWidth * 0.01)));

    const maxTooltipWidthPx = Math.max(160, Math.floor(this.renderedWidth * 0.4));
    const hardMaxW = Math.max(0, Math.floor(this.renderedWidth - padding * 2));
    const effectiveMaxW = Math.max(120, Math.min(maxTooltipWidthPx, hardMaxW));
    tooltip.style.maxWidth = `${effectiveMaxW}px`;

    // Force measurement after maxWidth is applied.
    const tW = Math.min(tooltip.offsetWidth || 0, effectiveMaxW);
    const tH = tooltip.offsetHeight || 0;
    if (!tW || !tH) {
      if (attempt < 3) {
        requestAnimationFrame(() => this.repositionTooltip(attempt + 1));
      }
      return;
    }

    const candidates: Array<{ placement: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number }>= [
      {
        placement: 'top',
        x: bboxPx.x + bboxPx.w / 2 - tW / 2,
        y: bboxPx.y - gap - tH,
      },
      {
        placement: 'bottom',
        x: bboxPx.x + bboxPx.w / 2 - tW / 2,
        y: bboxPx.y + bboxPx.h + gap,
      },
      {
        placement: 'right',
        x: bboxPx.x + bboxPx.w + gap,
        y: bboxPx.y + bboxPx.h / 2 - tH / 2,
      },
      {
        placement: 'left',
        x: bboxPx.x - gap - tW,
        y: bboxPx.y + bboxPx.h / 2 - tH / 2,
      },
    ];

    const within = (x: number, y: number) => {
      const x0 = x;
      const y0 = y;
      const x1 = x + tW;
      const y1 = y + tH;
      const fitsX = x0 >= padding && x1 <= this.renderedWidth - padding;
      const fitsY = y0 >= padding && y1 <= this.renderedHeight - padding;
      return { fitsX, fitsY, fits: fitsX && fitsY };
    };

    const preferredOrder: Array<'top' | 'bottom' | 'right' | 'left'> = ['top', 'bottom', 'right', 'left'];
    let chosen = candidates[0];
    for (const p of preferredOrder) {
      const c = candidates.find((x) => x.placement === p)!;
      if (within(c.x, c.y).fits) {
        chosen = c;
        break;
      }
    }

    // Clamp inside container (strict boundary enforcement)
    const clampPx = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const x = clampPx(chosen.x, padding, this.renderedWidth - padding - tW);
    const y = clampPx(chosen.y, padding, this.renderedHeight - padding - tH);

    this.tooltipStyle = {
      display: 'block',
      left: `${(x / this.renderedWidth) * 100}%`,
      top: `${(y / this.renderedHeight) * 100}%`,
      '--tooltip-placement': chosen.placement,
    } as Record<string, string>;
  }

  private rebuildOverlayBoxes(): void {
    const anns = Array.isArray(this.annotations) ? this.annotations : [];
    const writingIssues = Array.isArray(this.imageAnnotations) ? this.imageAnnotations : [];
    const pageFilter = this.page;

    const out: OverlayBox[] = [];

    for (const a of anns) {
      if (!a) continue;
      if (typeof pageFilter === 'number' && a.page !== pageFilter) continue;

      const bboxList = Array.isArray(a.bboxList) ? a.bboxList : [];
      for (const bbox of bboxList) {
        if (!bbox) continue;
        if (![bbox.x, bbox.y, bbox.w, bbox.h].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
        if (bbox.w <= 0 || bbox.h <= 0) continue;

        out.push({
          annotationId: a._id,
          page: a.page,
          bbox,
          color: a.color || null,
          symbol: a.symbol || '',
          group: a.group || '',
          message: a.message || '',
        });
      }
    }

    for (const a of writingIssues) {
      if (!a) continue;
      if (typeof pageFilter === 'number' && a.page !== pageFilter) continue;

      const bbox = a.bbox;
      if (!bbox) continue;
      if (![bbox.x, bbox.y, bbox.width, bbox.height].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      if (bbox.width <= 0 || bbox.height <= 0) continue;

      out.push({
        annotationId: `lt_${a.page}_${a.legendKey}_${Math.round(bbox.x * 100)}_${Math.round(bbox.y * 100)}_${Math.round(bbox.width * 100)}_${Math.round(bbox.height * 100)}`,
        page: a.page,
        bbox: {
          x: bbox.x,
          y: bbox.y,
          w: bbox.width,
          h: bbox.height
        },
        color: a.color || null,
        symbol: a.legendKey,
        group: 'Quick Check',
        message: a.suggestion ? `${a.message}\nSuggestion: ${a.suggestion}` : a.message
      });
    }

    this.overlayBoxes = out;
  }

  getBoxStyle(box: OverlayBox): Record<string, string> {
    const normalized = this.normalizeBboxToPercent(box.bbox);
    if (!normalized) return { display: 'none' };

    const clamped = this.clampBboxPercent(normalized);

    const fontPx = this.computeBoxFontPx(clamped);

    return {
      left: `${clamped.x}%`,
      top: `${clamped.y}%`,
      width: `${clamped.w}%`,
      height: `${clamped.h}%`,
      backgroundColor: this.toRgba(box.color, 0.18),
      borderColor: box.color || 'rgba(255,0,0,0.6)',
      '--box-font-size': `${fontPx}px`
    };
  }

  private computeBoxFontPx(clampedPercentBbox: OcrBBox): number {
    if (!this.renderedWidth || !this.renderedHeight) return 11;

    const hPx = (clampedPercentBbox.h / 100) * this.renderedHeight;
    const wPx = (clampedPercentBbox.w / 100) * this.renderedWidth;

    // Keep readable but never oversized for small boxes.
    const base = Math.min(hPx * 0.45, wPx * 0.12);
    const size = Math.max(9, Math.min(14, Math.floor(base)));
    return Number.isFinite(size) ? size : 11;
  }

  getBoxEdgeClass(box: OverlayBox): Record<string, boolean> {
    const normalized = this.normalizeBboxToPercent(box.bbox);
    if (!normalized) return {};

    const clamped = this.clampBboxPercent(normalized);
    const xPct = clamped.x / 100;

    return {
      'edge-left': xPct < 0.15,
      'edge-right': xPct > 0.85,
    };
  }

  getTooltipText(box: OverlayBox): string {
    const parts: string[] = [];
    if (box.symbol) parts.push(box.symbol);
    if (box.group) parts.push(`Group: ${box.group}`);
    if (box.message) parts.push(box.message);
    return parts.join('\n');
  }

  private toRgba(color: string | null, alpha: number): string {
    if (!color) return `rgba(255, 193, 7, ${alpha})`;

    const c = color.trim();

    // #RGB or #RRGGBB
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      const full = hex.length === 3
        ? hex.split('').map((ch) => ch + ch).join('')
        : hex;

      if (full.length === 6) {
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        if ([r, g, b].every((v) => Number.isFinite(v))) {
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
    }

    // fall back to using the provided CSS color as border and a safe highlight bg
    return `rgba(255, 193, 7, ${alpha})`;
  }

  private normalizeBboxToPercent(bbox: OcrBBox): OcrBBox | null {
    if (!bbox) return null;

    const x = Number(bbox.x);
    const y = Number(bbox.y);
    const w = Number(bbox.w);
    const h = Number(bbox.h);

    if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
    if (w <= 0 || h <= 0) return null;

    // Accept three input formats defensively:
    // 1) ratio (0..1)
    // 2) percent (0..100)
    // 3) pixels (convert via natural image dimensions)
    const allWithin01 = [x, y, w, h].every((v) => v >= 0 && v <= 1);
    if (allWithin01) {
      return { x: x * 100, y: y * 100, w: w * 100, h: h * 100 };
    }

    const allWithin0100 = [x, y, w, h].every((v) => v >= 0 && v <= 100);
    if (allWithin0100) {
      return { x, y, w, h };
    }

    if (!this.naturalWidth || !this.naturalHeight) return null;

    return {
      x: (x / this.naturalWidth) * 100,
      y: (y / this.naturalHeight) * 100,
      w: (w / this.naturalWidth) * 100,
      h: (h / this.naturalHeight) * 100,
    };
  }

  private clampBboxPercent(bbox: OcrBBox): OcrBBox {
    const clamp = (n: number) => Math.max(0, Math.min(100, n));

    const x = clamp(bbox.x);
    const y = clamp(bbox.y);
    const w = clamp(bbox.w);
    const h = clamp(bbox.h);

    const maxW = Math.max(0, 100 - x);
    const maxH = Math.max(0, 100 - y);

    return {
      x,
      y,
      w: Math.min(w, maxW),
      h: Math.min(h, maxH)
    };
  }
}
