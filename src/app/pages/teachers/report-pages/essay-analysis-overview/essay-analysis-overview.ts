import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { issueBars, trendTiles, type OverviewIssue } from './essay-analysis-overview.util';

/** The Reports page's "Essay Analysis Overview" as bars and tiles. Display only: the page computes the values, unchanged. */
@Component({
  selector: 'app-essay-analysis-overview',
  templateUrl: './essay-analysis-overview.html',
  styleUrl: './essay-analysis-overview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EssayAnalysisOverview {
  readonly commonIssues = input<readonly OverviewIssue[] | null>([]);
  readonly performanceTrends = input<readonly string[] | null>([]);

  readonly bars = computed(() => issueBars(this.commonIssues()));
  readonly tiles = computed(() => trendTiles(this.performanceTrends()));
}
