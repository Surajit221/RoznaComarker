import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';

import type { CorrectionLegend } from '../../models/correction-legend.model';

@Component({
  selector: 'app-writing-corrections-legend',
  imports: [CommonModule],
  templateUrl: './writing-corrections-legend.html',
  styleUrl: './writing-corrections-legend.css'
})
export class WritingCorrectionsLegendComponent implements AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  @Input() legend: CorrectionLegend | null = null;
  @Output() closeRequested = new EventEmitter<void>();

  ngAfterViewInit(): void {
    if (this.isDialog()) {
      queueMicrotask(() => ((this.host.nativeElement as HTMLElement).querySelector('.legend-close-btn') as HTMLButtonElement | null)?.focus());
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.isDialog()) return;
    event.preventDefault();
    this.closeLegend();
  }

  closeLegend(): void {
    this.closeRequested.emit();
  }

  private isDialog(): boolean {
    return this.host.nativeElement.classList.contains('mobile-bottom-sheet');
  }

  toRgba(color: string | null | undefined, alpha: number): string {
    const c = typeof color === 'string' ? color.trim() : '';
    const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 0.25;

    if (!c.startsWith('#')) {
      return `rgba(255, 193, 7, ${a})`;
    }

    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;

    if (full.length !== 6) {
      return `rgba(255, 193, 7, ${a})`;
    }

    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);

    if (![r, g, b].every((v) => Number.isFinite(v))) {
      return `rgba(255, 193, 7, ${a})`;
    }

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}
