// Task 21: sentence-level corrections are one margin bracket; word-level geometry is byte-identical to before (snapshot recorded from the rules
// at frontend a76cb67 / backend 548685cd, the generated PDF rules of that commit, on the same fixture).
import { buildAnnotationVisuals, BRACKET_COLUMN_STEP } from './annotation-geometry';
import { layoutAnnotationGroups, sharedSegments } from './annotation-layout';
import { annotationBadgeMetrics, DESKTOP_BADGE_METRICS } from './annotation-badge-metrics';
import { BRACKET_WORDS, SENTENCE_LEVEL, WORD_LEVEL } from './annotation-bracket.fixture';
import type { OcrWord } from '../../models/ocr-token.model';

/** Word-level geometry before Task 21 (visuals, shared underline strokes, chips at 800x600 and 330x247.5). */
const BEFORE = {"visuals":[{"id":"sp1","semantic":false,"lineKeys":["word:0"],"segments":[{"id":"sp1_0","left":66,"top":18.38,"underlineBottom":22.832,"width":7.400000000000006,"color":"#f5c2c7","correctionIds":["sp1"],"anchorTop":14,"lineKey":"word:0"}]},{"id":"agr1","semantic":false,"lineKeys":["word:0"],"segments":[{"id":"agr1_0","left":30,"top":18.68,"underlineBottom":22.832,"width":7.399999999999999,"color":"#cfe2ff","correctionIds":["agr1"],"anchorTop":14.3,"lineKey":"word:0"}]},{"id":"ww1","semantic":false,"lineKeys":["word:1"],"segments":[{"id":"ww1_0","left":30,"top":27.68,"underlineBottom":31.832,"width":16.4,"color":"#d1e7dd","correctionIds":["ww1"],"anchorTop":23,"lineKey":"word:1"}]},{"id":"ww2","semantic":false,"lineKeys":["word:4"],"segments":[{"id":"ww2_0","left":57,"top":54.68,"underlineBottom":99.832,"width":25.400000000000006,"color":"#d1e7dd","correctionIds":["ww2"],"anchorTop":50,"lineKey":"word:4"}]},{"id":"p1","semantic":false,"lineKeys":["word:3"],"segments":[{"id":"p1_boundary_0","left":55.233333333333334,"top":45.35,"width":0.33333333333333337,"boundary":true,"color":"#f5c2c7","anchorTop":41.15,"lineKey":"word:3","correctionIds":["p1"]}]}],"underlines":[{"id":"agr1_0:30","left":30,"top":18.68,"underlineBottom":22.832,"width":7.399999999999999,"color":"#cfe2ff","correctionIds":["agr1"],"anchorTop":14.3,"lineKey":"word:0"},{"id":"sp1_0:66","left":66,"top":18.38,"underlineBottom":22.832,"width":7.400000000000006,"color":"#f5c2c7","correctionIds":["sp1"],"anchorTop":14,"lineKey":"word:0"},{"id":"ww1_0:30","left":30,"top":27.68,"underlineBottom":31.832,"width":16.4,"color":"#d1e7dd","correctionIds":["ww1"],"anchorTop":23,"lineKey":"word:1"},{"id":"ww2_0:57","left":57,"top":54.68,"underlineBottom":99.832,"width":25.400000000000006,"color":"#d1e7dd","correctionIds":["ww2"],"anchorTop":50,"lineKey":"word:4"},{"id":"p1_boundary_0:55.233333333333334","left":55.233333333333334,"top":45.35,"width":0.3333333333333357,"boundary":true,"color":"#f5c2c7","anchorTop":41.15,"lineKey":"word:3","correctionIds":["p1"]}],"chips":{"desktop":[{"ids":["sp1"],"left":67.875,"top":12,"code":"SP"},{"ids":["agr1"],"left":32,"top":12.3,"code":"AGR"},{"ids":["ww1"],"left":31.875,"top":21,"code":"WW"},{"ids":["p1"],"left":57.1083,"top":39.15,"code":"P"},{"ids":["ww2"],"left":58.875,"top":48,"code":"WC"}],"phone":[{"ids":["sp1"],"left":70.5455,"top":9.1515,"code":"SP"},{"ids":["p1"],"left":59.7788,"top":36.3015,"code":"P"},{"ids":["ww2"],"left":71.2424,"top":45.1515,"code":"WC"}]}};

