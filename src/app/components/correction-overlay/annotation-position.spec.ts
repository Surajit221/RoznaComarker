import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { buildAnnotationVisuals } from './annotation-geometry';
import { badgeLocalityRadius, layoutAnnotationGroups } from './annotation-layout';
import { annotationBadgeMetrics } from './annotation-badge-metrics';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';

const correction = (id: string, wordIds: string[]): FeedbackAnnotation => ({
  _id: id, submissionId: 'position-fixture', source: 'AI', editable: false, page: 1,
  symbol: 'SP', category: 'MECHANICS', wordIds, evidenceWordIds: [...wordIds],
  quotedText: 'time', suggestedText: 'time', confidence: .9, message: 'Frozen feedback',
  renderTarget: { version: 1, source: 'wordIds', wordIds: [...wordIds], anchors: [], boxes: [] }
});
const words: OcrWord[] = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, text: 'time',
  bbox: { x: 1 + i % 5 * 21, y: 1 + Math.floor(i / 5) * 18, w: 10, h: 4 },
  separatorBefore: i % 5 ? ' ' : '\n' }));

describe('presentation-only badge locality', () => {
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    it(`keeps dense adjacent lines and edge targets local at ${width}px without changing inputs`, () => {
      const annotations = words.map(w => correction(w.id, [w.id]));
      const frozen = { annotations, words, score: 73, categoryScores: { mechanics: 18 }, count: 30 };
      const before = JSON.stringify(frozen);
      const visuals = buildAnnotationVisuals(annotations, words, 1, 1200, 1600);
      const geometry = JSON.stringify(visuals);
      const height = width * 4 / 3, metrics = annotationBadgeMetrics(width);
      const groups = layoutAnnotationGroups(visuals, width, height, 110, metrics);
      expect(groups).toHaveSize(30);
      for (const g of groups) {
        expect(Math.hypot((g.left - g.anchorLeft) * width / 100,
          (g.top - g.anchorTop) * height / 100)).toBeLessThanOrEqual(badgeLocalityRadius(metrics) + .001);
        expect(g.left * width / 100 - g.width / 2).toBeGreaterThanOrEqual(0);
        expect(g.left * width / 100 + g.width / 2).toBeLessThanOrEqual(width);
        expect(g.top * height / 100 - metrics.height / 2).toBeGreaterThanOrEqual(0);
        expect(g.top * height / 100 + metrics.height / 2).toBeLessThanOrEqual(height);
      }
      expect(JSON.stringify(visuals)).toBe(geometry);
      expect(JSON.stringify(frozen)).toBe(before);
    });
  }
  it('groups exact shared IDs while keeping repeated text and adjacent source IDs distinct', () => {
    const items = [correction('a', ['w1']), correction('b', ['w1']), correction('c', ['w2'])];
    const groups = layoutAnnotationGroups(buildAnnotationVisuals(items, words, 1, 1200, 1600), 320, 426);
    expect(groups).toHaveSize(2);
    expect(groups.find(g => g.annotations.length === 2)?.annotations.map(a => a._id)).toEqual(['a', 'b']);
  });
  it('anchors multiline badges to the first affected line rather than a union center', () => {
    const visuals = buildAnnotationVisuals([correction('multi', ['w0', 'w20'])], words, 1, 1200, 1600);
    expect(visuals[0].segments).toHaveSize(2);
    const [group] = layoutAnnotationGroups(visuals, 375, 500);
    expect(group.anchorTop).toBe(visuals[0].segments[0].anchorTop);
    expect(group.anchorTop).toBeLessThan(5);
  });
  it('uses the second repeated word ID and preserves exact before/after punctuation anchors', () => {
    const item = correction('repeat', ['w1']);
    const [visual] = buildAnnotationVisuals([item], words, 1, 1200, 1600);
    expect(visual.segments[0].left).toBeGreaterThan(20);
    for (const side of ['before', 'after'] as const) {
      const anchored = correction(side, []);
      anchored.renderTarget!.anchors = [{ wordId: 'w1', side, operation: 'INSERT', punctuation: ',' }];
      const before = JSON.stringify(anchored);
      const [v] = buildAnnotationVisuals([anchored], words, 1, 1200, 1600);
      const s = v.segments[0];
      expect(s.left + s.width / 2).toBeCloseTo(side === 'before' ? 22 : 32, 6);
      expect(s.top).toBe(5);
      layoutAnnotationGroups([v], 375, 500);
      expect(JSON.stringify(anchored)).toBe(before);
    }
  });
});

