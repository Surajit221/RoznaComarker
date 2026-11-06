import { annotationStrokeColor } from './annotation-stroke';

describe('annotationStrokeColor', () => {
  const hue = (color: string): number => {
    const [r, g, b] = color.match(/\d+/g)!.map(Number).map(n => n / 255), max = Math.max(r, g, b), range = max - Math.min(r, g, b);
    return (max === r ? ((g - b) / range + 6) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4) * 60;
  };
  it('keeps the legend hue of every error type, with real colour', () => {
    for (const [legend, expected] of [['#FFD6A5', 33], ['#CDE7F0', 195], ['#B7E4C7', 141], ['#E4C1F9', 278], ['#FFF3BF', 48]] as [string, number][]) {
      expect(Math.abs(hue(annotationStrokeColor(legend)) - expected)).toBeLessThan(3);
    }
  });
  it('never invents a colour', () => {
    expect(annotationStrokeColor('#808080')).toBe('#808080');
    expect(annotationStrokeColor('red')).toBe('red');
    expect(annotationStrokeColor(undefined)).toBe('');
  });
});
