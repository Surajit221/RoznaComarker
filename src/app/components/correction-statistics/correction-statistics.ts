import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CanonicalCategory, CanonicalResultViewState, HOLISTIC_STATISTIC_HELP, RubricScoreLike, categoryStatistic } from '../../utils/canonical-result-state.util';

const ROWS: { category: CanonicalCategory; title: string; bar: string }[] = [
  { category: 'content', title: 'Content', bar: 'bg-red-400' }, { category: 'grammar', title: 'Grammar', bar: 'bg-green-400' },
  { category: 'organization', title: 'Organization', bar: 'bg-blue-400' }, { category: 'vocabulary', title: 'Vocabulary', bar: 'bg-purple-400' },
  { category: 'mechanics', title: 'Mechanics', bar: 'bg-yellow-400' },
];

/** The rows of the Correction Statistics card: the same on the teacher, registered student and guest pages. */
@Component({
  selector: 'app-correction-statistics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      @for (row of rows(); track row.category) {
        <div [attr.data-statistic]="row.category" [attr.title]="row.statistic.holistic ? help : null">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">{{ row.statistic.holistic ? row.title : row.title + ' Issues' }}</span>
            <span class="font-medium" data-statistic-value>{{ row.statistic.value }}</span>
          </div>
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full rounded-full" [class]="row.statistic.holistic ? 'bg-gray-400' : row.bar" [style.width]="row.width"></div>
          </div>
        </div>
      }
      @if (anyHolistic()) { <p class="text-xs text-gray-500" data-statistic-help>{{ help }}</p> }
    </div>`,
})
export class CorrectionStatistics {
  readonly state = input<CanonicalResultViewState | null>(null);
  /** The rubric scores this viewer may see. Null when marks are hidden: no score is shown then. */
  readonly rubricScores = input<Record<string, RubricScoreLike | null | undefined> | null | undefined>(null);
  /** The width of each counted category's bar, as the page works it out. */
  readonly barWidths = input<Partial<Record<CanonicalCategory, string>>>({});
  readonly help = HOLISTIC_STATISTIC_HELP;

  readonly rows = computed(() => ROWS.map(row => {
    const statistic = categoryStatistic(this.state(), row.category, this.rubricScores());
    return { ...row, statistic, width: statistic.holistic ? `${statistic.percent ?? 0}%` : this.barWidths()[row.category] ?? '0%' };
  }));
  readonly anyHolistic = computed(() => this.rows().some(row => row.statistic.holistic));
}
