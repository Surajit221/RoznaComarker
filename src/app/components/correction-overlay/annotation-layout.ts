import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { AnnotationSegment, AnnotationVisual } from './annotation-geometry';
import { DESKTOP_BADGE_METRICS, type AnnotationBadgeMetrics } from './annotation-badge-metrics';

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

/** Maximum badge-center displacement from its local source anchor, in rendered pixels. */
export function badgeLocalityRadius(metrics: Readonly<AnnotationBadgeMetrics> = DESKTOP_BADGE_METRICS): number {
  return Math.hypot(metrics.maxWidth / 2 + 2, metrics.height * 2);
}

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

function label(group: AnnotationGroup, metrics: Readonly<AnnotationBadgeMetrics>): void {
  const first = group.annotations[0];
  const count = group.annotations.length;
  const category = first.category || first.group;
  const sameCategory = group.annotations.every((a) => (a.category || a.group) === category);
  const previousLabel = count === 1 ? first.symbol?.trim() || 'Issue'
    : sameCategory ? `${first.symbol?.trim() || 'Issue'} +${count - 1}` : `${count} Issues`;
  const codes = [...new Set(group.annotations.map((a) => a.symbol?.trim()).filter((code): code is string => !!code))];
  const compact = codes.slice(0, 2).join('·') + (count > 2 ? `+${count - 2}` : '');
  group.code = count === 1 ? previousLabel : codes.length === 1 ? `${codes[0]} +${count - 1}` : compact;
  // Size the visible compact label, including every character in the +N suffix.
  group.width = Math.max(metrics.minWidth, Math.min(metrics.maxWidth,
    group.code.length * metrics.charWidth + metrics.widthAllowance));
  group.label = `${count} correction${count === 1 ? '' : 's'}: `
    + group.annotations.map((a) => `${a.symbol || 'Issue'} ${a.group || a.category || ''}`).join('; ');
}

/** Deterministic grouping; spatial bins avoid scanning all previously placed badges. */
export function layoutAnnotationGroups(visuals: AnnotationVisual[], width: number, height: number,
  _densityCellWidth = 110, metrics: Readonly<AnnotationBadgeMetrics> = DESKTOP_BADGE_METRICS): AnnotationGroup[] {
  // Keep the existing call signature; density no longer merges distinct targets.
  void _densityCellWidth;
  if (width <= 0 || height <= 0) return [];
  const groups: AnnotationGroup[] = [];
  const targets = new Map<string, AnnotationGroup>();
  for (const visual of [...visuals].sort((a, b) => a.segments[0].top - b.segments[0].top
    || a.segments[0].left - b.segments[0].left || a.annotation._id.localeCompare(b.annotation._id))) {
    const anchor = visual.segments[0];
    const left = anchor.left + (visual.semantic ? anchor.width : anchor.width / 2);
    const top = anchor.anchorTop;
    const source = visual.annotation.renderTarget || visual.annotation.visualTarget;
    const ids = source?.wordIds || visual.annotation.wordIds || [];
    const identity = ids.length || source?.anchors?.length
      ? JSON.stringify([[...ids].sort(), [...(source?.anchors || [])].sort((a, b) =>
        a.wordId.localeCompare(b.wordId) || a.side.localeCompare(b.side))]) : visual.segments.map(signature).join('|');
    const target = `${visual.semantic}:${identity}`;
    let group = targets.get(target);
    if (group) {
      group.annotations.push(visual.annotation);
      for (const key of visual.lineKeys) group.lineKeys.add(key);
    } else {
      group = { id: visual.annotation._id, annotations: [visual.annotation], semantic: visual.semantic,
        lineKeys: new Set(visual.lineKeys), anchorLeft: left, anchorTop: top,
        left, top, width: 30, code: '', label: '' };
      groups.push(group);
    }
    targets.set(target, group);
  }
  placeGroups(groups, width, height, metrics);
  return groupCollidingBadges(groups, width, height, metrics);
}

interface BadgeAnchor { left: number; top: number; }

function localCandidates(group: AnnotationGroup, width: number, height: number,
  metrics: Readonly<AnnotationBadgeMetrics>, anchors: BadgeAnchor[]): { x: number; y: number }[] {
  const shift = metrics.height;
  return [[0, -metrics.offsetY], [-shift / 2, -metrics.offsetY], [shift / 2, -metrics.offsetY],
    [0, -shift * 1.5], [-shift, -shift * 1.5], [shift, -shift * 1.5]].map(([dx, dy]) => ({
      x: clamp(group.anchorLeft * width / 100 + dx, group.width / 2 + 2, width - group.width / 2 - 2),
      y: clamp(group.anchorTop * height / 100 + dy, metrics.edgeY, height - metrics.edgeY)
    })).filter(({ x, y }) => anchors.every(a => Math.hypot(x - a.left * width / 100,
      y - a.top * height / 100) <= badgeLocalityRadius(metrics)));
}