describe('grouped sentence-level brackets (Task 21)', () => {
  const all = [...WORD_LEVEL, ...SENTENCE_LEVEL];
  const visuals = buildAnnotationVisuals(all, BRACKET_WORDS, 1, 1200, 900);
  const wordIds = new Set(WORD_LEVEL.map(a => a._id));
  const sentence = (id: string) => visuals.find(v => v.annotation._id === id)!;
  const words = (ids: string[]) => ids.map(id => BRACKET_WORDS.find(w => w.id === id)!.bbox!);

  it('word-level underlines, chips and visuals are exactly as before (0 changed)', () => {
    const now = { visuals: visuals.filter(v => wordIds.has(v.annotation._id)).map(v => ({ id: v.annotation._id, semantic: v.semantic, lineKeys: v.lineKeys, segments: v.segments })),
      underlines: sharedSegments(visuals.filter(v => wordIds.has(v.annotation._id)), false), chips: {} as Record<string, unknown> };
    for (const [name, w, h] of [['desktop', 800, 600], ['phone', 330, 247.5]] as const) {
      now.chips[name] = layoutAnnotationGroups(visuals, w, h, 110).filter(g => g.annotations.every(a => wordIds.has(a._id)))
        .map(g => ({ ids: g.annotations.map(a => a._id), left: +g.left.toFixed(4), top: +g.top.toFixed(4), code: g.code }));
    }
    expect(JSON.parse(JSON.stringify(now))).toEqual(BEFORE);
  });

  it('each sentence-level correction is one bracket from the top of its first line to the bottom of its last; no underline stroke', () => {
    for (const annotation of SENTENCE_LEVEL) {
      const visual = sentence(annotation._id);
      expect(visual.semantic).toBeTrue();
      expect(visual.segments.length).withContext(annotation._id).toBe(1);
      const [bracket] = visual.segments, boxes = words(annotation.wordIds!);
      expect(bracket.bracket).toBeTrue();
      expect(bracket.top).toBeCloseTo(Math.min(...boxes.map(b => b.y)) - 0.2, 5);
      expect(bracket.top + bracket.height!).toBeCloseTo(Math.max(...boxes.map(b => b.y + b.h)) + 0.2, 5);
      expect(visual.covers!.length).toBe(new Set(boxes.map(b => Math.round(b.y))).size);
    }
    const strokes = sharedSegments(visuals, false).flatMap(s => s.correctionIds);
    for (const annotation of SENTENCE_LEVEL) expect(strokes).not.toContain(annotation._id);
  });

  it('overlapping brackets get separate columns a fixed step apart; brackets that do not overlap share a column', () => {
    const left = (id: string) => sentence(id).segments[0].left;
    const ro2 = left('ro2'), conc = left('conc1'), frag = left('frag1'), ro1 = left('ro1');
    expect(frag).toBe(ro2);                                   // ro2 ends before frag starts
    expect(ro2 - conc).toBeCloseTo(BRACKET_COLUMN_STEP, 5);   // conc overlaps ro2
    expect(conc - ro1).toBeCloseTo(BRACKET_COLUMN_STEP, 5);   // ro1 overlaps conc and frag
    const rails = visuals.filter(v => v.semantic).flatMap(v => v.segments);
    for (const a of rails) for (const b of rails) {
      if (a === b || a.left !== b.left) continue;
      expect(a.top + a.height! <= b.top || b.top + b.height! <= a.top).withContext(a.id + " / " + b.id).toBeTrue();
    }
  });

  it('brackets stay inside the image when the left margin is too small (cropped page)', () => {
    const cropped: OcrWord[] = BRACKET_WORDS.map(w => ({ ...w, bbox: { ...w.bbox!, x: w.bbox!.x - 11.5 } }));
    const placed = buildAnnotationVisuals(all, cropped, 1, 1200, 900).filter(v => v.semantic).flatMap(v => v.segments);
    expect(placed.length).toBe(4);
    for (const rail of placed) { expect(rail.left).toBeGreaterThanOrEqual(0.5); expect(rail.left).toBeLessThanOrEqual(99.5); }
    // No room on the left: the brackets use the right margin.
    expect(Math.min(...placed.map(r => r.left))).toBeGreaterThan(50);
  });

  it('lines that do not follow each other are never bridged by one bracket', () => {
    const split = { ...SENTENCE_LEVEL[2], _id: 'split', wordIds: ['w_0_0', 'w_0_1', 'w_0_2', 'w_0_3', 'w_0_4', 'w_3_0', 'w_3_1'] };
    const visual = buildAnnotationVisuals([split], BRACKET_WORDS, 1, 1200, 900)[0];
    expect(visual.segments.length).toBe(2);
  });

  it('chips: compact (16px, 7.5px text) when the page is drawn 420px wide or less on a phone; desktop unchanged; strokes 3px vs 2px', () => {
    expect(annotationBadgeMetrics(1440, 800)).toBe(DESKTOP_BADGE_METRICS);
    expect(annotationBadgeMetrics(1024, 300).height).toBe(26);      // a desktop viewport never shrinks
    const compact = annotationBadgeMetrics(375, 343);
    expect(compact.height).toBeLessThanOrEqual(16);
    expect(compact.fontSize).toBeGreaterThanOrEqual(7); expect(compact.fontSize).toBeLessThanOrEqual(8);
    expect(compact.strokeWidth).toBe(3); expect(DESKTOP_BADGE_METRICS.strokeWidth).toBe(2);
    expect(compact.hitSize).toBeGreaterThanOrEqual(24);
    expect(annotationBadgeMetrics(768, 700).strokeWidth).toBe(2);   // a tablet-sized page keeps 2px
    expect(annotationBadgeMetrics(390)).toEqual(annotationBadgeMetrics(390, Infinity));   // the viewport-only tiers are unchanged
  });
});
