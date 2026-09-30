import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
import { buildAnnotationVisuals } from './annotation-geometry';

const word = (id: string, x: number, y: number, text = id, separatorBefore: OcrWord['separatorBefore'] = ' '): OcrWord =>
  ({ id, text, bbox: { x, y, w: 7, h: 3 }, separatorBefore });
const correction = (id: string, wordIds: string[], page = 1): FeedbackAnnotation => ({
  _id: id, submissionId: 's', page, wordIds, symbol: 'P', color: '#a03030', source: 'AI', editable: false
});

describe('annotation geometry', () => {
  const words = [word('word_1_1', 10, 20, 'about'), word('word_1_2', 18, 20, 'her'),
    word('word_1_3', 26, 20, "husband's"), word('word_1_4', 34, 20, 'death'),
    word('word_1_5', 10, 30, 'she', '\n'), word('word_1_6', 18, 30, 'begins')];

  it('uses exact word IDs and creates one same-line phrase segment', () => {
    const [visual] = buildAnnotationVisuals([correction('c', ['word_1_1', 'word_1_2', 'word_1_3', 'word_1_4'])],
      words, 1, 1000, 1200);
    expect(visual.segments).toHaveSize(1);
    expect(visual.segments[0].left).toBeGreaterThan(9.7);
    expect(visual.segments[0].left).toBeLessThan(10);
    expect(visual.segments[0].left + visual.segments[0].width).toBeGreaterThan(41);
    expect(visual.segments[0].left + visual.segments[0].width).toBeLessThan(41.3);
    expect(visual.segments[0].top).toBeGreaterThan(23);
    expect(visual.segments[0].top).toBeLessThan(24);
  });

  it('splits a single correction across two OCR lines and keeps one correction identity', () => {
    const [visual] = buildAnnotationVisuals([correction('c', words.map((item) => item.id))], words, 1, 1000, 1200);
    expect(visual.segments).toHaveSize(2);
    expect(visual.segments.map((item) => item.id)).toEqual(['c_0', 'c_1']);
    expect(visual.segments[1].top).toBeGreaterThan(visual.segments[0].top);
  });

  it('does not join across an unrelated word or choose the first repeated text', () => {
    const repeated = [word('first-the', 10, 20, 'the'), word('unrelated', 18, 20, 'cat'),
      word('second-the', 26, 20, 'the')];
    const [visual] = buildAnnotationVisuals([correction('c', ['second-the'])], repeated, 1, 1000, 1200);
    expect(visual.segments).toHaveSize(1);
    expect(visual.segments[0].left).toBeGreaterThan(25);
    const [discontinuous] = buildAnnotationVisuals([correction('d', ['first-the', 'second-the'])],
      repeated, 1, 1000, 1200);
    expect(discontinuous.segments).toHaveSize(2);
  });

  it('isolates pages and safely falls back to legacy boxes for missing IDs', () => {
    const legacy = { ...correction('legacy', ['missing']), bboxList: [{ x: 5, y: 6, w: 8, h: 3 }] };
    const visuals = buildAnnotationVisuals([correction('other', ['word_1_1'], 2), legacy], words, 1, 1000, 1200);
    expect(visuals.map((item) => item.annotation._id)).toEqual(['legacy']);
    expect(visuals[0].segments[0].left).toBeGreaterThan(4.7);
    expect(visuals[0].segments[0].left).toBeLessThan(5);
  });

  it('keeps percent geometry aligned at natural and half rendered sizes', () => {
    const [visual] = buildAnnotationVisuals([correction('c', ['word_1_1'])], words, 1, 1000, 1200);
    const line = visual.segments[0];
    expect(line.left * 1000 / 100 / 2).toBeCloseTo(line.left * 500 / 100);
    expect(line.top * 1200 / 100 / 2).toBeCloseTo(line.top * 600 / 100);
  });

  it('keeps tiny boxes visible and ignores corrections with no usable geometry', () => {
    const tiny = [{ id: 'tiny', text: 'i', bbox: { x: 99.9, y: 95, w: 0.01, h: 1 } }];
    const visuals = buildAnnotationVisuals([correction('tiny-c', ['tiny']), correction('missing', ['unknown'])],
      tiny, 1, 1000, 1200);
    expect(visuals).toHaveSize(1);
    expect(visuals[0].segments[0].width).toBeGreaterThan(0);
    expect(visuals[0].segments[0].left + visuals[0].segments[0].width).toBeLessThanOrEqual(100);
  });
});
