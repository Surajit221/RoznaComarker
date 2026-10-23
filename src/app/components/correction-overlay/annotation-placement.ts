import type { AnnotationGroup } from './annotation-layout';
import type { AnnotationVisual } from './annotation-geometry';
import type { AnnotationBadgeMetrics } from './annotation-badge-metrics';
import type { OcrWord } from '../../models/ocr-token.model';

export interface AnnotationLeader { id: string; points: string; color: string; }
interface Point { x: number; y: number; }
interface Rect { left: number; right: number; top: number; bottom: number; }
interface Stroke extends Rect { ids: string[]; }
interface Target { left: number; right: number; y: number; color: string; }
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const overlaps = (a: Rect, b: Rect, gap: number): boolean => a.left < b.right + gap
  && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
const rectangle = (p: Point, width: number, height: number): Rect => ({ left: p.x - width / 2,
  right: p.x + width / 2, top: p.y - height / 2, bottom: p.y + height / 2 });
const edges = (points: Point[]): Rect[] => points.slice(1).map((p, i) => ({
  left: Math.min(p.x, points[i].x), right: Math.max(p.x, points[i].x),
  top: Math.min(p.y, points[i].y), bottom: Math.max(p.y, points[i].y) }));
const pathLength = (points: Point[]): number => points.slice(1).reduce((sum, p, i) =>
  sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);

function route(badge: Rect, target: Target, right: boolean): Point[] {
  // Travel beside the owned word, never vertically through its letter forms.
  // Stop 3px short of the stroke; the short elbow identifies its endpoint.
  const side = right ? target.right + 6 : target.left - 6;
  const end = right ? target.right + 3 : target.left - 3;
  const x = clamp(side, badge.left, badge.right);
  const y = side < badge.left || side > badge.right
    ? clamp(target.y, badge.top + 2, badge.bottom - 2)
    : target.y > badge.bottom ? badge.bottom : badge.top;
  return [{ x, y }, { x: side, y }, { x: side, y: target.y }, { x: end, y: target.y }]
    .filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
}

