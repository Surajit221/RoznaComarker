// Pure rules of the teacher annotation editor (Task 6B): the 6A snapshot as list rows, what each state allows, form validation matching
// the server, and error wording. No Angular or DOM here, so every rule is unit-testable.
import type { ScoreReview } from './grade-check.logic';

export type ModerationStatus = 'visible' | 'hidden' | 'archived';
export type AnnotationAction = 'hide' | 'restore' | 'archive' | 'edit' | 'add';

export interface SnapshotCorrection {
  id: string; entryId?: string; source?: string; moderationStatus: ModerationStatus; teacherEdited?: boolean;
  fileId?: string; page?: number; startChar?: number; endChar?: number; quotedText?: string;
  symbol?: string; symbolLabel?: string; category?: string; message?: string; suggestedText?: string;
}
export interface SnapshotOrphan {
  entryId: string; kind: 'ai' | 'manual'; status: ModerationStatus; edited?: boolean; reason: string; suppressing?: boolean;
  anchor?: { fileId?: string; page?: number; quotedText?: string } | null;
  value?: { fileId?: string; page?: number; quotedText?: string; symbol?: string; category?: string; message?: string; suggestedText?: string } | null;
}
export interface SnapshotWord { id: string; text: string; separatorBefore?: string; }
export interface SnapshotPage { fileId: string; pageNumber: number; startChar: number; endChar: number; text: string; words: SnapshotWord[]; }
export interface LegendGroup { key: string; label: string; symbols: { symbol: string; label: string }[]; }
type TransitionTable = Partial<Record<AnnotationAction, { from: string[]; to: string | null }>>;
/** The server's lifecycle: the main table, plus the rules for orphaned entries. */
export type Transitions = TransitionTable & { orphan?: TransitionTable };
export interface AnnotationSnapshot {
  revision: number; sourceHash: string; scoringReviewRequired: boolean; pages: SnapshotPage[]; corrections: SnapshotCorrection[];
  orphans: SnapshotOrphan[]; archivedOrphans?: SnapshotOrphan[]; readOnly?: boolean; readOnlyReason?: string | null;
  effective: { id: string }[]; transitions: Transitions; legend: { groups: LegendGroup[] };
  /** Sent by a backend older than Task 7C; the Grade check panel replaced it and nothing shows it. */
  scorePolicy?: string;
  /** The grade check. Absent from a server older than Task 7BE: the panel is then not shown. */
  scoreReview?: ScoreReview;
}
export interface HistoryItem {
  action: string; actor?: string; entryId?: string | null; correctionId?: string | null; previousRevision: number; newRevision: number;
  createdAt: string; changedFields?: string[]; visibilityChanged?: boolean; legacy?: boolean;
  before?: HistorySide | null; after?: HistorySide | null;
  /** score_review rows: the teacher's own text, shown by interpolation only. */
  reason?: string;
}
export interface HistorySide { status?: string; kind?: string; value?: { quotedText?: string; message?: string } | null; anchor?: { quotedText?: string } | null; }

export interface CorrectionValue {
  fileId: string; page: number; startChar: number; endChar: number; quotedText: string; symbol: string; category: string; message: string; suggestedText: string;
}
export interface AnnotationBody {
  action: AnnotationAction; id?: string; revision: number; sourceHash: string; requestId: string; value?: CorrectionValue;
}

/** One line of the teacher's list. `targetId` is what a POST must send as `id`. */
export interface CorrectionRow {
  key: string; targetId: string; status: ModerationStatus; source: 'AI' | 'Teacher'; manual: boolean; edited: boolean;
  orphanReason: string | null; suppressing: boolean;
  fileId: string; page: number; startChar: number | null; endChar: number | null;
  quotedText: string; symbol: string; symbolLabel: string; category: string; message: string; suggestedText: string;
}
export type RowFilter = 'all' | 'visible' | 'hidden' | 'archived' | 'review' | 'teacher';

/** Server caps (src/services/teacherAnnotation.service.js validateValue). */
export const MESSAGE_MAX = 2000;
export const SUGGESTION_MAX = 2000;
export const QUOTE_MAX = 4000;
// eslint-disable-next-line no-control-regex -- the same character class the server refuses
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

