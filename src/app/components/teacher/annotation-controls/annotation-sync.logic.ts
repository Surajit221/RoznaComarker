// Pure rules of the review workspace's highlight sync (Task 6C): where each list row sits on the image and in the transcript, what the shared
// selection does, which row the list must reveal. No Angular or DOM here. Geometry is only ever read from the server's snapshot, and
// correction-overlay/annotation-image-geometry.ts stays the one place that maps boxes through an image's rotation.
import type { OcrBBox } from '../../../models/ocr-token.model';
import type { AnnotationSnapshot, CorrectionRow, RowFilter, SnapshotPage } from './annotation-editor.logic';
import { matchesFilter } from './annotation-editor.logic';

export type ImagePosition = 'exact' | 'approximate' | 'none';
export type SyncState = 'hidden' | 'archived';
export interface RowPosition {
  /** Words to mark in the transcript; empty when the row has no safe place there. */
  transcriptWordIds: string[];
  image: ImagePosition;
  fileId: string; page: number;
}
export const NO_IMAGE_POSITION = 'No position on the image';
export const APPROXIMATE_POSITION = 'Approximate position';
export const NO_TRANSCRIPT_POSITION = 'Not in the transcript';

/** The server's checked target for a correction the student can see. */
interface EffectiveTarget { id: string; wordIds?: string[]; renderTarget?: { source?: string; wordIds?: string[]; boxes?: unknown[] } | null; }
type PlacedSnapshot = Pick<AnnotationSnapshot, 'pages' | 'effective'>;

/** Case and whitespace do not count; everything else (punctuation, spelling, order) must match. */
export function normalizeQuote(text: string | null | undefined): string {
  return String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
}
export function validBox(box: OcrBBox | null | undefined): box is OcrBBox {
  return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 && box.x + box.w <= 100.5 && box.y + box.h <= 100.5;
}

/**
 * A hidden or removed correction has no server-checked target, only its stored word ids. Those ids are believed only when they prove themselves:
 *  (a) every word exists, all on the row's one page and file; (b) those words, in page order, read as the correction's own quoted text.
 * Boxes on every word are the further condition for the image. A failure gives "no position", never a guess.
 */
export function unverifiedRowPosition(row: Pick<CorrectionRow, 'fileId' | 'page' | 'quotedText' | 'wordIds'>, pages: SnapshotPage[]): { words: string[]; onImage: boolean } {
  const none = { words: [], onImage: false };
  const ids = [...new Set(row.wordIds ?? [])];
  if (!ids.length || !normalizeQuote(row.quotedText)) return none;
  const page = pages.find(p => String(p.fileId) === row.fileId && Number(p.pageNumber) === row.page);
  if (!page) return none;
  const wanted = new Set(ids);
  const words = page.words.filter(word => wanted.has(word.id));
  if (words.length !== ids.length) return none;
  if (normalizeQuote(words.map(word => word.text).join('')) !== normalizeQuote(row.quotedText)) return none;
  return { words: words.map(word => word.id), onImage: words.every(word => validBox(word.bbox)) };
}

/** Every row's position. An ambiguous image has no trustworthy axes, so nothing on that page counts as placed on it. */
export function buildPositions(rows: CorrectionRow[], snapshot: PlacedSnapshot): Map<string, RowPosition> {
  const pages = snapshot.pages ?? [];
  const effective = new Map(((snapshot.effective ?? []) as EffectiveTarget[]).map(item => [item.id, item]));
  const ambiguous = (row: CorrectionRow): boolean => Boolean(pages.find(p => String(p.fileId) === row.fileId && Number(p.pageNumber) === row.page)?.sourceGeometry?.ambiguous);
  const positions = new Map<string, RowPosition>();
  for (const row of rows) {
    const place = { fileId: row.fileId, page: row.page };
    const target = effective.get(row.targetId);
    if (target) {
      const boxes = target.renderTarget?.source !== 'none' && (target.renderTarget?.boxes?.length ?? 0) > 0;
      positions.set(row.key, { ...place, transcriptWordIds: target.wordIds ?? [], image: boxes && !ambiguous(row) ? 'exact' : 'none' });
    } else if (row.orphanReason) {
      positions.set(row.key, { ...place, transcriptWordIds: [], image: 'none' });
    } else {
      const found = unverifiedRowPosition(row, pages);
      positions.set(row.key, { ...place, transcriptWordIds: found.words, image: found.onImage && !ambiguous(row) ? 'approximate' : 'none' });
    }
  }
  return positions;
}

/**
 * What the workspace gives the transcript and the overlay: the server's own objects for what the student sees, plus the hidden and removed rows
 * that passed the checks. Rows without a place are left out, and the list says so.
 */
