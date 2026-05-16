/**
 * worksheet-patterns.util.ts
 *
 * Generates inline SVG background pattern data-URIs based on a patternType
 * and primaryColor from a WorksheetTheme. Used by the worksheet-viewer and
 * worksheet-pdf-template to render the background pattern decoration.
 */

export type WorksheetPatternType =
  | 'none' | 'leaves' | 'dots' | 'stars' | 'waves'
  | 'geometric' | 'honeycomb' | 'circuit' | 'bubbles'
  | 'grid' | 'paws' | 'musical-notes' | 'molecules'
  | 'books' | 'clouds' | 'grass' | 'space';

function svgToDataUri(svg: string): string {
  const encoded = svg
    .replace(/\n/g, ' ')
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/{/g, '%7B')
    .replace(/}/g, '%7D')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${encoded}")`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const PATTERN_GENERATORS: Record<WorksheetPatternType, (color: string) => string> = {
  none: () => 'none',

  dots: (color) => {
    const c = hexToRgba(color, 0.18);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='10' cy='10' r='2.5' fill='${c}'/></svg>`;
    return svgToDataUri(svg);
  },

  grid: (color) => {
    const c = hexToRgba(color, 0.12);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><path d='M 30 0 L 0 0 0 30' fill='none' stroke='${c}' stroke-width='1'/></svg>`;
    return svgToDataUri(svg);
  },

  stars: (color) => {
    const c = hexToRgba(color, 0.22);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><polygon points='20,4 23,15 35,15 25,22 28,34 20,27 12,34 15,22 5,15 17,15' fill='${c}'/></svg>`;
    return svgToDataUri(svg);
  },

  leaves: (color) => {
    const c = hexToRgba(color, 0.2);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><path d='M10,25 Q10,10 25,10 Q25,25 10,25 Z' fill='${c}'/><path d='M40,25 Q40,10 25,10 Q25,25 40,25 Z' fill='${c}' transform='rotate(180,25,17.5)'/></svg>`;
    return svgToDataUri(svg);
  },

  waves: (color) => {
    const c = hexToRgba(color, 0.16);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='20'><path d='M0,10 C15,0 45,20 60,10' stroke='${c}' stroke-width='2' fill='none'/></svg>`;
    return svgToDataUri(svg);
  },

  geometric: (color) => {
    const c = hexToRgba(color, 0.14);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><polygon points='20,2 38,38 2,38' fill='none' stroke='${c}' stroke-width='1.5'/><rect x='10' y='10' width='20' height='20' fill='none' stroke='${c}' stroke-width='1' transform='rotate(45,20,20)'/></svg>`;
    return svgToDataUri(svg);
  },

  honeycomb: (color) => {
    const c = hexToRgba(color, 0.15);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='100'><polygon points='28,1 55,15 55,44 28,58 1,44 1,15' fill='none' stroke='${c}' stroke-width='1.5'/><polygon points='28,58 55,72 55,101 28,115 1,101 1,72' fill='none' stroke='${c}' stroke-width='1.5'/></svg>`;
    return svgToDataUri(svg);
  },

  circuit: (color) => {
    const c = hexToRgba(color, 0.14);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='10' cy='10' r='3' fill='${c}'/><circle cx='50' cy='50' r='3' fill='${c}'/><circle cx='50' cy='10' r='2' fill='${c}'/><circle cx='10' cy='50' r='2' fill='${c}'/><line x1='10' y1='10' x2='50' y2='10' stroke='${c}' stroke-width='1'/><line x1='50' y1='10' x2='50' y2='50' stroke='${c}' stroke-width='1'/><line x1='10' y1='50' x2='10' y2='10' stroke='${c}' stroke-width='1' stroke-dasharray='4,4'/></svg>`;
    return svgToDataUri(svg);
  },

  bubbles: (color) => {
    const c = hexToRgba(color, 0.14);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='15' cy='15' r='8' fill='none' stroke='${c}' stroke-width='1.5'/><circle cx='45' cy='40' r='5' fill='none' stroke='${c}' stroke-width='1.5'/><circle cx='40' cy='12' r='3' fill='${c}'/><circle cx='12' cy='48' r='4' fill='none' stroke='${c}' stroke-width='1'/></svg>`;
    return svgToDataUri(svg);
  },

  paws: (color) => {
    const c = hexToRgba(color, 0.18);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='50' height='50'><ellipse cx='25' cy='32' rx='9' ry='7' fill='${c}'/><ellipse cx='14' cy='20' rx='4' ry='5' fill='${c}'/><ellipse cx='36' cy='20' rx='4' ry='5' fill='${c}'/><ellipse cx='20' cy='14' rx='4' ry='5' fill='${c}'/><ellipse cx='30' cy='14' rx='4' ry='5' fill='${c}'/></svg>`;
    return svgToDataUri(svg);
  },

  'musical-notes': (color) => {
    const c = hexToRgba(color, 0.18);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><text x='8' y='35' font-size='28' fill='${c}'>♪</text><text x='36' y='20' font-size='18' fill='${c}'>♫</text></svg>`;
    return svgToDataUri(svg);
  },

  molecules: (color) => {
    const c = hexToRgba(color, 0.16);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='15' cy='15' r='5' fill='${c}'/><circle cx='45' cy='15' r='5' fill='${c}'/><circle cx='30' cy='45' r='5' fill='${c}'/><line x1='15' y1='15' x2='45' y2='15' stroke='${c}' stroke-width='2'/><line x1='45' y1='15' x2='30' y2='45' stroke='${c}' stroke-width='2'/><line x1='30' y1='45' x2='15' y2='15' stroke='${c}' stroke-width='2'/></svg>`;
    return svgToDataUri(svg);
  },

  books: (color) => {
    const c = hexToRgba(color, 0.16);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect x='10' y='15' width='12' height='30' rx='2' fill='${c}'/><rect x='25' y='10' width='10' height='35' rx='2' fill='${c}' opacity='0.7'/><rect x='38' y='18' width='14' height='27' rx='2' fill='${c}' opacity='0.5'/></svg>`;
    return svgToDataUri(svg);
  },

  clouds: (color) => {
    const c = hexToRgba(color, 0.14);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='50'><ellipse cx='30' cy='30' rx='20' ry='12' fill='${c}'/><ellipse cx='20' cy='28' rx='12' ry='10' fill='${c}'/><ellipse cx='42' cy='28' rx='13' ry='10' fill='${c}'/><ellipse cx='62' cy='38' rx='14' ry='9' fill='${c}'/><ellipse cx='54' cy='36' rx='10' ry='8' fill='${c}'/></svg>`;
    return svgToDataUri(svg);
  },

  grass: (color) => {
    const c = hexToRgba(color, 0.18);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M10,35 Q8,20 12,10 Q14,20 16,35' fill='${c}'/><path d='M20,35 Q18,15 22,5 Q26,15 24,35' fill='${c}'/><path d='M30,35 Q28,22 32,14 Q34,22 36,35' fill='${c}'/></svg>`;
    return svgToDataUri(svg);
  },

  space: (color) => {
    const c = hexToRgba(color, 0.22);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='10' cy='10' r='1.5' fill='${c}'/><circle cx='40' cy='25' r='2.5' fill='${c}'/><circle cx='70' cy='10' r='1' fill='${c}'/><circle cx='25' cy='55' r='1.5' fill='${c}'/><circle cx='60' cy='65' r='3' fill='${c}'/><circle cx='15' cy='70' r='1' fill='${c}'/><ellipse cx='50' cy='42' rx='10' ry='5' fill='none' stroke='${c}' stroke-width='1'/></svg>`;
    return svgToDataUri(svg);
  },
};

/**
 * Returns a CSS `background-image` value (an SVG data-URI or 'none') for the
 * given patternType + color. Designed to be set directly on an element's style.
 *
 * @param patternType - One of the WorksheetPatternType values
 * @param primaryColor - Hex color string (e.g. '#0d9488')
 */
export function getPatternBackground(
  patternType: WorksheetPatternType | string,
  primaryColor: string
): string {
  const generator = PATTERN_GENERATORS[patternType as WorksheetPatternType];
  if (!generator) return 'none';
  if (!primaryColor || !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
    return generator('#0d9488');
  }
  return generator(primaryColor);
}