const ORPHAN_REASONS: Record<string, string> = {
  TEXT_NOT_FOUND: 'The marked words are no longer in the transcript (the text was read again).',
  PAGE_NOT_FOUND: 'The page this was on is no longer part of the submission.',
  AMBIGUOUS: 'The marked words now appear in more than one place, so the system will not guess which one you meant.',
  NO_MATCHING_CORRECTION: 'The AI no longer reports a correction at this place.',
  CONFLICT: 'Two of your edits now point at the same correction.',
  LEGACY_DRAFT_UNKNOWN: 'This older edit cannot be matched to the current draft.',
};
export function orphanReasonText(reason: string | null | undefined): string {
  return (reason && ORPHAN_REASONS[reason]) || 'This item no longer matches the current text.';
}

/** Merges the snapshot's corrections and orphans into one list. Hidden, archived and orphaned items are never dropped. */
export function buildRows(snapshot: AnnotationSnapshot): CorrectionRow[] {
  const allOrphans = [...(snapshot.orphans || []), ...(snapshot.archivedOrphans || [])];
  const orphans = new Map(allOrphans.map(o => [o.entryId, o]));
  const covered = new Set<string>();
  const rows: CorrectionRow[] = (snapshot.corrections || []).map(c => {
    const orphan = c.entryId ? orphans.get(c.entryId) : undefined;
    if (orphan) covered.add(orphan.entryId);
    const manual = c.source === 'Teacher' || String(c.id).startsWith('teacher_');
    return { key: c.id, targetId: c.id, status: c.moderationStatus, source: manual ? 'Teacher' : 'AI', manual, edited: Boolean(c.teacherEdited),
      orphanReason: orphan ? orphan.reason : null, suppressing: Boolean(orphan?.suppressing),
      fileId: String(c.fileId ?? ''), page: Number(c.page ?? 1), startChar: c.startChar ?? null, endChar: c.endChar ?? null,
      quotedText: c.quotedText ?? '', symbol: c.symbol ?? '', symbolLabel: c.symbolLabel ?? '', category: c.category ?? '',
      message: c.message ?? '', suggestedText: c.suggestedText ?? '' };
  });
  for (const o of allOrphans) {
    if (covered.has(o.entryId)) continue;
    const place = o.value ?? o.anchor ?? {};
    rows.push({ key: `orphan:${o.entryId}`, targetId: o.entryId, status: o.status, source: o.kind === 'manual' ? 'Teacher' : 'AI', manual: o.kind === 'manual',
      edited: Boolean(o.edited), orphanReason: o.reason, suppressing: Boolean(o.suppressing),
      fileId: String(place.fileId ?? ''), page: Number(place.page ?? 1), startChar: null, endChar: null, quotedText: place.quotedText ?? '',
      symbol: o.value?.symbol ?? '', symbolLabel: o.value?.symbol ?? '', category: o.value?.category ?? '', message: o.value?.message ?? '', suggestedText: o.value?.suggestedText ?? '' });
  }
  return rows;
}

/** What the server's state machine allows for a row, read from the snapshot's own tables (nothing about the rules is hardcoded here). */
export function allowedActions(row: CorrectionRow, transitions: Transitions): AnnotationAction[] {
  const table: TransitionTable | undefined = row.orphanReason ? transitions?.orphan : transitions;
  const candidates: AnnotationAction[] = ['edit', 'hide', 'restore', 'archive'];
  return candidates.filter(action => Boolean(table?.[action]?.from.includes(row.status)));
}

/** An orphan the teacher removed belongs in the Removed group; restoring it brings it back here. */
export function needsReview(row: CorrectionRow): boolean { return Boolean(row.orphanReason) && row.status !== 'archived'; }

export interface RowBadge { label: string; tone: 'visible' | 'hidden' | 'archived' | 'edited' | 'manual' | 'review' | 'source'; }
/** Every state is a word, never colour alone. */
export function rowBadges(row: CorrectionRow): RowBadge[] {
  const badges: RowBadge[] = [];
  if (needsReview(row)) badges.push({ label: 'Needs review', tone: 'review' });
  if (row.status === 'visible' && !row.orphanReason) badges.push({ label: 'Visible to student', tone: 'visible' });
  if (row.status === 'visible' && row.orphanReason) badges.push({ label: 'Not shown to student', tone: 'hidden' });
  if (row.status === 'hidden') badges.push({ label: 'Hidden from student', tone: 'hidden' });
  if (row.status === 'archived') badges.push({ label: 'Removed', tone: 'archived' });
  if (row.edited) badges.push({ label: 'Edited by you', tone: 'edited' });
  badges.push(row.manual ? { label: 'Teacher', tone: 'manual' } : { label: 'AI', tone: 'source' });
  return badges;
}

