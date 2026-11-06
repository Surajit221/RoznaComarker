/**
 * The colour of a stroke on the page image, derived from the legend colour of its error type: the same hue, strong enough to read as that colour.
 * The legend's colours are pale because they are made for highlights behind text. There is no second palette: a new legend colour gets its stroke from here.
 * A thin dark halo (website and PDF stylesheets) carries the contrast against the paper: measured 5.6:1 to 13:1 on the sample photos.
 */
const STROKE_SATURATION = 0.9, STROKE_LIGHTNESS = 0.42;

export function annotationStrokeColor(color: string | null | undefined): string {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color ?? ''));
  if (!match) return String(color ?? '');
  const value = parseInt(match[1], 16);
  const r = (value >> 16) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
  const max = Math.max(r, g, b), range = max - Math.min(r, g, b);
  // A colour without a hue stays neutral.
  if (!range) return `#${match[1]}`;
  const sector = max === r ? ((g - b) / range + 6) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
  const chroma = (1 - Math.abs(2 * STROKE_LIGHTNESS - 1)) * STROKE_SATURATION;
  const second = chroma * (1 - Math.abs(sector % 2 - 1));
  const base = STROKE_LIGHTNESS - chroma / 2;
  const [red, green, blue] = sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second]
    : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second];
  return `rgb(${[red, green, blue].map(channel => Math.round((channel + base) * 255)).join(',')})`;
}