/** Presentation only, AFTER existing collision grouping. Never regroup, remap or move strokes. */
export function clarifyAnnotationPlacement(groups: AnnotationGroup[], visuals: AnnotationVisual[], width: number,
  height: number, metrics: Readonly<AnnotationBadgeMetrics>, locality: number, words: OcrWord[] = []): AnnotationGroup[] {
  const text: Rect[] = words.flatMap(w => {
    const b=w.bbox;
    return b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0
      ? [{left:b.x*width/100,right:(b.x+b.w)*width/100,top:b.y*height/100,bottom:(b.y+b.h)*height/100}] : [];
  });
  const strokes: Stroke[] = visuals.flatMap(v => v.segments.map(s => ({ left: s.left * width / 100,
    right: (s.left + s.width) * width / 100 + (v.semantic ? 4 : 0), top: s.top * height / 100,
    bottom: s.top * height / 100 + (v.semantic ? (s.height || 0) * height / 100 : s.boundary ? 5 : 3),
    ids: s.correctionIds })));
  const placedPaths: Rect[] = [];
  for (const group of groups) {
    const ids = new Set(group.annotations.map(a => a._id));
    const owned = visuals.filter(v => ids.has(v.annotation._id)).sort((a,b) => a.segments[0].top-b.segments[0].top
      || a.segments[0].left-b.segments[0].left || a.annotation._id.localeCompare(b.annotation._id));
    const unrelated = strokes.filter(s => !s.ids.some(id => ids.has(id)));
    const anchors = owned.map(v => ({ x: (v.segments[0].left + (v.semantic ? v.segments[0].width
      : v.segments[0].width / 2)) * width / 100, y: v.segments[0].anchorTop * height / 100 }));
    const targets = [...new Map(owned.map(v => {
      const s = v.segments[0];
      const target = { left: s.left * width / 100, right: (s.left + s.width) * width / 100,
        y: (s.top + (v.semantic ? (s.height || 0) / 2 : 0)) * height / 100, color: s.color };
      return [JSON.stringify(target), target] as const;
    })).values()];
    const others = groups.filter(g => g !== group).map(g => rectangle({x:g.left * width / 100,
      y:g.top * height / 100}, g.width, metrics.height));
    const origin = { x: group.left * width / 100, y: group.top * height / 100 };
    const candidates = [origin, ...targets.flatMap(t => {
      const side = group.width / 2 + 8, vertical = metrics.height / 2 + 8;
      return [
        { x: t.left - side, y: t.y }, { x: t.right + side, y: t.y },
        { x: (t.left + t.right) / 2, y: t.y + vertical },
        ...[-1, 0, 1].flatMap(lane => [-1, 1].map(direction => ({
          x: group.anchorLeft * width / 100 + lane * (group.width + 6),
          y: group.anchorTop * height / 100 + direction * (metrics.height + 8) })))
      ];
    })].map(p => ({x:clamp(p.x,group.width / 2 + 2,width - group.width / 2 - 2),
      y:clamp(p.y,metrics.edgeY,height - metrics.edgeY)}))
      .filter(p => anchors.every(a => Math.hypot(p.x-a.x,p.y-a.y) <= locality));
    let best: { point: Point; score: number[]; paths: {points:Point[];color:string}[] } | undefined;
    for (const point of candidates) {
      const badge = rectangle(point, group.width, metrics.height);
      const routes = targets.map(t => [route(badge,t,false),route(badge,t,true)].map(points => {
        const segments = edges(points);
        const blocked = segments.some(s => [...unrelated,...others].some(o => overlaps(s,o,3)))
          || segments.some(s => text.some(o => overlaps(s,o,1.5)))
          || points.some(p => p.x < 1 || p.x > width-1 || p.y < 1 || p.y > height-1)
          || pathLength(points) > locality * 2;
        return { points, color:t.color, blocked, crossings: segments.filter(s => placedPaths.some(o => overlaps(s,o,2))).length };
      }).sort((a,b) => Number(a.blocked)-Number(b.blocked) || a.crossings-b.crossings
        || pathLength(a.points)-pathLength(b.points))[0]);
      const score = [others.filter(o => overlaps(badge,o,4)).length,
        unrelated.filter(o => overlaps(badge,o,5)).length+placedPaths.filter(o => overlaps(badge,o,3)).length,
        text.filter(o => overlaps(badge,o,2)).length,
        routes.filter(r => r.blocked).length, routes.reduce((sum,r) => sum+r.crossings,0),
        Math.hypot(point.x-origin.x,point.y-origin.y)];
      if (!best || score.some((n,i) => n < best!.score[i] && score.slice(0,i).every((v,j) => v === best!.score[j]))) {
        best = {point,score,paths:routes.filter(r => !r.blocked).map(({points,color}) => ({points,color}))};
      }
    }
    // Impossible thumbnail/crowding constraints retain the original badge and
    // every correction. A blocked decorative leader never gains target authority.
    if (!best) continue;
    group.left = best.point.x / width * 100; group.top = best.point.y / height * 100;
    group.leaders = best.paths.map(({points,color},i) => ({id:`${group.id}-leader-${i}`,
      points:points.map(p => `${p.x / width * 100},${p.y / height * 100}`).join(' '),
      color}));
    placedPaths.push(...best.paths.flatMap(p => edges(p.points)));
  }
  // Later badges may have had no collision-free alternative. Clip decorative
  // leaders against FINAL badge rectangles rather than draw through a badge.
  for (const group of groups) {
    const others=groups.filter(g=>g!==group).map(g=>rectangle({x:g.left*width/100,y:g.top*height/100},g.width,metrics.height));
    group.leaders=group.leaders?.filter(leader=>{
      const points=leader.points.split(' ').map(pair=>pair.split(',').map(Number)).map(([x,y])=>({x:x*width/100,y:y*height/100}));
      return !edges(points).some(segment=>others.some(badge=>overlaps(segment,badge,3)));
    });
  }
  return groups;
}