export function matchesFilter(row: CorrectionRow, filter: RowFilter): boolean {
  switch (filter) {
    case 'visible': return row.status === 'visible' && !row.orphanReason;
    case 'hidden': return row.status === 'hidden';
    case 'archived': return row.status === 'archived';
    case 'review': return needsReview(row);
    case 'teacher': return row.manual || row.edited;
    default: return true;
  }
}
export function filterCounts(rows: CorrectionRow[]): Record<RowFilter, number> {
  const filters: RowFilter[] = ['all', 'visible', 'hidden', 'archived', 'review', 'teacher'];
  return Object.fromEntries(filters.map(f => [f, rows.filter(r => matchesFilter(r, f)).length])) as Record<RowFilter, number>;
}

/** Offsets of each OCR word inside the page text. Words that can not be located are skipped. */
export function wordSpans(pageText: string, words: SnapshotWord[]): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const word of words || []) {
    if (!word?.text) continue;
    const at = pageText.indexOf(word.text, cursor);
    if (at < 0) continue;
    spans.push({ start: at, end: at + word.text.length });
    cursor = at + word.text.length;
  }
  return spans;
}

/**
 * Grows a text selection to whole words. The server requires a span to touch at least one word, and re-anchors after an OCR re-run only
 * on whole-word spans, so a partial word would be orphaned later. Returns null when the selection touches no word.
 */
export function snapToWords(spans: { start: number; end: number }[], start: number, end: number): { start: number; end: number } | null {
  if (!(end > start)) return null;
  const touched = spans.filter(s => start < s.end && end > s.start);
  if (!touched.length) return null;
  return { start: touched[0].start, end: touched[touched.length - 1].end };
}

export interface FormErrors { span?: string; symbol?: string; message?: string; suggestedText?: string; }
function textError(value: string, max: number, name: string): string | undefined {
  if (!value.trim()) return `${name} is required.`;
  if (value.length > max) return `${name} can be at most ${max} characters.`;
  if (CONTROL_CHARACTERS.test(value)) return `${name} contains a character that cannot be saved. Remove it and try again.`;
  return undefined;
}
/** The same checks as the server's validateValue, so the teacher sees the problem before a request is made. */
export function validateForm(value: CorrectionValue, page: SnapshotPage | undefined, symbols: Map<string, string>): FormErrors {
  const errors: FormErrors = {};
  if (!page || !value.quotedText || !(value.endChar > value.startChar)) errors.span = 'Select the words in the transcript that this correction is about.';
  else if (value.startChar < page.startChar || value.endChar > page.endChar || value.quotedText.length > QUOTE_MAX
    || page.text.slice(value.startChar - page.startChar, value.endChar - page.startChar) !== value.quotedText) {
    errors.span = 'The selected words no longer match the transcript. Select them again.';
  }
  if (symbols.get(value.symbol) !== value.category || !value.symbol) errors.symbol = 'Choose a category and symbol from the legend.';
  const message = textError(value.message, MESSAGE_MAX, 'Explanation'); if (message) errors.message = message;
  const suggestion = textError(value.suggestedText, SUGGESTION_MAX, 'Suggestion'); if (suggestion) errors.suggestedText = suggestion;
  return errors;
}