export function workspaceCorrections(rows: CorrectionRow[], positions: Map<string, RowPosition>, snapshot: PlacedSnapshot): unknown[] {
  const words = new Map((snapshot.pages ?? []).flatMap(p => p.words.map(w => [w.id, w] as const)));
  const effective = new Map(((snapshot.effective ?? []) as EffectiveTarget[]).map(item => [item.id, item]));
  const all: unknown[] = [];
  for (const row of rows) {
    const position = positions.get(row.key);
    if (!position || (!position.transcriptWordIds.length && position.image === 'none')) continue;
    const server = effective.get(row.targetId);
    if (server) { all.push(server); continue; }
    const drawn = position.image === 'none' ? [] : position.transcriptWordIds;
    all.push({ id: row.key, fileId: row.fileId, page: row.page, wordIds: position.transcriptWordIds, quotedText: row.quotedText, symbol: row.symbol, category: row.category, color: row.color,
      message: row.message, suggestedText: row.suggestedText, source: row.source, startChar: row.startChar ?? undefined, endChar: row.endChar ?? undefined,
      renderTarget: { version: 1, source: drawn.length ? 'wordIds' : 'none', anchors: [], wordIds: drawn, boxes: drawn.map(id => words.get(id)?.bbox) } });
  }
  return all;
}

export function syncStates(rows: CorrectionRow[]): Map<string, SyncState> {
  return new Map(rows.filter(row => row.status !== 'visible').map(row => [row.key, row.status as SyncState]));
}

/** The overlay reports what it really drew: a target it could not place (the image's geometry refused it) has no position after all. */
export function withDrawn(position: RowPosition | undefined, drawn: ReadonlyMap<string, ReadonlySet<string>>, key: string): RowPosition | undefined {
  if (!position || position.image === 'none') return position;
  const onPage = drawn.get(`${position.fileId}:${position.page}`);
  return onPage && !onPage.has(key) ? { ...position, image: 'none' } : position;
}

/** The row's position in words, for the list. Empty when there is nothing to say. */
export function positionLabels(position: RowPosition | undefined): string[] {
  if (!position) return [];
  const labels: string[] = [];
  if (position.image === 'none') labels.push(NO_IMAGE_POSITION);
  if (position.image === 'approximate') labels.push(APPROXIMATE_POSITION);
  if (!position.transcriptWordIds.length) labels.push(NO_TRANSCRIPT_POSITION);
  return labels;
}

// The shared selection. A pinned correction stays until cleared; hovering shows another for as long as the pointer stays.
export interface SelectionState { pinnedId: string | null; hoverId: string | null; }
export type SelectionEvent = { type: 'pin' | 'hover'; id: string } | { type: 'hoverEnd' | 'clear' };
export const NO_SELECTION: SelectionState = { pinnedId: null, hoverId: null };
export function nextSelection(state: SelectionState, event: SelectionEvent): SelectionState {
  switch (event.type) {
    case 'pin': return { pinnedId: event.id, hoverId: null };
    case 'hover': return { ...state, hoverId: event.id };
    case 'hoverEnd': return { ...state, hoverId: null };
    case 'clear': return NO_SELECTION;
  }
}
export const activeOf = (state: SelectionState): string | null => state.hoverId ?? state.pinnedId;

/** Several corrections can share a word or a badge: repeating the action walks through them. */
export function nextInCycle(ids: string[], current: string | null): string | null {
  if (!ids.length) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  return ids[(at + 1) % ids.length];
}
/** A focus or hover lands on what is already active if it can; otherwise on the first. */
export function preferCurrent(ids: string[], current: string | null): string | null {
  return current !== null && ids.includes(current) ? current : ids[0] ?? null;
}

/** What the list must change to show a row that is filtered out or past the shown limit. Null when it is already on screen or does not exist. */
export function revealRow(rows: CorrectionRow[], key: string, filter: RowFilter, limit: number, pageSize: number): { filter: RowFilter; limit: number } | null {
  const row = rows.find(r => r.key === key);
  if (!row) return null;
  const nextFilter: RowFilter = matchesFilter(row, filter) ? filter : 'all';
  const index = rows.filter(r => matchesFilter(r, nextFilter)).indexOf(row);
  const nextLimit = nextFilter !== filter ? Math.max(pageSize, Math.ceil((index + 1) / pageSize) * pageSize) : index < limit ? limit : Math.ceil((index + 1) / pageSize) * pageSize;
  return nextFilter === filter && nextLimit === limit ? null : { filter: nextFilter, limit: nextLimit };
}

/** The scroll that brings a target into a panel's view, in the panel's own scroll units. Null when it is already fully visible, so nothing moves. */
export function panelScrollTop(panel: { top: number; height: number; scrollTop: number }, target: { top: number; height: number }, margin = 16): number | null {
  const top = target.top - panel.top, bottom = top + target.height;
  if (top >= margin && bottom <= panel.height - margin) return null;
  return Math.max(0, panel.scrollTop + top - Math.max(margin, (panel.height - target.height) / 2));
}
