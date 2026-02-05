import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { CorrectionLegend, CorrectionLegendGroup, CorrectionLegendSymbol } from '../../models/correction-legend.model';

type SymbolRowVm = {
  groupKey: string;
  groupLabel: string;
  groupColor: string | null;
  symbol: string;
  label: string;
  description?: string;
  count: number;
};

type GroupVm = {
  key: string;
  label: string;
  color: string | null;
  totalCount: number;
  symbols: SymbolRowVm[];
};

export type FeedbackSummaryFilter =
  | { groupKey: string; symbol?: undefined }
  | { groupKey: string; symbol: string }
  | null;

@Component({
  selector: 'app-feedback-summary',
  imports: [CommonModule],
  templateUrl: './feedback-summary.html',
  styleUrl: './feedback-summary.css',
})
export class FeedbackSummaryComponent implements OnChanges {
  @Input() annotations: FeedbackAnnotation[] | null = null;
  @Input() correctionLegend: CorrectionLegend | null = null;

  @Input() activeFilter: FeedbackSummaryFilter = null;

  @Output() filterChange = new EventEmitter<FeedbackSummaryFilter>();

  groups: GroupVm[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['annotations'] || changes['correctionLegend']) {
      this.rebuildVm();
    }
  }

  onToggleGroup(group: GroupVm): void {
    if (this.activeFilter && this.activeFilter.groupKey === group.key && !this.activeFilter.symbol) {
      this.filterChange.emit(null);
      return;
    }

    this.filterChange.emit({ groupKey: group.key });
  }

  onToggleSymbol(row: SymbolRowVm): void {
    if (
      this.activeFilter &&
      this.activeFilter.groupKey === row.groupKey &&
      this.activeFilter.symbol === row.symbol
    ) {
      this.filterChange.emit(null);
      return;
    }

    this.filterChange.emit({ groupKey: row.groupKey, symbol: row.symbol });
  }

  isGroupActive(groupKey: string): boolean {
    return Boolean(this.activeFilter && this.activeFilter.groupKey === groupKey && !this.activeFilter.symbol);
  }

  isSymbolActive(groupKey: string, symbol: string): boolean {
    return Boolean(this.activeFilter && this.activeFilter.groupKey === groupKey && this.activeFilter.symbol === symbol);
  }

  private rebuildVm(): void {
    const legend = this.correctionLegend;
    const groups = legend && Array.isArray(legend.groups) ? legend.groups : [];
    const anns = Array.isArray(this.annotations) ? this.annotations : [];

    this.groups = groups
      .filter((g) => g && typeof g.key === 'string' && Array.isArray(g.symbols))
      .map((g) => this.buildGroupVm(g, anns));
  }

  private buildGroupVm(group: CorrectionLegendGroup, annotations: FeedbackAnnotation[]): GroupVm {
    const groupKey = String(group.key || '').trim();
    const groupLabel = String(group.label || '').trim();
    const groupColor = group.color ? String(group.color) : null;

    const symbols = (group.symbols || [])
      .filter((s) => s && typeof s.symbol === 'string')
      .map((s) => this.buildSymbolVm(groupKey, groupLabel, groupColor, s, annotations));

    const totalCount = symbols.reduce((sum, s) => sum + s.count, 0);

    return {
      key: groupKey,
      label: groupLabel,
      color: groupColor,
      totalCount,
      symbols,
    };
  }

  private buildSymbolVm(
    groupKey: string,
    groupLabel: string,
    groupColor: string | null,
    sym: CorrectionLegendSymbol,
    annotations: FeedbackAnnotation[]
  ): SymbolRowVm {
    const symbol = String(sym.symbol || '').trim();
    const label = String(sym.label || '').trim();

    const count = this.countMatchingAnnotations({ groupKey, groupLabel, symbol, annotations });

    return {
      groupKey,
      groupLabel,
      groupColor,
      symbol,
      label,
      description: sym.description,
      count,
    };
  }

  private countMatchingAnnotations(args: {
    groupKey: string;
    groupLabel: string;
    symbol: string;
    annotations: FeedbackAnnotation[];
  }): number {
    const targetGroupKey = this.normalizeKey(args.groupKey);
    const targetGroupLabel = this.normalizeKey(args.groupLabel);
    const targetSymbol = this.normalizeKey(args.symbol);

    let count = 0;

    for (const a of args.annotations) {
      if (!a) continue;

      const sym = this.normalizeKey(a.symbol || '');
      if (!sym || sym !== targetSymbol) continue;

      const annGroupRaw = typeof a.group === 'string' ? a.group : '';
      const annGroup = this.normalizeKey(annGroupRaw);

      // If backend provides group, use it to disambiguate duplicates like "WF".
      if (annGroup) {
        if (annGroup === targetGroupKey || annGroup === targetGroupLabel) {
          count += 1;
        }
        continue;
      }

      // If group is absent, fall back to symbol-only counting.
      count += 1;
    }

    return count;
  }

  private normalizeKey(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  toRgba(color: string | null, alpha: number): string {
    if (!color) return `rgba(255, 193, 7, ${alpha})`;

    const c = color.trim();

    if (c.startsWith('#')) {
      const hex = c.slice(1);
      const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;

      if (full.length === 6) {
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        if ([r, g, b].every((v) => Number.isFinite(v))) {
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
    }

    return `rgba(255, 193, 7, ${alpha})`;
  }
}