function placeGroups(groups: AnnotationGroup[], width: number, height: number,
  metrics: Readonly<AnnotationBadgeMetrics>, origins?: Map<AnnotationGroup, BadgeAnchor[]>): void {
  // A bounded spatial hash; each occupied cell contains only nearby placed rectangles.
  const cells = new Map<string, AnnotationGroup[]>();
  const keys = (x: number, y: number, w: number): string[] => {
    const result: string[] = [];
    for (let row = Math.floor((y - metrics.collisionHeight / 2) / 32); row <= Math.floor((y + metrics.collisionHeight / 2) / 32); row++) {
      for (let col = Math.floor((x - w / 2 - 3) / 96); col <= Math.floor((x + w / 2 + 3) / 96); col++) result.push(`${col}:${row}`);
    }
    return result;
  };
  for (const group of groups) {
    label(group, metrics);
    const anchorX = group.anchorLeft * width / 100;
    const anchorY = group.anchorTop * height / 100;
    let best: { x: number; y: number; collisions: number } | undefined;
    for (const { x, y } of localCandidates(group, width, height, metrics, origins?.get(group) || [group])) {
      const nearby = new Set(keys(x, y, group.width).flatMap((key) => cells.get(key) || []));
      let collisions = 0;
      for (const other of nearby) {
        if (Math.abs(other.left * width / 100 - x) < (other.width + group.width) / 2 + 4
          && Math.abs(other.top * height / 100 - y) < metrics.collisionHeight) collisions++;
      }
      if (!best || collisions < best.collisions) best = { x, y, collisions };
      if (!collisions) break;
    }
    // On an extremely small hidden/thumbnail stage visibility may be impossible;
    // keep the nearest edge position rather than searching unrelated page space.
    best ||= { x: clamp(anchorX, group.width / 2 + 2, width - group.width / 2 - 2),
      y: clamp(anchorY, metrics.edgeY, height - metrics.edgeY), collisions: 0 };
    group.left = best.x / width * 100;
    group.top = best!.y / height * 100;
    for (const key of keys(best!.x, best!.y, group.width)) {
      const cell = cells.get(key) || []; cell.push(group); cells.set(key, cell);
    }
  }
}

/** Collapse only unresolved local rectangle collisions; correction/target objects are never merged. */
export function groupCollidingBadges(placed: AnnotationGroup[], width: number, height: number,
  metrics: Readonly<AnnotationBadgeMetrics> = DESKTOP_BADGE_METRICS): AnnotationGroup[] {
  let groups = placed;
  const origins = new Map(groups.map(g => [g, [{ left: g.anchorLeft, top: g.anchorTop }]]));
  const order = new Map(groups.flatMap(g => g.annotations).map((a, i) => [a, i]));
  const annotations = (items: AnnotationGroup[]): FeedbackAnnotation[] => items.flatMap(g => g.annotations)
    .sort((a, b) => order.get(a)! - order.get(b)!);
  // Each successful pass reduces badge count. Recheck because a compact group is wider.
  while (groups.length > 1) {
    const parents = groups.map((_, i) => i);
    const members = groups.map(g => [g]);
    const root = (i: number): number => { while (parents[i] !== i) i = parents[i]; return i; };
    let merged = false;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      if (Math.abs(a.left - b.left) * width / 100 >= (a.width + b.width) / 2 + 4
        || Math.abs(a.top - b.top) * height / 100 >= metrics.collisionHeight
        || Math.abs(a.anchorTop - b.anchorTop) * height / 100 > metrics.height * 2) continue;
      const r1 = root(i), r2 = root(j);
      if (r1 === r2) continue;
      const first = Math.min(r1, r2), last = Math.max(r1, r2);
      const combined = [...members[first], ...members[last]].sort((a, b) => groups.indexOf(a) - groups.indexOf(b));
      const primary = combined[0];
      const candidate = { ...primary, annotations: annotations(combined) };
      label(candidate, metrics);
      const anchors = combined.flatMap(g => origins.get(g)!);
      if (!localCandidates(candidate, width, height, metrics, anchors).length) continue;
      parents[last] = first; members[first] = combined; merged = true;
    }
    if (!merged) break;
    groups = groups.flatMap((g, i) => {
      if (root(i) !== i) return [];
      if (members[i].length === 1) return [g];
      const combined = members[i];
      const group = { ...combined[0], annotations: annotations(combined),
        lineKeys: new Set(combined.flatMap(g => [...g.lineKeys])) };
      origins.set(group, combined.flatMap(g => origins.get(g)!));
      return [group];
    });
    placeGroups(groups, width, height, metrics, origins);
  }
  return groups;
}
