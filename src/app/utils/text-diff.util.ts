// Draft comparison v2: a local, deterministic text diff (no network, no AI). Word level for typical essays, sentence level above a size or
// edit-distance cap. Myers O(ND) on the part between the shared prefix and suffix. Output is plain text segments: the caller renders them by
// interpolation only (never innerHTML).

export type DiffKind = 'equal' | 'added' | 'removed' | 'modified';
/** One run of text. `modified`: `text` is the new text, `previous` the text it replaced. */
export interface DiffSegment { kind: DiffKind; text: string; previous?: string; }
export interface DiffResult { level: 'word' | 'sentence'; segments: DiffSegment[]; added: number; removed: number; modified: number; }

/** Above this many words in either draft the diff compares sentences instead of words. */
export const WORD_LIMIT = 4000;
/** Above this many word edits (D in Myers) the word diff stops and the sentence diff is used. */
export const EDIT_LIMIT = 2500;

/** Words with the whitespace that follows them, so joining the tokens gives the text back. */
export function wordTokens(text: string): string[] {
  const source = String(text ?? '');
  const lead = source.match(/^\s+/)?.[0] ?? '';
  const tokens = source.slice(lead.length).match(/\S+\s*/g) ?? [];
  if (lead && tokens.length) tokens[0] = lead + tokens[0];
  return tokens;
}
/** Sentences with the whitespace that follows them. */
export function sentenceTokens(text: string): string[] {
  return String(text ?? '').match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*|\n+/g)?.filter(Boolean) ?? [];
}
const key = (token: string): string => token.trim();

interface Op { kind: 'equal' | 'added' | 'removed'; token: string }

/**
 * Myers shortest edit script between two token lists, comparing trimmed tokens. Returns null when more than `maxEdits` edits are needed.
 * Memory: one copy of the frontier per edit step, only the 2d+1 diagonals reachable at that step.
 */
export function myers(a: string[], b: string[], maxEdits = EDIT_LIMIT): Op[] | null {
  const n = a.length, m = b.length, max = n + m;
  const ka = a.map(key), kb = b.map(key);
  if (max === 0) return [];
  // One spare cell on each side, so the saved window [-d-1, d+1] never runs past the array for any d <= max.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 4);
  const trace: Int32Array[] = [];
  let found = -1;
  const limit = Math.min(max, maxEdits);
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && ka[x] === kb[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  // Walk back through the saved frontiers. trace[d] is the frontier before step d (window starting at diagonal -d-1).
  const at = (d: number, k: number): number => { const row = trace[d]; const start = -d - 1; const i = k - start; return i >= 0 && i < row.length ? row[i] : -1; };
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const k = x - y;
    const down = k === -d || (k !== d && at(d, k - 1) < at(d, k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(d, prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ kind: 'equal', token: b[y - 1] }); x--; y--; }
    if (down) { ops.push({ kind: 'added', token: b[prevY] }); } else { ops.push({ kind: 'removed', token: a[prevX] }); }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { ops.push({ kind: 'equal', token: b[y - 1] }); x--; y--; }
  ops.reverse();
  return ops;
}

function diffTokens(a: string[], b: string[], maxEdits: number): Op[] | null {
  let start = 0;
  while (start < a.length && start < b.length && key(a[start]) === key(b[start])) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && key(a[endA - 1]) === key(b[endB - 1])) { endA--; endB--; }
  const middle = myers(a.slice(start, endA), b.slice(start, endB), maxEdits);
  if (!middle) return null;
  return [...b.slice(0, start).map(token => ({ kind: 'equal' as const, token })), ...middle, ...b.slice(endB).map(token => ({ kind: 'equal' as const, token }))];
}

/** Runs of the same kind, joined; a removed run directly followed by an added run becomes one "modified" segment. */
function toSegments(ops: Op[]): DiffSegment[] {
  const runs: DiffSegment[] = [];
  for (const op of ops) {
    const last = runs[runs.length - 1];
    if (last && last.kind === op.kind) last.text += op.token; else runs.push({ kind: op.kind, text: op.token });
  }
  const out: DiffSegment[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i], next = runs[i + 1];
    if (run.kind === 'removed' && next?.kind === 'added') { out.push({ kind: 'modified', text: next.text, previous: run.text }); i++; }
    else out.push(run);
  }
  return out;
}

/** The diff of two drafts: word level when it is small enough, otherwise sentence level. */
export function diffTexts(previous: string, current: string, { wordLimit = WORD_LIMIT, editLimit = EDIT_LIMIT } = {}): DiffResult {
  const a = wordTokens(previous), b = wordTokens(current);
  let level: DiffResult['level'] = 'word';
  let ops = a.length <= wordLimit && b.length <= wordLimit ? diffTokens(a, b, editLimit) : null;
  if (!ops) {
    level = 'sentence';
    const sa = sentenceTokens(previous), sb = sentenceTokens(current);
    ops = diffTokens(sa, sb, Number.MAX_SAFE_INTEGER) ?? [];
  }
  const segments = toSegments(ops);
  return { level, segments, added: segments.filter(s => s.kind === 'added').length, removed: segments.filter(s => s.kind === 'removed').length,
    modified: segments.filter(s => s.kind === 'modified').length };
}
