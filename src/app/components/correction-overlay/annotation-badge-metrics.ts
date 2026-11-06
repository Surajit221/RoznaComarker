export interface AnnotationBadgeMetrics {
  height: number;
  minWidth: number;
  maxWidth: number;
  charWidth: number;
  widthAllowance: number;
  fontSize: number;
  paddingX: number;
  border: number;
  hitSize: number;
  hitPadding: number;
  collisionHeight: number;
  edgeY: number;
  offsetY: number;
  fallbackOffsetY: number;
  shadow: string;
  /** Task 21: thickness of underlines, rails and brackets, in CSS pixels. Desktop 2. */
  strokeWidth: number;
  /** Task 21: width of a bracket's end ticks, in CSS pixels. */
  bracketWidth: number;
}

export const DESKTOP_BADGE_METRICS: Readonly<AnnotationBadgeMetrics> = Object.freeze({
  height: 28, minWidth: 30, maxWidth: 92, charWidth: 6, widthAllowance: 14,
  fontSize: 9, paddingX: 2, border: 2, hitSize: 0, hitPadding: 0,
  collisionHeight: 32, edgeY: 15, offsetY: 17, fallbackOffsetY: 47, shadow: '0 2px 7px rgba(15,23,42,.32)',
  strokeWidth: 2, bracketWidth: 6
});

/** Task 21: at or below this RENDERED image width (CSS px) on a phone or tablet, chips are compact and strokes 3px. */
export const COMPACT_IMAGE_WIDTH = 420;

/**
 * Preserve existing >768px presentation, including the former <=1024px styling. On a phone or tablet the RENDERED image width (Task 21) decides
 * too: a page drawn 420px wide or less gets compact chips (16px, 7.5px text) and 3px strokes, whatever the viewport says.
 */
export function annotationBadgeMetrics(viewportWidth: number, renderedImageWidth = Infinity): Readonly<AnnotationBadgeMetrics> {
  if (viewportWidth > 1024) return DESKTOP_BADGE_METRICS;
  if (viewportWidth <= 768 && renderedImageWidth > 0 && renderedImageWidth <= COMPACT_IMAGE_WIDTH) {
    const placementHeight = 18;
    return { ...DESKTOP_BADGE_METRICS, height: 16, minWidth: 19, maxWidth: 70, charWidth: 4.4, widthAllowance: 8, fontSize: 7.5,
      paddingX: 3, border: 1, hitSize: 32, hitPadding: 0, collisionHeight: placementHeight + 4, edgeY: placementHeight / 2 + 1,
      offsetY: placementHeight / 2 + 3, fallbackOffsetY: placementHeight * 1.5 + 5, shadow: '0 1px 3px rgba(15,23,42,.24)',
      strokeWidth: 3, bracketWidth: 4 };
  }
  if (viewportWidth > 768) return { ...DESKTOP_BADGE_METRICS, height: 26, hitPadding: 6,
    shadow: '0 1px 5px rgba(15,23,42,.3)' };
  const small = viewportWidth <= 390, phone = viewportWidth <= 480;
  const height = small ? 19 : phone ? 20 : 24;
  // Keep the existing placement clearance while polishing the visible phone badge.
  const placementHeight = small ? 20 : phone ? 21 : 24;
  return { ...DESKTOP_BADGE_METRICS, height, minWidth: small ? 21 : phone ? 22 : 26,
    maxWidth: phone ? 76 : 84, charWidth: small ? 4.8 : phone ? 5 : 5.5,
    widthAllowance: phone ? 9 : 12, fontSize: small ? 7.5 : phone ? 8 : 9,
    paddingX: phone ? 3.5 : 5, border: 1, hitSize: 40, hitPadding: 0,
    collisionHeight: placementHeight + 4, edgeY: placementHeight / 2 + 1, offsetY: placementHeight / 2 + 3,
    fallbackOffsetY: placementHeight * 1.5 + 5,
    shadow: '0 1px 3px rgba(15,23,42,.24)', strokeWidth: phone ? 3 : 2, bracketWidth: phone ? 4 : 6 };
}
