import { DEFAULT_CORRECTION_LEGEND } from '../../constants/correction-legend.default';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
import { classifyCorrectionVisualType } from './annotation-classification';
import { buildAnnotationVisuals } from './annotation-geometry';
import { layoutAnnotationGroups, sharedSegments } from './annotation-layout';

const words: OcrWord[] = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, text: 'word',
  bbox: { x: 3 + i % 8 * 11, y: 12 + Math.floor(i / 8) * 12, w: 8, h: 3 },
  separatorBefore: i % 8 === 0 ? '\n' : ' ' }));
const correction = (id: string, symbol: string, wordIds: string[], category = 'GRAMMAR'): FeedbackAnnotation => ({
  _id: id, submissionId: 'fixture', source: 'AI', editable: false, page: 1, symbol, wordIds, category,
  message: `Original message ${id}`, suggestedText: `Original suggestion ${id}`
});
const visuals = (annotations: FeedbackAnnotation[]) => buildAnnotationVisuals(annotations, words, 1, 1000, 1200);

describe('annotation visual classification', () => {
  for (const group of DEFAULT_CORRECTION_LEGEND.groups) {
    for (const entry of group.symbols) {
      it(`classifies canonical ${group.key}/${entry.symbol}`, () => {
        expect(classifyCorrectionVisualType(correction('c', entry.symbol, []))).toBe(
          ['CONTENT', 'ORGANIZATION'].includes(group.key) ? 'semantic' : 'local');
      });
    }
  }
  it('supports historical codes and deterministic unknown fallback', () => {
    expect(classifyCorrectionVisualType(correction('c', 'CON', []))).toBe('semantic');
    expect(classifyCorrectionVisualType(correction('c', 'ORG', []))).toBe('semantic');
    expect(classifyCorrectionVisualType(correction('c', 'UNKNOWN', []))).toBe('local');
    expect(classifyCorrectionVisualType(correction('c', 'UNKNOWN', [], 'CONTENT'))).toBe('semantic');
  });
});

describe('annotation presentation groups', () => {
  it('groups three same-target errors, reuses geometry and preserves every canonical object', () => {
    const annotations = ['SP', 'WC', 'AGR'].map((code) => correction(code, code, ['w1']));
    const before = JSON.stringify(annotations);
    const built = visuals(annotations);
    const groups = layoutAnnotationGroups(built, 1000, 1200);
    expect(groups).toHaveSize(1);
    expect(groups[0].annotations).toHaveSize(3);
    expect(new Set(groups[0].annotations.map((a) => a._id))).toEqual(new Set(['SP', 'WC', 'AGR']));
    expect(sharedSegments(built, false)).toHaveSize(1);
    expect(sharedSegments(built, false)[0].correctionIds).toHaveSize(3);
    expect(JSON.stringify(annotations)).toBe(before);
  });
  it('groups nearby semantic corrections, uses mixed labels, and separates distant lines', () => {
    const built = visuals([
      correction('dev1', 'DEV', ['w0', 'w1'], 'CONTENT'),
      correction('dev2', 'DEV', ['w1', 'w2'], 'CONTENT'),
      correction('dev3', 'DEV', ['w2', 'w3'], 'CONTENT'),
      correction('far', 'DEV', ['w32'], 'CONTENT')
    ]);
    const groups = layoutAnnotationGroups(built, 390, 468);
    expect(groups).toHaveSize(2);
    expect(groups[0].code).toBe('DEV +2');
    built[1].annotation = { ...built[1].annotation, symbol: 'COH', category: 'ORGANIZATION' };
    expect(layoutAnnotationGroups(built, 390, 468)[0].code).toBe('3 Issues');
  });
  it('keeps semantic rails separate from local geometry on the same sentence', () => {
    const built = visuals([correction('semantic', 'DEV', ['w0', 'w1', 'w8'], 'CONTENT'),
      correction('local', 'AGR', ['w1'])]);
    expect(sharedSegments(built, true)).toHaveSize(2);
    expect(sharedSegments(built, false)).toHaveSize(1);
    expect(layoutAnnotationGroups(built, 390, 468)).toHaveSize(2);
  });
  it('does not bridge unmapped semantic lines', () => {
    const [built] = visuals([correction('c', 'DEV', ['w0', 'w24'], 'CONTENT')]);
    expect(built.segments).toHaveSize(2);
    expect(built.segments.every((s) => s.height! < 4)).toBeTrue();
  });
  it('sorts reversed canonical IDs and splits large gaps and unrelated intervening words', () => {
    const [a] = visuals([correction('c', 'AGR', ['w2', 'w1'])]);
    expect(a.segments).toHaveSize(1);
    const [b] = visuals([correction('c', 'AGR', ['w0', 'w3'])]);
    expect(b.segments).toHaveSize(2);
    const separated = words.map((w) => w.id === 'w1' ? { ...w, bbox: { ...w.bbox!, x: 60 } } : w);
    expect(buildAnnotationVisuals([correction('c', 'AGR', ['w0', 'w1'])], separated, 1, 1000, 1200)[0].segments).toHaveSize(2);
  });
  it('uses valid word IDs instead of conflicting fallback boxes', () => {
    const [built] = visuals([{ ...correction('c', 'SP', ['w1']), bboxList: [{ x: 80, y: 80, w: 8, h: 2 }] }]);
    expect(built.segments[0].left).toBeLessThan(20);
  });
  it('scopes reused word IDs by the selected page', () => {
    const annotations = [correction('page1', 'SP', ['w1']), { ...correction('page2', 'SP', ['w1']), page: 2 }];
    expect(buildAnnotationVisuals(annotations, words, 2, 1000, 1200).map((v) => v.annotation._id)).toEqual(['page2']);
  });
  for (const degrees of [0, 90, 180, 270]) {
    it(`uses the supplied image axes for a ${degrees}-degree normalized fixture (not EXIF verification)`, () => {
      let box = { x: 10, y: 20, w: 8, h: 3 };
      for (let turn = 0; turn < degrees / 90; turn++) {
        box = { x: 100 - box.y - box.h, y: box.x, w: box.h, h: box.w };
      }
      const [v] = buildAnnotationVisuals([correction('r', 'SP', ['r'])], [{ id: 'r', text: 'word', bbox: box }], 1, 1000, 1200);
      expect(v.segments[0].left).toBeCloseTo(box.x - 0.15, 1);
      expect(v.segments[0].top).toBeGreaterThan(box.y + box.h);
      expect(v.segments[0].left + v.segments[0].width).toBeLessThanOrEqual(100);
    });
  }
  for (const width of [1440, 1024, 768, 430, 390, 375]) {
    it(`clamps dense grouped badges at ${width}px and retains all correction IDs`, () => {
      const annotations = words.slice(0, 28).map((w, i) => correction(`local${i}`, 'SP', [w.id]));
      annotations.push(...Array.from({ length: 9 }, (_, i) => correction(`semantic${i}`, 'DEV',
        [`w${Math.floor(i / 3) * 8}`], 'CONTENT')));
      const groups = layoutAnnotationGroups(visuals(annotations), width, width * 1.2);
      expect(groups.flatMap((g) => g.annotations)).toHaveSize(37);
      for (const g of groups) {
        expect(g.left * width / 100 - g.width / 2).toBeGreaterThanOrEqual(0);
        expect(g.left * width / 100 + g.width / 2).toBeLessThanOrEqual(width);
        expect(g.top * width * 1.2 / 100).toBeGreaterThanOrEqual(14);
      }
    });
  }
});
