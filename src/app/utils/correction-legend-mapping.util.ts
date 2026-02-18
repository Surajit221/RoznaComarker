import type { CorrectionLegend, CorrectionLegendGroup } from '../models/correction-legend.model';

function normalizeKey(value: any): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function findGroupBySymbol(legend: CorrectionLegend | null | undefined, symbol: any): CorrectionLegendGroup | null {
  const sym = normalizeKey(symbol);
  if (!sym) return null;

  const groups = legend && Array.isArray(legend.groups) ? legend.groups : [];
  for (const g of groups) {
    if (!g || !Array.isArray((g as any).symbols)) continue;
    for (const s of (g as any).symbols) {
      if (!s) continue;
      const key = normalizeKey((s as any).symbol);
      if (key && key === sym) return g as CorrectionLegendGroup;
    }
  }

  return null;
}

export function applyLegendToIssue<T extends { symbol?: any; groupKey?: any; groupLabel?: any; color?: any }>(
  issue: T,
  legend: CorrectionLegend | null | undefined
): T {
  if (!issue || typeof issue !== 'object') return issue;

  const group = findGroupBySymbol(legend, (issue as any).symbol);
  if (!group) return issue;

  const color = typeof (group as any).color === 'string' && String((group as any).color).trim() ? String((group as any).color).trim() : null;
  if (!color) return issue;

  return {
    ...issue,
    groupKey: (issue as any).groupKey || (group as any).key,
    groupLabel: (issue as any).groupLabel || (group as any).label,
    color
  } as T;
}

export function applyLegendToIssues<T extends { symbol?: any; groupKey?: any; groupLabel?: any; color?: any }>(
  issues: T[] | null | undefined,
  legend: CorrectionLegend | null | undefined
): T[] {
  const list = Array.isArray(issues) ? issues : [];
  if (!legend) return list;
  return list.map((i) => applyLegendToIssue(i, legend));
}

export function applyLegendToAnnotation<T extends { symbol?: any; group?: any; color?: any }>(
  ann: T,
  legend: CorrectionLegend | null | undefined
): T {
  if (!ann || typeof ann !== 'object') return ann;

  const group = findGroupBySymbol(legend, (ann as any).symbol);
  if (!group) return ann;

  const color = typeof (group as any).color === 'string' && String((group as any).color).trim() ? String((group as any).color).trim() : null;
  if (!color) return ann;

  return {
    ...ann,
    group: (ann as any).group || (group as any).key,
    color
  } as T;
}

export function applyLegendToAnnotations<T extends { symbol?: any; group?: any; color?: any }>(
  anns: T[] | null | undefined,
  legend: CorrectionLegend | null | undefined
): T[] {
  const list = Array.isArray(anns) ? anns : [];
  if (!legend) return list;
  return list.map((a) => applyLegendToAnnotation(a, legend));
}
