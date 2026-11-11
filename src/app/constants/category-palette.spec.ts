import { CATEGORY_TONES, categoryTone } from './category-palette';
import { DEFAULT_CORRECTION_LEGEND } from './correction-legend.default';

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('category display palette', () => {
  const tones = Object.values(CATEGORY_TONES);

  it('keeps dark text at WCAG AA (4.5:1) or better on every highlight fill', () => {
    for (const tone of tones) expect(contrast(tone.text, tone.fill)).withContext(tone.key).toBeGreaterThanOrEqual(4.5);
  });

  it('makes every fill clearly visible on white, unlike the old 18% pastel tint', () => {
    for (const tone of tones) expect(contrast(tone.fill, '#FFFFFF')).withContext(tone.key).toBeGreaterThanOrEqual(1.25);
  });

  it('gives every edge a non-text contrast of at least 3:1 on white', () => {
    for (const tone of tones) expect(contrast(tone.edge, '#FFFFFF')).withContext(tone.key).toBeGreaterThanOrEqual(3);
  });

  it('keeps the five categories distinct from each other', () => {
    expect(new Set(tones.map(t => t.fill)).size).toBe(5);
    expect(new Set(tones.map(t => t.edge)).size).toBe(5);
  });

  it('resolves keys, labels and any case, and stored legend colours when the category is missing', () => {
    expect(categoryTone('GRAMMAR')?.key).toBe('GRAMMAR');
    expect(categoryTone('vocabulary')?.key).toBe('VOCABULARY');
    expect(categoryTone('Organization (Structure & Flow)')?.key).toBe('ORGANIZATION');
    for (const group of DEFAULT_CORRECTION_LEGEND.groups) expect(categoryTone(null, group.color)?.key).withContext(group.key).toBe(group.key as never);
    expect(categoryTone(null, '#ffd6a5')?.key).toBe('CONTENT');
  });

  it('returns null for an unknown category and colour so callers keep their own colour', () => {
    expect(categoryTone('STYLE', '#123456')).toBeNull();
    expect(categoryTone(undefined, undefined)).toBeNull();
  });
});
