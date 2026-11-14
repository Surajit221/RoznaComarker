import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ReportBarItem {
  key: string;
  label: string;
  /** Bar length, 0-100 (clamped). */
  percent: number;
  /** The value as text, always shown beside the bar ("80%", "4 corrections"). */
  valueText: string;
  /** Bar colour; the theme primary when absent. Text never takes this colour. */
  color?: string | null;
  /** Marked in words and with an icon, never by colour alone. */
  marker?: 'strongest' | 'weakest' | null;
  /** Optional secondary text under the label. */
  detail?: string | null;
}

/**
 * Horizontal bars as an accessible list (HTML, so long criterion names wrap). Each row carries its label and value as text,
 * so the bars themselves are decorative for screen readers.
 */
@Component({
  selector: 'app-report-bar-list',
  templateUrl: './report-bar-list.html',
  styleUrl: './report-bar-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBarList {
  readonly items = input<readonly ReportBarItem[]>([]);
  readonly ariaLabel = input.required<string>();
  readonly emptyText = input('No data yet.');

  readonly rows = computed(() => this.items().map((item) => ({
    ...item,
    width: Math.max(0, Math.min(100, Number.isFinite(item.percent) ? item.percent : 0)),
    fill: item.color || 'var(--color-primary)',
  })));
}
