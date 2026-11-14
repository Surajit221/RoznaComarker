import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CanonicalCategory, CanonicalResultViewState, CodedCorrection, categoryCodeCounts, categoryStatistic } from '../../utils/canonical-result-state.util';
import { sortByAssessmentCategory } from '../../constants/assessment-categories';

export const ROWS: { category: CanonicalCategory; title: string; bar: string }[] = sortByAssessmentCategory([
  { category: 'content', title: 'Content', bar: 'bg-red-400' }, { category: 'grammar', title: 'Grammar', bar: 'bg-green-400' },
  { category: 'organization', title: 'Organization', bar: 'bg-blue-400' }, { category: 'vocabulary', title: 'Vocabulary', bar: 'bg-purple-400' },
  { category: 'mechanics', title: 'Mechanics', bar: 'bg-yellow-400' },
], row => row.category);

/** The rows of the Correction Statistics card: the same on the teacher, registered student and guest pages. */
@Component({
  selector: 'app-correction-statistics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      @for (row of rows(); track row.category) {
        <div [attr.data-statistic]="row.category">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">{{ row.title }} Issues</span>
            <span class="font-medium" data-statistic-value>{{ row.statistic.value }}</span>
          </div>
          @if (row.codes) { <p class="text-xs text-gray-500 mb-1" data-statistic-codes [attr.aria-label]="row.title + ' issue types: ' + row.codes">{{ row.codes }}</p> }
          <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full rounded-full" [class]="row.bar" [style.width]="row.width"></div>
          </div>
        </div>
      }
    </div>`,
})
export class CorrectionStatistics {
  readonly state = input<CanonicalResultViewState | null>(null);
  /** The corrections this viewer sees, for the issue types of each row. */
  readonly corrections = input<readonly CodedCorrection[] | null>(null);
  /** The width of each category's bar, as the page works it out. */
  readonly barWidths = input<Partial<Record<CanonicalCategory, string>>>({});

  readonly rows = computed(() => ROWS.map(row => {
    const statistic = categoryStatistic(this.state(), row.category);
    return { ...row, statistic, codes: categoryCodeCounts(this.corrections(), row.category, statistic.value), width: this.barWidths()[row.category] ?? '0%' };
  }));
}