export type FailureKind = 'stale' | 'state' | 'closed' | 'notFound' | 'rate' | 'busy' | 'invalid' | 'unconfirmed' | 'limit' | 'unavailable';
export interface Failure { kind: FailureKind; message: string; }
/** HTTP status and server code -> what happened, in plain words. `unconfirmed` means the save may or may not have reached the server. */
export function describeFailure(status: number, code: string | undefined): Failure {
  switch (code) {
    case 'ANNOTATION_REVISION_CONFLICT': return { kind: 'stale', message: 'Your change was not saved: this submission changed since you opened it (another tab, or the text was read again). The latest version is now loaded. Your text is still in the form; check it and save again.' };
    case 'ANNOTATION_IDEMPOTENCY_CONFLICT': return { kind: 'stale', message: 'Your change was not saved because it conflicted with an earlier save. The latest version is now loaded. Check it and try again.' };
    case 'ANNOTATION_STATE_CONFLICT': return { kind: 'state', message: 'That action is no longer possible because this correction changed. The latest version is now loaded.' };
    case 'ANNOTATION_ORPHANED': return { kind: 'state', message: 'This correction no longer matches the text. Place it again or remove it. The latest version is now loaded.' };
    case 'ANNOTATION_CLASS_CLOSED': return { kind: 'closed', message: 'This class is closed, so corrections are read-only. Nothing was changed.' };
    case 'ANNOTATION_NOT_FOUND': return { kind: 'notFound', message: 'This submission or correction was not found, or you do not have access to it.' };
    case 'ANNOTATION_RATE_LIMITED': case 'RATE_LIMITED': return { kind: 'rate', message: 'You are making changes faster than we can save them. Wait a few minutes, then press Retry. Nothing you typed was lost.' };
    case 'ANNOTATION_ASSESSMENT_BUSY': return { kind: 'busy', message: 'The assessment is still running. Try again when it has finished. Nothing was changed.' };
    case 'ANNOTATION_SOURCE_UNAVAILABLE': return { kind: 'unavailable', message: 'The transcript of this submission is not available for editing yet.' };
    case 'ANNOTATION_HISTORY_LIMIT': return { kind: 'limit', message: 'This submission has reached the maximum number of teacher corrections. Nothing was changed.' };
    case 'ANNOTATION_INVALID_SPAN': case 'ANNOTATION_UNMAPPED_SPAN': return { kind: 'invalid', message: 'The selected words do not match the current transcript. Select them again.' };
    case 'ANNOTATION_INVALID_CATEGORY': return { kind: 'invalid', message: 'Choose a category and symbol from the legend.' };
    case 'ANNOTATION_INVALID_TEXT': return { kind: 'invalid', message: 'The explanation or suggestion is empty, too long, or contains a character that cannot be saved.' };
    case 'ANNOTATION_PAYLOAD_TOO_LARGE': return { kind: 'invalid', message: 'This correction is too long to save. Shorten it and try again.' };
    default: break;
  }
  if (status === 404) return { kind: 'notFound', message: 'This submission or correction was not found, or you do not have access to it.' };
  if (status === 429) return { kind: 'rate', message: 'You are making changes faster than we can save them. Wait a few minutes, then press Retry. Nothing you typed was lost.' };
  if (status >= 400 && status < 500) return { kind: 'invalid', message: 'The change could not be saved. Check your input and try again.' };
  return { kind: 'unconfirmed', message: 'We could not confirm this save (connection problem). Nothing you typed was lost. Press Retry; it is safe and cannot save twice.' };
}

const ACTION_LABELS: Record<string, string> = { add: 'Added', edit: 'Edited', hide: 'Hidden', restore: 'Restored', archive: 'Removed', reject: 'Removed', score_review: 'Grade checked' };
const STATUS_LABELS: Record<string, string> = { visible: 'visible', hidden: 'hidden', archived: 'removed', rejected: 'removed' };
export function historyActionLabel(action: string): string { return ACTION_LABELS[action] ?? action; }
/** "hidden -> visible; changed explanation", from a history row's before/after. Quoted text comes back separately for interpolation. */
export function historySummary(item: HistoryItem): string {
  if (item.action === 'score_review') return 'Scores kept. No score was changed.';
  const parts: string[] = [];
  const before = item.before?.status, after = item.after?.status;
  if (before && after && before !== after) parts.push(`${STATUS_LABELS[before] ?? before} → ${STATUS_LABELS[after] ?? after}`);
  const fields = (item.changedFields || []).map(f => ({ message: 'explanation', suggestedText: 'suggestion', symbol: 'symbol', category: 'category',
    startChar: 'selected words', endChar: 'selected words', quotedText: 'selected words', fileId: 'page', page: 'page' } as Record<string, string>)[f] ?? f);
  if (fields.length) parts.push(`changed ${[...new Set(fields)].join(', ')}`);
  if (item.legacy) parts.push('from older history');
  return parts.join('; ');
}
export function historyQuote(item: HistoryItem): string {
  return item.after?.value?.quotedText ?? item.after?.anchor?.quotedText ?? item.before?.value?.quotedText ?? item.before?.anchor?.quotedText ?? '';
}

/** A request id the server accepts (36 hex-and-dash characters), also on browsers without crypto.randomUUID. */
export function newRequestId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
