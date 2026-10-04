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
}

export const DESKTOP_BADGE_METRICS: Readonly<AnnotationBadgeMetrics> = Object.freeze({
  height: 28, minWidth: 30, maxWidth: 92, charWidth: 6, widthAllowance: 14,
  fontSize: 9, paddingX: 2, border: 2, hitSize: 0, hitPadding: 0,
  collisionHeight: 32, edgeY: 15, offsetY: 17, fallbackOffsetY: 47, shadow: '0 2px 7px rgba(15,23,42,.32)'
});

/** Preserve existing >768px presentation, including the former <=1024px styling. */
export function annotationBadgeMetrics(viewportWidth: number): Readonly<AnnotationBadgeMetrics> {
  if (viewportWidth > 1024) return DESKTOP_BADGE_METRICS;
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
    shadow: '0 1px 3px rgba(15,23,42,.24)' };
}
