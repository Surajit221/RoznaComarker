import type { AnnotationGroup } from './annotation-layout';
import { badgeLocalityRadius } from './annotation-layout';
import type { AnnotationVisual } from './annotation-geometry';
import type { AnnotationBadgeMetrics } from './annotation-badge-metrics';
import type { AnnotationLeader } from './annotation-placement';
import type { OcrWord } from '../../models/ocr-token.model';

interface Rect { left: number; right: number; top: number; bottom: number; }
interface Point { x: number; y: number; }
const GAP = 8; // CSS pixels, including room for selection rings and stroke thickness.
const MAX_NUDGE = 8;
const overlaps = (a: Rect, b: Rect, gap: number): boolean => a.left < b.right + gap - 1e-6
  && a.right > b.left - gap + 1e-6 && a.top < b.bottom + gap - 1e-6 && a.bottom > b.top - gap + 1e-6;
const edges = (points: Point[]): Rect[] => points.slice(1).map((p, i) => ({
  left: Math.min(p.x, points[i].x), right: Math.max(p.x, points[i].x),
  top: Math.min(p.y, points[i].y), bottom: Math.max(p.y, points[i].y) }));
const points = (leader: AnnotationLeader, width: number, height: number): Point[] => leader.points.split(' ')
  .map(pair => pair.split(',').map(Number)).map(([x, y]) => ({ x: x * width / 100, y: y * height / 100 }));

/** Browser presentation only, after shared grouping/layout. Never move a source stroke or remove a badge. */
export function refineBadgeStrokeClearance(groups: AnnotationGroup[], visuals: AnnotationVisual[], width: number,
  height: number, metrics: Readonly<AnnotationBadgeMetrics>, words: OcrWord[] = []): AnnotationGroup[] {
  if (!(width > 0 && height > 0)) return groups;
  const rect = (g: AnnotationGroup, dy = 0): Rect => ({ left: g.left * width / 100 - g.width / 2,
    right: g.left * width / 100 + g.width / 2, top: g.top * height / 100 - metrics.height / 2 + dy,
    bottom: g.top * height / 100 + metrics.height / 2 + dy });
  const strokes = visuals.flatMap(v => v.segments.map(s => ({ ids: s.correctionIds,
    left: s.left * width / 100, right: (s.left + s.width) * width / 100 + (v.semantic ? 4 : 0),
    top: s.top * height / 100, bottom: s.top * height / 100
      + (v.semantic ? Math.max(8, (s.height || 0) * height / 100) : s.boundary ? 5 : 3) })));
  const text = words.flatMap(w => w.bbox && [w.bbox.x, w.bbox.y, w.bbox.w, w.bbox.h].every(Number.isFinite)
    && w.bbox.w > 0 && w.bbox.h > 0 ? [{ left: w.bbox.x * width / 100,
      right: (w.bbox.x + w.bbox.w) * width / 100, top: w.bbox.y * height / 100,
      bottom: (w.bbox.y + w.bbox.h) * height / 100 }] : []);
  for (const group of groups) {
    const ids = new Set(group.annotations.map(a => a._id));
    const unrelated = strokes.filter(s => !s.ids.some(id => ids.has(id)));
    const otherGroups = groups.filter(g => g !== group);
    const leaders = otherGroups.flatMap(g => (g.leaders || []).flatMap(l => edges(points(l, width, height))));
    const obstacles = [...unrelated, ...leaders];
    const origin = rect(group);
    if (!obstacles.some(s => overlaps(origin, s, GAP))) continue;
    const anchors = visuals.filter(v => ids.has(v.annotation._id)).flatMap(v => v.segments.length ? [{
      x: (v.segments[0].left + (v.semantic ? v.segments[0].width : v.segments[0].width / 2)) * width / 100,
      y: v.segments[0].anchorTop * height / 100 }] : []);
    if (!anchors.length) continue;
    for (const dy of Array.from({ length: MAX_NUDGE }, (_, i) => [i + 1, -i - 1]).flat()) {
      const badge = rect(group, dy);
      if (badge.left < 2 || badge.right > width - 2 || badge.top < 1 || badge.bottom > height - 1
        || anchors.some(a => Math.hypot(group.left * width / 100 - a.x, group.top * height / 100 + dy - a.y) > badgeLocalityRadius(metrics))
        || obstacles.some(s => overlaps(badge, s, GAP))
        || otherGroups.some(g => overlaps(badge, rect(g), 4))
        || text.some(t => overlaps(badge, t, 2))
        || strokes.some(s => s.ids.some(id => ids.has(id)) && overlaps(badge, s, 1) && !overlaps(origin, s, 1))) continue;
      // Reattach only the badge end of an existing orthogonal leader; source endpoint stays exact.
      const movedLeaders = (group.leaders || []).map(leader => {
        const route = points(leader, width, height);
        if (route.length < 2) return { leader, route };
        const horizontal = Math.abs(route[0].y - route[1].y) < 0.001;
        route[0].y += dy;
        if (horizontal && route.length > 2) route[1].y += dy;
        else if (horizontal) route.splice(1, 0, { x: route[1].x, y: route[0].y });
        return { leader, route };
      });
      if (movedLeaders.some(({ route }) => route.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
          || p.x < 1 || p.x > width - 1 || p.y < 1 || p.y > height - 1)
        || route.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - route[i].x) + Math.abs(p.y - route[i].y), 0) > badgeLocalityRadius(metrics) * 2
        || edges(route).some(e => [...unrelated, ...leaders, ...otherGroups.map(g => rect(g))].some(o => overlaps(e, o, 3))
          || text.some(t => overlaps(e, t, 1.5))))) continue;
      group.top += dy / height * 100;
      group.leaders = movedLeaders.map(({ leader, route }) => ({ ...leader,
        points: route.map((p, i) => i === route.length - 1 ? leader.points.split(' ').slice(-1)[0]
          : `${p.x / width * 100},${p.y / height * 100}`).join(' ') }));
      break;
    }
  }
  return groups;
}
