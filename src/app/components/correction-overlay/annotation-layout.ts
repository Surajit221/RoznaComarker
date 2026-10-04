import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { AnnotationSegment, AnnotationVisual } from './annotation-geometry';

export interface AnnotationGroup {
  id: string;
  annotations: FeedbackAnnotation[];
  semantic: boolean;
  lineKeys: Set<string>;
  anchorLeft: number;
  anchorTop: number;
  left: number;
  top: number;
  width: number;
  code: string;
  label: string;
}
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const signature = (s: AnnotationSegment): string => [s.left, s.top, s.width, s.height || 0, Number(!!s.boundary)]
  .map((n) => n.toFixed(3)).join(':');

/** Shared strokes retain membership, so selecting any original correction highlights its geometry. */
export function sharedSegments(visuals: AnnotationVisual[], semantic: boolean): AnnotationSegment[] {
  const unique = new Map<string, AnnotationSegment>();
  for (const visual of visuals) {
    if (visual.semantic !== semantic) continue;
    for (const segment of visual.segments) {
      const key = signature(segment);
      const existing = unique.get(key);
      if (existing) existing.correctionIds.push(...segment.correctionIds);
      else unique.set(key, { ...segment, correctionIds: [...segment.correctionIds] });
    }
  }
  if (semantic) return [...unique.values()];
  // Sweep overlapping baselines into a single lane, retaining exact horizontal intervals.
  // This prevents unlimited overpainting without changing any canonical target or count.
  const rows = new Map<string, AnnotationSegment[]>();
  for (const segment of unique.values()) {
    const key = `${!!segment.boundary}:${segment.lineKey || segment.top.toFixed(1)}`;
    const row = rows.get(key) || []; row.push(segment); rows.set(key, row);
  }
  const result: AnnotationSegment[] = [];
  for (const row of rows.values()) {
    const events = row.flatMap((s) => [{ x: s.left, s, add: true }, { x: s.left + s.width, s, add: false }])
      .sort((a, b) => a.x - b.x);
    const active = new Set<AnnotationSegment>();
    let previous = events[0].x;
    for (const event of events) {
      if (event.x > previous && active.size) {
        const first = active.values().next().value!;
        result.push({ ...first, id: `${first.id}:${previous}`, left: previous, width: event.x - previous,
          top: Math.max(...[...active].map((s) => s.top)),
          correctionIds: [...new Set([...active].flatMap((s) => s.correctionIds))] });
      }
      if (event.add) active.add(event.s); else active.delete(event.s);
      previous = event.x;
    }
  }
  return result;
}

function label(group: AnnotationGroup): void {
  const first = group.annotations[0];
  const count = group.annotations.length;
  const category = first.category || first.group;
  const sameCategory = group.annotations.every((a) => (a.category || a.group) === category);
  group.code = count === 1 ? first.symbol?.trim() || 'Issue'
    : sameCategory ? `${first.symbol?.trim() || 'Issue'} +${count - 1}` : `${count} Issues`;
  group.width = Math.max(30, Math.min(92, group.code.length * 6 + 14));
  group.label = `${count} correction${count === 1 ? '' : 's'}: `
    + group.annotations.map((a) => `${a.symbol || 'Issue'} ${a.group || a.category || ''}`).join('; ');
}

