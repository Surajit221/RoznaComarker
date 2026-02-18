import type { Rubric, RubricGrid } from '../models/rubric-grid.model';

export const RUBRIC_GRID_MAX_COLUMNS = 5;

export function createEmptyRubric(): Rubric {
  return {
    title: '',
    instructions: '',
    maxScore: 5,
    score: undefined
  };
}

export function normalizeRubric(r: Partial<Rubric> | null | undefined): Rubric {
  const title = typeof r?.title === 'string' ? r.title : '';
  const instructions = typeof r?.instructions === 'string' ? r.instructions : '';

  const maxScoreNum = Number((r as any)?.maxScore);
  const maxScore = Number.isFinite(maxScoreNum) ? Math.max(0, Math.round(maxScoreNum)) : 0;

  const scoreNum = Number((r as any)?.score);
  const score = Number.isFinite(scoreNum) ? Math.max(0, scoreNum) : undefined;

  return {
    title,
    instructions,
    maxScore,
    score
  };
}

export function normalizeRubricGrid(grid: Partial<RubricGrid> | null | undefined): RubricGrid {
  const title = typeof grid?.title === 'string' ? grid.title : '';
  const rowsIn: any[] = Array.isArray((grid as any)?.rows) ? (grid as any).rows : [];

  const normalizedRows = rowsIn.map((row: any) => {
    const rubricsIn: any[] = Array.isArray(row?.rubrics) ? row.rubrics : [];
    return {
      criteria: typeof row?.criteria === 'string' ? row.criteria : '',
      rubrics: rubricsIn.map((r) => normalizeRubric(r))
    };
  });

  const maxCols = clamp(getMaxColumns(normalizedRows), 1, RUBRIC_GRID_MAX_COLUMNS);

  const rows = normalizedRows.length
    ? normalizedRows.map((row: any) => ({
        criteria: typeof row?.criteria === 'string' ? row.criteria : '',
        rubrics: fitRubricsToColumns(row?.rubrics, maxCols)
      }))
    : [{ criteria: '', rubrics: Array.from({ length: maxCols }, () => createEmptyRubric()) }];

  return {
    title,
    rows
  };
}

export function getColumnCount(grid: RubricGrid): number {
  const rows = Array.isArray(grid?.rows) ? grid.rows : [];
  const max = getMaxColumns(rows as any);
  return clamp(max, 1, RUBRIC_GRID_MAX_COLUMNS);
}

export function addColumn(grid: RubricGrid): RubricGrid {
  const colCount = getColumnCount(grid);
  if (colCount >= RUBRIC_GRID_MAX_COLUMNS) return grid;

  return {
    ...grid,
    rows: grid.rows.map((row: { criteria: string; rubrics: Rubric[] }) => ({
      ...row,
      rubrics: [...row.rubrics, createEmptyRubric()]
    }))
  };
}

export function addRow(grid: RubricGrid): RubricGrid {
  const colCount = getColumnCount(grid);
  const firstRowRubrics = Array.isArray(grid?.rows?.[0]?.rubrics) ? grid.rows[0].rubrics : [];
  const newRow = {
    criteria: '',
    rubrics: Array.from({ length: colCount }, (_, i) => {
      const src: any = firstRowRubrics[i];
      return {
        ...createEmptyRubric(),
        title: typeof src?.title === 'string' ? src.title : '',
        maxScore: Number.isFinite(Number(src?.maxScore)) ? Math.max(0, Math.round(Number(src.maxScore))) : 5,
        instructions: ''
      };
    })
  };
  return { ...grid, rows: [...grid.rows, newRow] };
}

export function cloneRubricGrid(grid: RubricGrid): RubricGrid {
  return normalizeRubricGrid(JSON.parse(JSON.stringify(grid)));
}

export function fitRubricsToColumns(rubrics: any[], colCount: number): Rubric[] {
  const arr = Array.isArray(rubrics) ? rubrics.map((r) => normalizeRubric(r)) : [];
  const sliced = arr.slice(0, colCount);
  while (sliced.length < colCount) sliced.push(createEmptyRubric());
  return sliced;
}

function getMaxColumns(rows: Array<{ rubrics: Rubric[] }>): number {
  let max = 0;
  for (const r of rows) {
    const len = Array.isArray((r as any)?.rubrics) ? (r as any).rubrics.length : 0;
    if (len > max) max = len;
  }
  return max;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