describe('actual image rectangle mapping', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay);
  });
  afterEach(() => fixture.destroy());

  async function render(w: number, h: number, width: number): Promise<HTMLImageElement> {
    const targets = [{ x: 25, y: 40, w: 10, h: 5 }, { x: 1, y: 1, w: 5, h: 2 },
      { x: 93, y: 65, w: 6, h: 3 }, { x: 40, y: 92, w: 8, h: 4 }];
    const ocrWords = targets.map((bbox, i) => ({ id: `t${i}`, text: 'time', bbox, separatorBefore: '\n' }));
    fixture.nativeElement.style.width = `${width}px`;
    fixture.componentRef.setInput('ocrWords', ocrWords);
    fixture.componentRef.setInput('annotations', ocrWords.map(w => correction(w.id, [w.id])));
    fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/></svg>`));
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode();
    fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return image;
  }

  for (const [w, h] of [[600, 800], [800, 600], [1000, 1000], [1200, 1600], [1600, 1200], [3024, 4032], [4032, 3024]]) {
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
      it(`maps exact normalized targets for ${w}x${h} at ${width}px`, async () => {
        const image = await render(w, h, width), rect = image.getBoundingClientRect();
        const stage = fixture.nativeElement.querySelector('.correction-overlay__image-stage').getBoundingClientRect();
        expect(stage.width).toBeCloseTo(rect.width, 1);
        expect(stage.height).toBeCloseTo(rect.height, 1);
        expect(stage.left).toBeCloseTo(rect.left, 1);
        expect(stage.top).toBeCloseTo(rect.top, 1);
        const strokes = Array.from(fixture.nativeElement.querySelectorAll('.correction-overlay__underline')) as HTMLElement[];
        for (let i = 0; i < strokes.length; i++) {
          const s = fixture.componentInstance.underlineSegments[i], actual = strokes[i].getBoundingClientRect();
          expect(Math.abs(actual.left - rect.left - s.left * rect.width / 100)).toBeLessThan(.6);
          expect(Math.abs(actual.top - rect.top - s.top * rect.height / 100)).toBeLessThan(.6);
          expect(Math.abs(actual.width - s.width * rect.width / 100)).toBeLessThan(.6);
        }
        const target = fixture.componentInstance.underlineSegments.find(s => s.correctionIds.includes('t0'))!;
        expect(target.left).toBeLessThanOrEqual(25);
        expect(target.left + target.width).toBeGreaterThanOrEqual(35);
        expect(target.top).toBeGreaterThanOrEqual(45);
      });
    }
  }
  it('relayouts when only actual height changes and ignores subpixel noise', async () => {
    const image = await render(600, 800, 375);
    let height = 500;
    spyOn(image, 'getBoundingClientRect').and.callFake(() => ({ width: 375, height } as DOMRect));
    fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    const internals = fixture.componentInstance as unknown as { renderedHeight: number; layoutMarkers(): void };
    const layout = spyOn(internals, 'layoutMarkers').and.callThrough();
    height = 280;
    fixture.componentInstance.onViewportChange();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(internals.renderedHeight).toBe(280);
    expect(layout).toHaveBeenCalledTimes(1);
    height = 280.1;
    fixture.componentInstance.onViewportChange();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(layout).toHaveBeenCalledTimes(1);
  });
  it('handles URL aspect changes, cached decode, container resize and orientation without changing targets', async () => {
    await render(600, 800, 375);
    const before = JSON.stringify(fixture.componentInstance.annotations);
    const portrait = fixture.nativeElement.querySelector('img').getBoundingClientRect();
    const image = await render(800, 600, 375);
    expect(image.getBoundingClientRect().height).toBeLessThan(portrait.height);
    expect(image.getBoundingClientRect().width).toBeCloseTo(portrait.width, 1);
    const component = fixture.componentInstance;
    const internals = component as unknown as { checkCachedImage(url: string): void; renderedWidth: number; renderedHeight: number };
    internals.checkCachedImage(component.imageUrl!);
    await Promise.resolve();
    expect(component.mediaState).toBe('loaded');
    fixture.nativeElement.style.width = '768px';
    window.dispatchEvent(new Event('orientationchange'));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(internals.renderedWidth).toBeCloseTo(768, 1);
    expect(internals.renderedHeight).toBeCloseTo(576, 1);
    fixture.nativeElement.style.width = '320px';
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(internals.renderedWidth).toBeCloseTo(320, 1);
    expect(JSON.stringify(component.annotations)).toBe(before);
  });
});
