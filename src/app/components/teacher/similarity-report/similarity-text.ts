import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import type { SimilarityHighlight, SimilaritySource } from '../../../api/similarity-api.service';
import { colorFor } from '../../../utils/similarity-display';

interface Segment { text: string; sourceId: string | null; number: number | null; label: string; }

/**
 * The essay with its similarity highlights. Each highlight shows its source number after the words (colour is never the only signal), can be
 * reached with the keyboard, and selects its source on click, Enter or Space. Text by interpolation only (never innerHTML).
 */
@Component({
  selector: 'app-similarity-text',
  template: `<div class="similarity-text" [class.similarity-text--plain]="!showHighlights" aria-label="Essay with similarity highlights">@for (seg of segments; track $index) {@if (seg.sourceId && showHighlights) {<mark class="similarity-mark" [class.similarity-mark--selected]="seg.sourceId === selectedSourceId"
    [style.background]="color(seg.number)" tabindex="0" role="button" [attr.aria-label]="seg.label" [attr.aria-pressed]="seg.sourceId === selectedSourceId"
    (click)="selectSource.emit(seg.sourceId)" (keydown.enter)="selectSource.emit(seg.sourceId)" (keydown.space)="$event.preventDefault(); selectSource.emit(seg.sourceId)">{{ seg.text }}<sup class="similarity-mark__number" aria-hidden="true">{{ seg.number }}</sup></mark>} @else {<span>{{ seg.text }}</span>}}</div>`,
  styles: [`
    :host { display: block; min-width: 0; }
    .similarity-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.75; font-size: 0.95rem; color: var(--color-text, #17233d); }
    .similarity-mark { color: inherit; border-radius: 3px; padding: 0 1px; border-bottom: 2px solid rgba(23, 35, 61, 0.35); cursor: pointer; }
    .similarity-mark:focus-visible { outline: 3px solid #087f83; outline-offset: 1px; }
    .similarity-mark--selected { outline: 2px solid #17233d; outline-offset: 1px; }
    .similarity-mark__number { font-size: 0.65rem; font-weight: 700; margin-left: 1px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimilarityText implements OnChanges {
  @Input() text = '';
  @Input() highlights: readonly SimilarityHighlight[] = [];
  @Input() sources: readonly SimilaritySource[] = [];
  @Input() selectedSourceId: string | null = null;
  @Input() showHighlights = true;
  @Output() readonly selectSource = new EventEmitter<string>();
  segments: Segment[] = [];
  readonly color = colorFor;

  ngOnChanges(): void {
    const text = String(this.text || '').replace(/\f/g, '');
    const offset = (i: number) => i - (String(this.text || '').slice(0, i).match(/\f/g)?.length || 0);
    const bySource = new Map(this.sources.filter(s => s.number).map(s => [s.sourceId, s]));
    const out: Segment[] = [];
    let at = 0;
    for (const h of [...this.highlights].sort((a, b) => a.start - b.start)) {
      const source = bySource.get(h.sourceId);
      const start = offset(h.start);
      const end = offset(h.end);
      if (!source || start < at || end > text.length || end <= start) continue;
      if (start > at) out.push({ text: text.slice(at, start), sourceId: null, number: null, label: '' });
      out.push({ text: text.slice(start, end), sourceId: h.sourceId, number: source.number,
        label: `Source ${source.number}, ${source.label}${source.percent !== null ? `, ${source.percent}%` : ''}` });
      at = end;
    }
    if (at < text.length) out.push({ text: text.slice(at), sourceId: null, number: null, label: '' });
    this.segments = out;
  }
}
