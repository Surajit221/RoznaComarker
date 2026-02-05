import type { WritingCorrectionIssue } from '../api/writing-corrections-api.service';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toRgba(hexColor: string, alpha: number): string {
  const c = String(hexColor || '').trim();
  const a = Number.isFinite(Number(alpha)) ? Number(alpha) : 0.25;

  if (!c.startsWith('#')) {
    return `rgba(255, 193, 7, ${a})`;
  }

  const hex = c.slice(1);
  const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
  if (full.length !== 6) {
    return `rgba(255, 193, 7, ${a})`;
  }

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  if (![r, g, b].every((v) => Number.isFinite(v))) {
    return `rgba(255, 193, 7, ${a})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function buildWritingCorrectionsHtml(text: string, issues: WritingCorrectionIssue[]): string {
  const safeText = typeof text === 'string' ? text : '';
  const list = Array.isArray(issues) ? issues : [];

  const normalized = list
    .map((i) => {
      const start = typeof i.start === 'number' ? i.start : Number(i.start);
      const end = typeof i.end === 'number' ? i.end : Number(i.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      if (start < 0 || end <= start || start >= safeText.length) return null;
      return {
        ...i,
        start: Math.max(0, Math.min(safeText.length, start)),
        end: Math.max(0, Math.min(safeText.length, end))
      };
    })
    .filter(Boolean) as WritingCorrectionIssue[];

  const sorted = normalized.sort((a, b) => b.start - a.start);

  let cursor = safeText.length;
  let html = '';

  for (const issue of sorted) {
    if (issue.end > cursor) {
      continue;
    }

    if (issue.end < cursor) {
      html = escapeHtml(safeText.slice(issue.end, cursor)) + html;
    }

    const snippet = safeText.slice(issue.start, issue.end);

    const symbol = escapeHtml(issue.symbol || '');
    const description = escapeHtml(issue.description || '');
    const label = escapeHtml(issue.symbolLabel || '');

    const tooltip = `${symbol}${label ? ' - ' + label : ''}${description ? '<br />' + description : ''}`;

    const bg = toRgba(issue.color, 0.28);
    const border = escapeHtml(issue.color || '#FFC107');

    html =
      `<span class="correction-highlight" data-symbol="${symbol}" style="background: ${bg}; border-bottom-color: ${border};">` +
      `${escapeHtml(snippet)}` +
      `<span style="color:${border}; font-weight:700; margin-left:2px;">${symbol}</span>` +
      `<span class="correction-tooltip"><strong style="color:${border}">${symbol}</strong><br />${tooltip}</span>` +
      `</span>` +
      html;

    cursor = issue.start;
  }

  if (cursor > 0) {
    html = escapeHtml(safeText.slice(0, cursor)) + html;
  }

  return html;
}
