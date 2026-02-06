import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, type SimpleChanges, ViewChild } from '@angular/core';

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
export class TokenizedTranscript {
  @Input() ocrWords: OcrWord[] | null = null;
  @Input() annotations: FeedbackAnnotation[] | null = null;

  @ViewChild('containerEl', { static: false }) containerEl?: ElementRef<HTMLElement>;
  @ViewChild('tooltipEl', { static: false }) tooltipEl?: ElementRef<HTMLElement>;

  tokens: TranscriptToken[] = [];

  private annotationsByWordId = new Map<string, FeedbackAnnotation[]>();

  activeWordId: string | null = null;
  tooltipText = '';
  tooltipStyle: Record<string, string> = { display: 'none' };

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ocrWords']) {
      this.tokens = this.buildTokens(Array.isArray(this.ocrWords) ? this.ocrWords : []);
    }

    if (changes['annotations']) {
      this.annotationsByWordId = this.buildAnnotationIndex(Array.isArray(this.annotations) ? this.annotations : []);
    }

    if (changes['ocrWords'] || changes['annotations']) {
      this.activeWordId = null;
      this.tooltipText = '';
      this.tooltipStyle = { display: 'none' };
    }
  }

  onWordPointerEnter(wordId: string, event: PointerEvent): void {
    // Hover only for mouse pointers.
    if ((event as any).pointerType && (event as any).pointerType !== 'mouse') return;
    this.openTooltip(wordId, event);
  }

  onWordPointerLeave(wordId: string, event: PointerEvent): void {
    if ((event as any).pointerType && (event as any).pointerType !== 'mouse') return;
    if (this.activeWordId !== wordId) return;
    this.closeTooltip();
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
      (event as any).stopPropagation?.();
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

  private openTooltip(wordId: string, event: MouseEvent | PointerEvent): void {
    const text = this.getTooltipText(wordId);
    if (!text) return;

    const container = this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    const target = event.currentTarget as HTMLElement | null;
    if (!container || !tooltip || !target) return;

    this.activeWordId = wordId;
    this.tooltipText = text;
    // Set an initial anchored position immediately so the tooltip never flashes at (0,0)
    // if measurement isn't available until a later frame.
    this.tooltipStyle = { display: 'block', left: '0%', top: '0%' };

    // Anchor near the word immediately; refined positioning happens after measurement.
    try {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const containerW = containerRect.width || 1;
      const containerH = containerRect.height || 1;
      const x = (targetRect.left - containerRect.left + targetRect.width / 2) / containerW;
      const y = (targetRect.top - containerRect.top) / containerH;
      this.tooltipStyle = { display: 'block', left: `${Math.max(0, Math.min(100, x * 100))}%`, top: `${Math.max(0, Math.min(100, y * 100))}%` };
    } catch {
      // ignore
    }

    requestAnimationFrame(() => this.repositionTooltip(target, 0));
  }

  private closeTooltip(): void {
    this.activeWordId = null;
    this.tooltipText = '';
    this.tooltipStyle = { display: 'none' };
  }

  private repositionTooltip(targetEl: HTMLElement, attempt: number): void {
    const container = this.containerEl?.nativeElement;
    const tooltip = this.tooltipEl?.nativeElement;
    if (!container || !tooltip) return;
    if (this.tooltipStyle?.['display'] === 'none') return;

    const cRect = container.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();

    const containerW = cRect.width;
    const containerH = cRect.height;
    if (!containerW || !containerH) return;

    const bboxPx = {
      x: tRect.left - cRect.left,
      y: tRect.top - cRect.top,
      w: tRect.width,
      h: tRect.height
    };

    const padding = Math.max(6, Math.min(14, Math.round(containerW * 0.02)));
    const gap = Math.max(6, Math.min(14, Math.round(containerW * 0.015)));

    const maxTooltipWidthPx = Math.max(180, Math.floor(containerW * 0.6));
    const hardMaxW = Math.max(0, Math.floor(containerW - padding * 2));
    const effectiveMaxW = Math.max(120, Math.min(maxTooltipWidthPx, hardMaxW));
    tooltip.style.maxWidth = `${effectiveMaxW}px`;

    // Force measurement after maxWidth is applied.
    const tW = Math.min(tooltip.offsetWidth || 0, effectiveMaxW);
    const tH = tooltip.offsetHeight || 0;
    if (!tW || !tH) {
      if (attempt < 3) {
        requestAnimationFrame(() => this.repositionTooltip(targetEl, attempt + 1));
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
      const fitsX = x0 >= padding && x1 <= containerW - padding;
      const fitsY = y0 >= padding && y1 <= containerH - padding;
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

    const clampPx = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const x = clampPx(chosen.x, padding, containerW - padding - tW);
    const y = clampPx(chosen.y, padding, containerH - padding - tH);

    this.tooltipStyle = {
      display: 'block',
      left: `${(x / containerW) * 100}%`,
      top: `${(y / containerH) * 100}%`,
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

    for (let i = 0; i < list.length; i += 1) {
      const w = list[i];
      const text = typeof w.text === 'string' ? w.text : '';
      if (!text) continue;

      if (prevWord) {
        const needsNewline = this.isNewLine(prevWord, w);
        if (needsNewline) {
          out.push({ kind: 'newline', trackId: `nl_${prevWord.id}_${w.id}`, value: '\n' });
        } else {
          out.push({ kind: 'space', trackId: `sp_${prevWord.id}_${w.id}`, value: ' ' });
        }
      }

      out.push({ kind: 'word', trackId: w.id, word: w });
      prevWord = w;
    }

    return out;
  }

  private isNewLine(prev: OcrWord, curr: OcrWord): boolean {
    const pb = prev.bbox;
    const cb = curr.bbox;
    if (!pb || !cb) return false;

    const prevBottom = pb.y + pb.h;
    const currTop = cb.y;

    return currTop > prevBottom + pb.h * 0.6;
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
