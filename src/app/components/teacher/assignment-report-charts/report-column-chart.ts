import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { columnChartGeometry, roundedTopBarPath, type ColumnPoint } from './report-chart-geometry';

/**
 * A single-series column chart in hand-written inline SVG (no chart library). Responsive viewBox, theme colours,
 * the app's own font (inherited), a native hover tooltip per column, and a visually hidden data table for screen readers.
 * When `hiddenReason` is set the chart is not drawn and the reason is shown instead (small data would mislead).
 */
@Component({
  selector: 'app-report-column-chart',
  templateUrl: './report-column-chart.html',
  styleUrl: './report-column-chart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportColumnChart {
  readonly points = input<readonly ColumnPoint[]>([]);
  readonly ariaLabel = input.required<string>();
  /** What is counted, for tooltips and the summary ("submissions"). */
  readonly valueName = input('submissions');
  /** Header of the label column in the screen-reader table. */
  readonly categoryName = input('Group');
  readonly color = input('var(--color-primary)');
  /** Print the value above each column (only sensible for a few columns). */
  readonly showValues = input(false);
  readonly hiddenReason = input<string | null>(null);

  readonly width = 600;
  readonly height = 220;

  readonly geometry = computed(() => columnChartGeometry(this.points(), { width: this.width, height: this.height }));
  readonly paths = computed(() => this.geometry().bars.map((bar) => roundedTopBarPath(bar)));
  readonly viewBox = `0 0 ${this.width} ${this.height}`;
  readonly summary = computed(() => {
    const bars = this.geometry().bars;
    if (!bars.length) return `${this.ariaLabel()}: no data`;
    const top = bars.reduce((a, b) => (b.value > a.value ? b : a));
    const total = bars.reduce((sum, b) => sum + b.value, 0);
    return `${this.ariaLabel()}: ${total} ${this.valueName()} in ${bars.length} groups; highest ${top.label} with ${top.value}. Full values are in the table below.`;
  });
}
