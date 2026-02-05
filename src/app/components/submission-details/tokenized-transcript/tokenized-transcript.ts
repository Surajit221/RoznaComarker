import { CommonModule } from '@angular/common';
import { Component, Input, type SimpleChanges } from '@angular/core';

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

  tokens: TranscriptToken[] = [];

  private annotationsByWordId = new Map<string, FeedbackAnnotation[]>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ocrWords']) {
      this.tokens = this.buildTokens(Array.isArray(this.ocrWords) ? this.ocrWords : []);
    }

    if (changes['annotations']) {
      this.annotationsByWordId = this.buildAnnotationIndex(Array.isArray(this.annotations) ? this.annotations : []);
    }
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