/** Deterministic grouping; spatial bins avoid scanning all previously placed badges. */
export function layoutAnnotationGroups(visuals: AnnotationVisual[], width: number, height: number,
  densityCellWidth = 110): AnnotationGroup[] {
  if (width <= 0 || height <= 0) return [];
  const groups: AnnotationGroup[] = [];
  const targets = new Map<string, AnnotationGroup>();
  const semanticLines = new Map<string, AnnotationGroup>();
  const densityCells = new Map<string, AnnotationGroup>();
  for (const visual of [...visuals].sort((a, b) => a.segments[0].top - b.segments[0].top
    || a.segments[0].left - b.segments[0].left || a.annotation._id.localeCompare(b.annotation._id))) {
    const anchor = visual.semantic ? visual.segments[0] : visual.segments[visual.segments.length - 1];
    const left = anchor.left + anchor.width;
    const top = anchor.anchorTop;
    const target = `${visual.semantic}:${visual.segments.map(signature).join('|')}`;
    const firstLine = visual.lineKeys[0];
    const columns = Math.max(1, Math.floor(width / densityCellWidth));
    const densityKey = `${firstLine}:${Math.min(columns - 1, Math.floor(left / 100 * columns))}`;
    let group = targets.get(target);
    if (!group && visual.semantic) {
      const overlaps = new Map<AnnotationGroup, number>();
      for (const key of visual.lineKeys) {
        const candidate = semanticLines.get(key);
        if (candidate) overlaps.set(candidate, (overlaps.get(candidate) || 0) + 1);
      }
      for (const [candidate, overlap] of overlaps) {
        if (Math.abs(candidate.anchorTop - top) <= Math.max((anchor.height || 1) * 2, 5)
          && overlap >= Math.min(visual.lineKeys.length, candidate.lineKeys.size) / 2) { group = candidate; break; }
      }
    }
    if (!group && !visual.semantic) {
      // Only nearby targets on the same visual line can share a dense local badge.
      group = densityCells.get(densityKey);
    }
    if (group) {
      if (!visual.semantic) group.anchorLeft = (group.anchorLeft * group.annotations.length + left)
        / (group.annotations.length + 1);
      group.annotations.push(visual.annotation);
      for (const key of visual.lineKeys) group.lineKeys.add(key);
    } else {
      group = { id: visual.annotation._id, annotations: [visual.annotation], semantic: visual.semantic,
        lineKeys: new Set(visual.lineKeys), anchorLeft: left, anchorTop: top,
        left, top, width: 30, code: '', label: '' };
      groups.push(group);
      if (!visual.semantic) densityCells.set(densityKey, group);
    }
    if (visual.semantic) for (const key of visual.lineKeys) semanticLines.set(key, group);
    targets.set(target, group);
  }
  // A bounded spatial hash; each occupied cell contains only nearby placed rectangles.
  const cells = new Map<string, AnnotationGroup[]>();
  let unresolved = false;
  const keys = (x: number, y: number, w: number): string[] => {
    const result: string[] = [];
    for (let row = Math.floor((y - 16) / 32); row <= Math.floor((y + 16) / 32); row++) {
      for (let col = Math.floor((x - w / 2 - 3) / 96); col <= Math.floor((x + w / 2 + 3) / 96); col++) result.push(`${col}:${row}`);
    }
    return result;
  };
  for (const group of groups) {
    label(group);
    const anchorX = group.anchorLeft * width / 100;
    const anchorY = group.anchorTop * height / 100;
    const candidates = [[0, -17], ...Array.from({ length: 12 }, (_, i) => (i + 1) * 8)
      .flatMap((offset) => [[-offset, -17], [offset, -17]]), [0, -47], [0, 17]];
    let best: { x: number; y: number; collisions: number } | undefined;
    for (const [dx, dy] of candidates) {
      const x = clamp(anchorX + dx, group.width / 2 + 2, width - group.width / 2 - 2);
      const y = clamp(anchorY + dy, 15, height - 15);
      const nearby = new Set(keys(x, y, group.width).flatMap((key) => cells.get(key) || []));
      let collisions = 0;
      for (const other of nearby) {
        if (Math.abs(other.left * width / 100 - x) < (other.width + group.width) / 2 + 4
          && Math.abs(other.top * height / 100 - y) < 32) collisions++;
      }
      if (!best || collisions < best.collisions) best = { x, y, collisions };
      if (!collisions) break;
    }
    group.left = best!.x / width * 100;
    group.top = best!.y / height * 100;
    unresolved ||= best!.collisions > 0;
    for (const key of keys(best!.x, best!.y, group.width)) {
      const cell = cells.get(key) || []; cell.push(group); cells.set(key, cell);
    }
  }
  // At most two denser retries, still restricted to compatible same-line local targets.
  if (unresolved && densityCellWidth < 190) return layoutAnnotationGroups(visuals, width, height, densityCellWidth + 40);
  return groups;
}
