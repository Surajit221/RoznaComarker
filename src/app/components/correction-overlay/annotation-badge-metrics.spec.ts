import { annotationBadgeMetrics, DESKTOP_BADGE_METRICS } from './annotation-badge-metrics';
import { layoutAnnotationGroups } from './annotation-layout';
import { buildAnnotationVisuals } from './annotation-geometry';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';

describe('responsive badge sizing', () => {
  const words: OcrWord[] = [{ id: 'w', text: 'word', bbox: { x: 50, y: 40, w: 10, h: 3 } }];
  const annotations: FeedbackAnnotation[] = ['AGR', 'WC', 'T'].map((symbol, i) => ({
    _id: String(i), submissionId: 's', source: 'AI', editable: false, symbol, wordIds: ['w']
  }));
  const visuals = buildAnnotationVisuals(annotations, words, 1, 1000, 1200);
  it('preserves desktop and 1024px layout dimensions', () => {
    expect(annotationBadgeMetrics(1440)).toBe(DESKTOP_BADGE_METRICS);
    expect(annotationBadgeMetrics(1024)).toEqual(jasmine.objectContaining({ height: 26, charWidth: 6,
      minWidth: 30, collisionHeight: 32, offsetY: 17, fallbackOffsetY: 47 }));
    expect(layoutAnnotationGroups(visuals, 1000, 1200)).toEqual(
      layoutAnnotationGroups(visuals, 1000, 1200, 110, annotationBadgeMetrics(1024)));
  });
  for (const width of [430, 390, 375]) {
    it(`reduces local and group size at ${width}px without changing canonical targets`, () => {
      const before = JSON.stringify(visuals), metrics = annotationBadgeMetrics(width);
      const group = layoutAnnotationGroups(visuals, width - 32, 600, 110, metrics)[0];
      expect(metrics.height).toBe(width === 430 ? 20 : 19);
      expect(metrics.fontSize).toBe(width === 430 ? 8 : 7.5);
      expect(metrics.paddingX).toBe(3.5);
      expect(metrics.widthAllowance).toBe(metrics.paddingX * 2 + metrics.border * 2);
      expect(metrics.collisionHeight).toBe(width === 430 ? 25 : 24);
      expect(metrics.edgeY).toBe(width === 430 ? 11.5 : 11);
      expect(metrics.offsetY).toBe(width === 430 ? 13.5 : 13);
      expect(metrics.fallbackOffsetY).toBe(width === 430 ? 36.5 : 35);
      expect(metrics.hitSize).toBe(40);
      expect(group.width).toBeLessThan(layoutAnnotationGroups(visuals, width - 32, 600)[0].width);
      expect(group.annotations).toEqual(annotations); expect(JSON.stringify(visuals)).toBe(before);
      expect(group.left * (width - 32) / 100 - group.width / 2).toBeGreaterThanOrEqual(0);
      expect(group.top * 6 - metrics.height / 2).toBeGreaterThanOrEqual(0);
    });
  }
  it('sizes by viewport class rather than image width or orientation', () => {
    expect(annotationBadgeMetrics(768).height).toBe(24);
    expect(annotationBadgeMetrics(769).height).toBe(26);
    expect(annotationBadgeMetrics(480).height).toBe(20);
    expect(annotationBadgeMetrics(390).height).toBe(19);
  });
});
