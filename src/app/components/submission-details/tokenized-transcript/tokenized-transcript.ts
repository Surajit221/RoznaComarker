import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, type OnChanges, type OnDestroy, type SimpleChanges, ViewChild } from '@angular/core';

import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import type { OcrWord } from '../../../models/ocr-token.model';

type TranscriptToken =
  | { kind: 'word'; trackId: string; word: OcrWord }
  | { kind: 'space'; trackId: string; value: string }
  | { kind: 'newline'; trackId: string; value: string };

@Component({
  selector: 'app-tokenized-transcript',
  imports: [CommonModule],
  templateUrl: './tokenized-transcript.html',
  styleUrl: './tokenized-transcript.css'
})
export class TokenizedTranscript implements OnChanges, OnDestroy {
  @Input() ocrWords: OcrWord[] | null = null;
  @Input() annotations: FeedbackAnnotation[] | null = null;

  @ViewChild('containerEl', { static: false }) containerEl?: ElementRef<HTMLElement>;
  @ViewChild('tooltipEl', { static: false }) tooltipEl?: ElementRef<HTMLElement>;

  tokens: TranscriptToken[] = [];

  private annotationsByWordId = new Map<string, FeedbackAnnotation[]>();
  private activeTarget: HTMLElement | null = null;
  private activeViewport: HTMLElement | null = null;
  private positionFrame: number | null = null;
  private positionVersion = 0;
  private readonly viewportScrollHandler = () => this.scheduleActiveReposition();

  activeWordId: string | null = null;
  tooltipText = '';
  tooltipStyle: Record<string, string> = { display: 'none' };

  ngOnDestroy(): void {
    this.closeTooltip();
    this.tooltipEl?.nativeElement.remove();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ocrWords']) {
      this.tokens = this.buildTokens(Array.isArray(this.ocrWords) ? this.ocrWords : []);
    }

    if (changes['annotations']) {
      this.annotationsByWordId = this.buildAnnotationIndex(Array.isArray(this.annotations) ? this.annotations : []);
    }

