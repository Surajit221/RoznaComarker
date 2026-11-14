import { columnChartGeometry, roundedTopBarPath } from './report-chart-geometry';
import { REPORT_CHART_GEOMETRY_GOLDEN } from './report-chart-geometry.golden';

// The PDF (backend) draws the same charts from a port of this geometry. Both repos check the same golden values
// (backend: tests/fixtures/reportChartGeometry.golden.cjs), so a change on one side without the other fails a test.
describe('report chart geometry golden values (shared with the backend PDF)', () => {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  for (const [name, golden] of Object.entries(REPORT_CHART_GEOMETRY_GOLDEN.cases)) {
    it(`matches the golden case ${name}`, () => {
      const g = columnChartGeometry(golden.points as unknown as { label: string; value: number }[], REPORT_CHART_GEOMETRY_GOLDEN.size);
      expect(g.maxValue).toBe(golden.maxValue);
      expect(g.bars.map((b) => ({ x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height), showLabel: b.showLabel, path: roundedTopBarPath(b) })))
        .toEqual(golden.bars as unknown as never[]);
      expect(g.ticks.map((t) => ({ value: t.value, y: r(t.y) }))).toEqual(golden.ticks as unknown as never[]);
    });
  }
});
