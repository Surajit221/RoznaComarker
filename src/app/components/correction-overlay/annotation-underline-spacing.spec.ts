import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
import { buildAnnotationVisuals, computeUnderlineClearance } from './annotation-geometry';
import { layoutAnnotationGroups, sharedSegments } from './annotation-layout';
import { CorrectionOverlay } from './correction-overlay';

const word = (id: string, x: number, y: number, h = 3, w = 8): OcrWord =>
  ({ id, text: id, bbox: { x, y, w, h }, separatorBefore: ' ' });
const issue = (id: string, wordIds: string[], symbol = 'SP'): FeedbackAnnotation =>
  ({ _id: id, submissionId: 'spacing', page: 1, source: 'AI', editable: false, wordIds,
    symbol, category: 'MECHANICS', color: '#6b50a0', message: 'Existing feedback' });
const strokes = (words: OcrWord[], issues: FeedbackAnnotation[]) =>
  sharedSegments(buildAnnotationVisuals(issues, words, 1, 1000, 1200), false);

describe('target-relative image underline clearance', () => {
  it('sits immediately below the target with a small word-height gap', () => {
    const [s] = strokes([word('Known', 10, 20)], [issue('c', ['Known'])]);
    expect(s.top).toBeCloseTo(23.18, 8);
    expect(s.top).toBeGreaterThan(23);
  });

  it('scales the gap with word height without a natural-image pixel minimum', () => {
    expect(computeUnderlineClearance(20, 1).top - 20).toBeCloseTo(.06, 8);
    expect(computeUnderlineClearance(20, 2).top - 20).toBeCloseTo(.12, 8);
    expect(computeUnderlineClearance(20, 10).top - 20).toBeCloseTo(.18, 8);
    const words = [word('tiny', 10, 20, .1)], annotations = [issue('c', ['tiny'])];
    expect(buildAnnotationVisuals(annotations, words, 1, 60, 80)[0].segments[0].top)
      .toBe(buildAnnotationVisuals(annotations, words, 1, 3000, 4000)[0].segments[0].top);
  });

  for (const gap of [.5, .14, .01]) it(`reserves the full stroke before a next-line gap of ${gap}%`, () => {
    // The next line is deliberately uncorrected: all page geometry protects ink.
    const words = [word('shape', 10, 20), word('uncorrected', 10, 23 + gap)];
    const [s] = strokes(words, [issue('agr', ['shape'], 'AGR')]);
    expect(s.top).toBeGreaterThan(23);
    expect(s.top).toBeLessThan(23 + gap);
    expect(s.underlineBottom!).toBeLessThan(23 + gap);
    expect(s.underlineBottom!).toBeGreaterThan(s.top);
    if (gap < .2) expect(s.top - 23).toBeLessThan(.18);
  });

  it('uses the highest protected box on the following physical line', () => {
    const words = [word('shape', 10, 20), word('next', 10, 23.5), word('tall', 19, 23.2, 3.5)];
    const [s] = strokes(words, [issue('c', ['shape'])]);
    expect(s.top).toBeGreaterThan(23);
    expect(s.underlineBottom!).toBeLessThan(23.2);
  });

  it('uses image bounds as clearance for the last line', () => {
    const [s] = strokes([word('last', 10, 96.95)], [issue('c', ['last'])]);
    expect(s.top).toBeGreaterThan(99.95);
    expect(s.underlineBottom!).toBeLessThan(100);
  });

  it('does not hide or move a target through its handwriting when source boxes already overlap', () => {
    const words = [word('shape', 10, 20), word('next', 10, 22.9)];
    const [s] = strokes(words, [issue('c', ['shape'])]);
    expect(s.top).toBe(23); expect(s.underlineBottom!).toBeGreaterThan(s.top);
    expect(s.correctionIds).toEqual(['c']);
  });

  it('retains the small existing horizontal padding for a single mapped word', () => {
    const [s] = strokes([word('marrige', 42, 20)], [issue('c', ['marrige'])]);
    expect(s.left).toBeCloseTo(41.85, 8);
    expect(s.width).toBeCloseTo(8.3, 8);
  });

  it('spans only the mapped same-line phrase union', () => {
    const words = [word('a', 10, 20), word('b', 19, 20), word('unrelated', 28, 20)];
    const [s] = strokes(words, [issue('c', ['a', 'b'])]);
    expect(s.left).toBeCloseTo(9.85, 8); expect(s.width).toBeCloseTo(17.3, 8);
  });

  it('keeps multiline targets as separate strokes with one unchanged correction', () => {
    const words = [word('a', 10, 20), word('b', 10, 23.14)];
    const annotations = [issue('one', ['a', 'b'])], before = JSON.stringify({ words, annotations });
    const segments = strokes(words, annotations);
    expect(segments).toHaveSize(2);
    expect(new Set(segments.map(s => s.lineKey)).size).toBe(2);
    expect(segments[0].underlineBottom!).toBeLessThan(words[1].bbox!.y);
    expect(segments[1].top).toBeGreaterThan(words[1].bbox!.y + words[1].bbox!.h);
    expect(segments.every(s => s.correctionIds.length === 1 && s.correctionIds[0] === 'one')).toBeTrue();
    expect(layoutAnnotationGroups(buildAnnotationVisuals(annotations, words, 1, 1000, 1200), 800, 960)
      .flatMap(g => g.annotations)).toHaveSize(1);
    expect(JSON.stringify({ words, annotations })).toBe(before);
  });

  it('keeps every correction, category/color, word ID and badge code unchanged', () => {
    const codes = ['AGR', 'CAP', 'PREP', 'ART', 'SP'];
    const words = codes.map((code, i) => word(code, 10 + i * 17, 20 + i * 3.14));
    const annotations = codes.map(code => issue(code, [code], code));
    const before = JSON.stringify({ words, annotations });
    const visuals = buildAnnotationVisuals(annotations, words, 1, 1000, 1200);
    expect(strokes(words, annotations)).toHaveSize(5);
    const groups = layoutAnnotationGroups(visuals, 1000, 1200);
    expect(groups).toHaveSize(5);
    expect(groups.map(g => g.code)).toEqual(codes);
    expect(visuals.every(v => v.segments.every(s => s.color === v.annotation.color))).toBeTrue();
    expect(JSON.stringify({ words, annotations })).toBe(before);
  });

  it('retains the existing exact-range overlap group and single visible stroke', () => {
    const words = [word('w', 10, 20), word('next', 10, 23.14)];
    const annotations = ['AGR', 'CAP', 'SP'].map(code => issue(code, ['w'], code));
    const visuals = buildAnnotationVisuals(annotations, words, 1, 1000, 1200);
    const segments = sharedSegments(visuals, false), [group] = layoutAnnotationGroups(visuals, 1000, 1200);
    expect(segments).toHaveSize(1); expect(segments[0].correctionIds).toEqual(['AGR', 'CAP', 'SP']);
    expect(group.annotations.map(a => a._id)).toEqual(['AGR', 'CAP', 'SP']);
    expect(group.code).toBe('AGR·CAP+1');
  });

  it('leaves punctuation boundary anchors unchanged', () => {
    const words = [word('w', 10, 20)];
    const annotation = { ...issue('c', []), renderTarget: { version: 1 as const, source: 'visualTarget' as const,
      wordIds: [], anchors: [{ wordId: 'w', side: 'after' as const, operation: 'INSERT' as const }], boxes: [] } };
    const [s] = strokes(words, [annotation]);
    expect(s.boundary).toBeTrue(); expect(s.top).toBe(23); expect(s.underlineBottom).toBeUndefined();
  });
});

describe('rendered underline stroke clearance', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay);
  });
  afterEach(() => fixture.destroy());

  for (const width of [375, 768, 1440]) it(`keeps normal/selected strokes before the next writing line at ${width}px`, async () => {
    const words = [word('shape', 10, 20), word('next', 10, 23.14)];
    fixture.nativeElement.style.width = width + 'px';
    fixture.componentRef.setInput('ocrWords', words);
    fixture.componentRef.setInput('annotations', [issue('c', ['shape'], 'AGR')]);
    fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"/>'));
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    const stroke = fixture.nativeElement.querySelector('.correction-overlay__underline') as HTMLElement;
    const imageRect = image.getBoundingClientRect();
    for (const selected of [false, true]) {
      stroke.classList.toggle('is-selected', selected);
      const rect = stroke.getBoundingClientRect();
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.top).toBeGreaterThanOrEqual(imageRect.top + imageRect.height * .23 - .02);
      expect(rect.bottom).toBeLessThan(imageRect.top + imageRect.height * .2314);
    }
    expect(fixture.componentInstance.markers).toHaveSize(1);
    expect(fixture.componentInstance.markers[0].code).toBe('AGR');
  });
});