    if (changes['ocrWords'] || changes['annotations']) {
      this.closeTooltip();
    }
  }

  onWordPointerEnter(wordId: string, event: PointerEvent): void {
    // Hover only for mouse pointers.
    if (event.pointerType && event.pointerType !== 'mouse') return;
    this.openTooltip(wordId, event);
  }

  onWordPointerLeave(wordId: string, event: PointerEvent): void {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (this.activeWordId !== wordId) return;
    const version = this.positionVersion;
    requestAnimationFrame(() => {
      if (version === this.positionVersion && this.activeWordId === wordId) this.closeTooltip();
    });
  }

  onWordPointerDown(wordId: string, event: PointerEvent): void {
    // Tap/pen support. Also works with mouse click if user prefers.
    if (this.activeWordId === wordId) {
      this.closeTooltip();
      return;
    }

    this.openTooltip(wordId, event);

    // Avoid selecting text on touch/pen taps.
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch {
      // ignore
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.activeWordId) return;
    const container = this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    const target = event.target as Node | null;
    if (!container || !target) return;

    // If tapping inside transcript or on tooltip, do not close.
    if (container.contains(target)) return;
    if (tooltip && tooltip.contains(target)) return;

    this.closeTooltip();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeTooltip();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleActiveReposition();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scheduleActiveReposition();
  }

  private openTooltip(wordId: string, event: MouseEvent | PointerEvent): void {
    const text = this.getTooltipText(wordId);
    if (!text) return;

    const container = this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    const target = event.currentTarget as HTMLElement | null;
    if (!container || !tooltip || !target) return;

    // Keep the overlay outside transformed/backdrop-filtered cards and clipping transcript pages.
    if (tooltip.parentElement !== document.body) document.body.appendChild(tooltip);

    this.activeWordId = wordId;
    this.activeTarget = target;
    this.tooltipText = text;
    this.tooltipStyle = { display: 'block', visibility: 'hidden', left: '0px', top: '0px' };
    this.bindViewport(container.closest('.canonical-transcript-viewport') as HTMLElement | null || container);
    const version = ++this.positionVersion;
    this.scheduleReposition(target, wordId, version, 0);
  }

  private closeTooltip(): void {
    this.positionVersion += 1;
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
    this.positionFrame = null;
    this.bindViewport(null);
    this.activeWordId = null;
    this.activeTarget = null;
    this.tooltipText = '';
    this.tooltipStyle = { display: 'none' };
  }

  private bindViewport(viewport: HTMLElement | null): void {
    if (this.activeViewport === viewport) return;
    this.activeViewport?.removeEventListener('scroll', this.viewportScrollHandler);
    this.activeViewport = viewport;
    this.activeViewport?.addEventListener('scroll', this.viewportScrollHandler, { passive: true });
  }

  private scheduleActiveReposition(): void {
    if (!this.activeTarget || !this.activeWordId) return;
    this.scheduleReposition(this.activeTarget, this.activeWordId, this.positionVersion, 0);
  }

  private scheduleReposition(targetEl: HTMLElement, wordId: string, version: number, attempt: number): void {
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null;
      if (version !== this.positionVersion || wordId !== this.activeWordId || targetEl !== this.activeTarget || !targetEl.isConnected) return;
      this.repositionTooltip(targetEl, wordId, version, attempt);
    });
  }

  private repositionTooltip(targetEl: HTMLElement, wordId: string, version: number, attempt: number): void {
    const viewport = this.activeViewport || this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    if (!viewport || !tooltip) return;
    if (this.tooltipStyle?.['display'] === 'none') return;

    const viewportRect = viewport.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const browserWidth = document.documentElement.clientWidth || window.innerWidth;
    const browserHeight = document.documentElement.clientHeight || window.innerHeight;
    const bounds = {
      left: Math.max(0, viewportRect.left), top: Math.max(0, viewportRect.top),
      right: Math.min(browserWidth, viewportRect.right), bottom: Math.min(browserHeight, viewportRect.bottom)
    };
    const containerW = bounds.right - bounds.left;
    const containerH = bounds.bottom - bounds.top;
    if (!containerW || !containerH || tRect.bottom < bounds.top || tRect.top > bounds.bottom
      || tRect.right < bounds.left || tRect.left > bounds.right) {
      this.closeTooltip();
      return;
    }

    const padding = Math.max(6, Math.min(14, Math.round(containerW * 0.02)));
    const gap = Math.max(6, Math.min(14, Math.round(containerW * 0.015)));

    const maxTooltipWidthPx = Math.max(180, Math.floor(containerW * 0.6));
    const hardMaxW = Math.max(0, Math.floor(containerW - padding * 2));
    const effectiveMaxW = Math.max(120, Math.min(maxTooltipWidthPx, hardMaxW));
    tooltip.style.maxWidth = `${effectiveMaxW}px`;
    tooltip.style.maxHeight = `${Math.max(80, Math.floor(containerH * 0.55))}px`;

    // Force measurement after maxWidth is applied.
    const tW = Math.min(tooltip.offsetWidth || 0, effectiveMaxW);
    const tH = tooltip.offsetHeight || 0;
    if (!tW || !tH) {
      if (attempt < 3) {
        this.scheduleReposition(targetEl, wordId, version, attempt + 1);
      }
      return;
    }

    const candidates: { placement: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number }[] = [
      {
        placement: 'top',
        x: tRect.left + tRect.width / 2 - tW / 2,
        y: tRect.top - gap - tH,
      },
      {
        placement: 'bottom',
        x: tRect.left + tRect.width / 2 - tW / 2,
        y: tRect.bottom + gap,
      },
      {
        placement: 'right',
        x: tRect.right + gap,
        y: tRect.top + tRect.height / 2 - tH / 2,
      },
      {
        placement: 'left',
        x: tRect.left - gap - tW,
        y: tRect.top + tRect.height / 2 - tH / 2,
      },
    ];

    const within = (x: number, y: number) => {
      const x0 = x;
      const y0 = y;
      const x1 = x + tW;
      const y1 = y + tH;
      const fitsX = x0 >= bounds.left + padding && x1 <= bounds.right - padding;
      const fitsY = y0 >= bounds.top + padding && y1 <= bounds.bottom - padding;
      return { fitsX, fitsY, fits: fitsX && fitsY };
    };

    const preferredOrder: ('top' | 'bottom' | 'right' | 'left')[] = ['top', 'bottom', 'right', 'left'];
    let chosen = candidates[0];
    for (const p of preferredOrder) {
      const c = candidates.find((x) => x.placement === p)!;
      if (within(c.x, c.y).fits) {
        chosen = c;
        break;
      }
    }

    const clampPx = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const x = clampPx(chosen.x, bounds.left + padding, bounds.right - padding - tW);
    const y = clampPx(chosen.y, bounds.top + padding, bounds.bottom - padding - tH);
    const positioningElement = tooltip.offsetParent as HTMLElement | null;
    const positioningRect = (positioningElement || document.documentElement).getBoundingClientRect();
    const localLeft = x - positioningRect.left;
    const localTop = y - positioningRect.top;

    this.tooltipStyle = {
      display: 'block',
      visibility: 'visible',
      left: `${localLeft}px`,
      top: `${localTop}px`,
      '--tooltip-placement': chosen.placement,
    } as Record<string, string>;
  }

  getWordAnnotations(wordId: string): FeedbackAnnotation[] {
    return this.annotationsByWordId.get(wordId) || [];
  }

  getHighlightStyle(wordId: string): Record<string, string> | null {
    const anns = this.getWordAnnotations(wordId);
    if (!anns.length) return null;

    const colors = anns
      .map((a) => (typeof a.color === 'string' ? a.color.trim() : ''))
      .filter(Boolean);

    if (!colors.length) {
      return {
        'border-bottom-color': '#FFC107',
        background: 'rgba(255, 193, 7, 0.15)'
      };
    }

    if (colors.length === 1) {
      return {
        'border-bottom-color': colors[0],
        background: this.toRgba(colors[0], 0.18)
      };
    }

    const stops = colors
      .slice(0, 4)
      .map((c, idx, arr) => {
        const start = Math.round((idx * 100) / arr.length);
        const end = Math.round(((idx + 1) * 100) / arr.length);
        const rgba = this.toRgba(c, 0.18);
        return `${rgba} ${start}% ${end}%`;
      })
      .join(', ');

    return {
      'border-bottom-color': colors[0],
      background: `linear-gradient(90deg, ${stops})`
    };
  }

  getTooltipText(wordId: string): string {
    const anns = this.getWordAnnotations(wordId);
    if (!anns.length) return '';

    return anns
      .map((a) => {
        const symbol = typeof a.symbol === 'string' ? a.symbol.trim() : '';
        const message = typeof a.message === 'string' ? a.message.trim() : '';
        const suggestedText = typeof a.suggestedText === 'string' ? a.suggestedText.trim() : '';

        const base = [symbol, message].filter(Boolean).join(' - ');
        return suggestedText ? `${base}\nSuggestion: ${suggestedText}` : base;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private buildAnnotationIndex(annotations: FeedbackAnnotation[]): Map<string, FeedbackAnnotation[]> {
    const map = new Map<string, FeedbackAnnotation[]>();

    for (const ann of annotations) {
      if (!ann || typeof ann !== 'object') continue;
      const wordIds = Array.isArray(ann.wordIds) ? ann.wordIds : [];
      for (const wordId of wordIds) {
        if (typeof wordId !== 'string' || !wordId) continue;
        if (!map.has(wordId)) map.set(wordId, []);
        map.get(wordId)!.push(ann);
      }
    }

    return map;
  }

  private buildTokens(words: OcrWord[]): TranscriptToken[] {
    const out: TranscriptToken[] = [];
    const list = Array.isArray(words) ? words.filter((w) => w && typeof w.id === 'string') : [];

    let prevWord: OcrWord | null = null;

    for (const w of list) {
      const text = typeof w.text === 'string' ? w.text : '';
      if (!text) continue;

      if (prevWord) {
        const separator = typeof w.separatorBefore === 'string'
          ? w.separatorBefore
          : ' ';
        if (separator === '\n\n') out.push({ kind: 'newline', trackId: `nl_${prevWord.id}_${w.id}`, value: separator });
        if (separator === ' ' || separator === '\n') out.push({ kind: 'space', trackId: `sp_${prevWord.id}_${w.id}`, value: ' ' });
      }

      out.push({ kind: 'word', trackId: w.id, word: w });
      prevWord = w;
    }

    return out;
  }

  private toRgba(color: string, alpha: number): string {
    const c = String(color || '').trim();
    const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 0.18;

    if (!c) return `rgba(255, 193, 7, ${a})`;

    if (c.startsWith('#')) {
      const hex = c.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if ([r, g, b].every(Number.isFinite)) return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return `rgba(${r}, ${g}, ${b}, ${a})`;
      }
    }

    if (c.startsWith('rgba(')) {
      return c;
    }

    if (c.startsWith('rgb(')) {
      const inner = c.slice(4, -1);
      return `rgba(${inner}, ${a})`;
    }

    return c;
  }
}
