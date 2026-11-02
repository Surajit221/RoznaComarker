import {
  AnnotationSnapshot, CorrectionRow, MESSAGE_MAX, Transitions, allowedActions, buildRows, describeFailure, filterCounts, historyQuote, historySummary, matchesFilter, newRequestId,
  orphanReasonText, rowBadges, snapToWords, validateForm, wordSpans,
} from './annotation-editor.logic';

// The table the 6A server sends in the snapshot.
const TRANSITIONS: Transitions = { hide: { from: ['visible'], to: 'hidden' }, restore: { from: ['hidden', 'archived'], to: 'visible' },
  archive: { from: ['visible', 'hidden'], to: 'archived' }, edit: { from: ['visible', 'hidden'], to: null }, add: { from: [], to: 'visible' },
  orphan: { edit: { from: ['visible', 'hidden'], to: null }, archive: { from: ['visible', 'hidden'], to: 'archived' }, restore: { from: ['archived'], to: 'orphaned' } } };
const base: CorrectionRow = { key: 'ai_1', targetId: 'ai_1', status: 'visible', source: 'AI', manual: false, edited: false, orphanReason: null, suppressing: false, fileId: 'f', page: 1,
  startChar: 0, endChar: 1, quotedText: 'a', symbol: 'ART', symbolLabel: 'Article', category: 'GRAMMAR', message: 'm', suggestedText: 's' };
const row = (patch: Partial<CorrectionRow>): CorrectionRow => ({ ...base, ...patch });

describe('annotation editor logic', () => {
  describe('allowedActions follows the 6A transition table', () => {
    it('visible: edit, hide, remove', () => expect(allowedActions(row({}), TRANSITIONS)).toEqual(['edit', 'hide', 'archive']));
    it('hidden: edit, restore, remove', () => expect(allowedActions(row({ status: 'hidden' }), TRANSITIONS)).toEqual(['edit', 'restore', 'archive']));
    it('archived: restore only', () => expect(allowedActions(row({ status: 'archived' }), TRANSITIONS)).toEqual(['restore']));
    it('orphaned: edit and remove only, never hide or restore', () => {
      expect(allowedActions(row({ orphanReason: 'TEXT_NOT_FOUND' }), TRANSITIONS)).toEqual(['edit', 'archive']);
      expect(allowedActions(row({ status: 'hidden', orphanReason: 'AMBIGUOUS' }), TRANSITIONS)).toEqual(['edit', 'archive']);
    });
    it('an archived orphan can only be restored', () => expect(allowedActions(row({ status: 'archived', orphanReason: 'TEXT_NOT_FOUND' }), TRANSITIONS)).toEqual(['restore']));
    it('orphan rules come from the snapshot, not from the client', () => {
      expect(allowedActions(row({ orphanReason: 'CONFLICT' }), { ...TRANSITIONS, orphan: { archive: { from: ['visible'], to: 'archived' } } })).toEqual(['archive']);
      expect(allowedActions(row({ orphanReason: 'CONFLICT' }), { ...TRANSITIONS, orphan: undefined })).toEqual([]);
    });
    it('a snapshot without a transition table (older backend) offers no actions instead of failing', () => expect(allowedActions(row({}), undefined as unknown as Transitions)).toEqual([]));
  });

  describe('rowBadges: every state is a word', () => {
    const labels = (r: CorrectionRow) => rowBadges(r).map(b => b.label);
    it('visible AI', () => expect(labels(row({}))).toEqual(['Visible to student', 'AI']));
    it('hidden', () => expect(labels(row({ status: 'hidden' }))).toContain('Hidden from student'));
    it('archived', () => expect(labels(row({ status: 'archived' }))).toContain('Removed'));
    it('edited', () => expect(labels(row({ edited: true }))).toContain('Edited by you'));
    it('manual', () => expect(labels(row({ manual: true, source: 'Teacher' }))).toContain('Teacher'));
    it('an orphan already removed no longer needs review', () => {
      const removed = row({ status: 'archived', orphanReason: 'TEXT_NOT_FOUND' });
      expect(labels(removed)).toEqual(['Removed', 'AI']);
      expect(matchesFilter(removed, 'review')).toBeFalse();
    });
    it('orphan: needs review and never claims to be visible', () => {
      expect(labels(row({ orphanReason: 'AMBIGUOUS' }))).toEqual(['Needs review', 'Not shown to student', 'AI']);
    });
  });

  describe('buildRows', () => {
    const snapshot = (patch: Partial<AnnotationSnapshot>): AnnotationSnapshot => ({ revision: 1, sourceHash: 'h', scoringReviewRequired: false, pages: [], corrections: [], orphans: [], effective: [], transitions: TRANSITIONS,
      legend: { groups: [] }, scorePolicy: '', ...patch });
    it('keeps hidden and archived rows; manual rows are marked Teacher', () => {
      const rows = buildRows(snapshot({ corrections: [{ id: 'ai_1', moderationStatus: 'hidden', source: 'AI', entryId: 'ann_1' }, { id: 'teacher_1', moderationStatus: 'archived', source: 'Teacher', entryId: 'teacher_1' }] }));
      expect(rows.map(r => [r.status, r.manual])).toEqual([['hidden', false], ['archived', true]]);
    });
    it('an orphan without a row gets its own row, targeting the entry id', () => {
      const rows = buildRows(snapshot({ orphans: [{ entryId: 'teacher_9', kind: 'manual', status: 'visible', reason: 'TEXT_NOT_FOUND', value: { quotedText: 'gone', message: 'note', suggestedText: 's', symbol: 'ART', category: 'GRAMMAR' } }] }));
      expect(rows[0]).toEqual(jasmine.objectContaining({ key: 'orphan:teacher_9', targetId: 'teacher_9', orphanReason: 'TEXT_NOT_FOUND', quotedText: 'gone', message: 'note', startChar: null }));
    });
    it('archived orphans are listed in the Removed group, not under needs review', () => {
      const rows = buildRows(snapshot({ archivedOrphans: [{ entryId: 'teacher_8', kind: 'manual', status: 'archived', reason: 'TEXT_NOT_FOUND', value: { quotedText: 'old' } }] }));
      expect(rows[0]).toEqual(jasmine.objectContaining({ targetId: 'teacher_8', status: 'archived', orphanReason: 'TEXT_NOT_FOUND' }));
      expect(matchesFilter(rows[0], 'archived')).toBeTrue();
      expect(matchesFilter(rows[0], 'review')).toBeFalse();
    });
    it('a suppressing orphan marks the corrections it hides instead of duplicating them', () => {
      const rows = buildRows(snapshot({ corrections: [{ id: 'ai_2', moderationStatus: 'hidden', entryId: 'ann_2' }], orphans: [{ entryId: 'ann_2', kind: 'ai', status: 'hidden', reason: 'AMBIGUOUS', suppressing: true }] }));
      expect(rows.length).toBe(1);
      expect(rows[0].orphanReason).toBe('AMBIGUOUS');
      expect(rows[0].targetId).toBe('ai_2');
    });
  });

  it('filters and their counts', () => {
    const rows = [row({}), row({ key: '2', status: 'hidden' }), row({ key: '3', status: 'archived' }), row({ key: '4', orphanReason: 'CONFLICT' }), row({ key: '5', manual: true }), row({ key: '6', edited: true })];
    expect(filterCounts(rows)).toEqual({ all: 6, visible: 3, hidden: 1, archived: 1, review: 1, teacher: 2 });
    expect(matchesFilter(row({ orphanReason: 'CONFLICT' }), 'visible')).toBeFalse();
  });

  it('every orphan reason reads as plain words, with a fallback', () => {
    for (const reason of ['TEXT_NOT_FOUND', 'PAGE_NOT_FOUND', 'AMBIGUOUS', 'NO_MATCHING_CORRECTION', 'CONFLICT', 'LEGACY_DRAFT_UNKNOWN', 'SOMETHING_NEW']) {
      expect(orphanReasonText(reason)).not.toContain('_');
    }
  });

  describe('word selection', () => {
    const text = 'I goes to the park';
    const spans = wordSpans(text, [{ id: '1', text: 'I' }, { id: '2', text: 'goes' }, { id: '3', text: 'to' }, { id: '4', text: 'the' }, { id: '5', text: 'park' }]);
    it('locates words', () => expect(spans[1]).toEqual({ start: 2, end: 6 }));
    it('grows a partial selection to whole words', () => expect(snapToWords(spans, 3, 8)).toEqual({ start: 2, end: 9 }));
    it('keeps an exact selection', () => expect(snapToWords(spans, 2, 6)).toEqual({ start: 2, end: 6 }));
    it('refuses a selection touching no word or empty', () => { expect(snapToWords(spans, 1, 2)).toBeNull(); expect(snapToWords(spans, 3, 3)).toBeNull(); });
  });

  describe('validateForm matches the server', () => {
    const page = { fileId: 'f', pageNumber: 1, startChar: 10, endChar: 28, text: 'I goes to the park', words: [] };
    const symbols = new Map([['ART', 'GRAMMAR'], ['SP', 'MECHANICS']]);
    const value = { fileId: 'f', page: 1, startChar: 12, endChar: 16, quotedText: 'goes', symbol: 'ART', category: 'GRAMMAR', message: 'm', suggestedText: 's' };
    it('accepts a valid value', () => expect(validateForm(value, page, symbols)).toEqual({}));
    it('requires a span', () => expect(validateForm({ ...value, quotedText: '', endChar: 12 }, page, symbols).span).toBeTruthy());
    it('refuses a stale quote (transcript changed)', () => expect(validateForm({ ...value, quotedText: 'gone' }, page, symbols).span).toBeTruthy());
    it('refuses a span outside the page', () => expect(validateForm({ ...value, endChar: 100 }, page, symbols).span).toBeTruthy());
    it('refuses a symbol not in the legend, or one whose category differs', () => {
      expect(validateForm({ ...value, symbol: 'XYZ' }, page, symbols).symbol).toBeTruthy();
      expect(validateForm({ ...value, category: 'MECHANICS' }, page, symbols).symbol).toBeTruthy();
    });
    it('caps explanation and suggestion at the server limits', () => {
      expect(validateForm({ ...value, message: 'x'.repeat(MESSAGE_MAX) }, page, symbols).message).toBeUndefined();
      expect(validateForm({ ...value, message: 'x'.repeat(MESSAGE_MAX + 1) }, page, symbols).message).toBeTruthy();
      expect(validateForm({ ...value, suggestedText: 'x'.repeat(2001) }, page, symbols).suggestedText).toBeTruthy();
    });
    it('refuses blank text and control characters, but allows line breaks', () => {
      expect(validateForm({ ...value, message: '   ' }, page, symbols).message).toBeTruthy();
      expect(validateForm({ ...value, message: 'bad\u0007bell' }, page, symbols).message).toBeTruthy();
      expect(validateForm({ ...value, message: 'line one\nline two' }, page, symbols).message).toBeUndefined();
    });
  });

  describe('describeFailure', () => {
    it('maps every server outcome', () => {
      const kind = (status: number, code?: string) => describeFailure(status, code).kind;
      expect(kind(409, 'ANNOTATION_REVISION_CONFLICT')).toBe('stale');
      expect(kind(409, 'ANNOTATION_STATE_CONFLICT')).toBe('state');
      expect(kind(409, 'ANNOTATION_ORPHANED')).toBe('state');
      expect(kind(409, 'ANNOTATION_CLASS_CLOSED')).toBe('closed');
      expect(kind(409, 'ANNOTATION_ASSESSMENT_BUSY')).toBe('busy');
      expect(kind(404, 'ANNOTATION_NOT_FOUND')).toBe('notFound');
      expect(kind(429, 'ANNOTATION_RATE_LIMITED')).toBe('rate');
      expect(kind(429, 'RATE_LIMITED')).toBe('rate');
      expect(kind(400, 'ANNOTATION_INVALID_SPAN')).toBe('invalid');
      expect(kind(413, 'ANNOTATION_PAYLOAD_TOO_LARGE')).toBe('invalid');
      expect(kind(0)).toBe('unconfirmed');
      expect(kind(500, 'ANNOTATION_OPERATION_FAILED')).toBe('unconfirmed');
      expect(kind(503)).toBe('unconfirmed');
    });
    it('404 says not found or no access', () => expect(describeFailure(404, undefined).message).toContain('do not have access'));
  });

  describe('history', () => {
    it('summarises the status change and fields; legacy rows without before/after do not break', () => {
      expect(historySummary({ action: 'hide', previousRevision: 0, newRevision: 1, createdAt: 'x', before: { status: 'visible' }, after: { status: 'hidden' } })).toBe('visible → hidden');
      expect(historySummary({ action: 'edit', previousRevision: 0, newRevision: 1, createdAt: 'x', changedFields: ['message', 'startChar', 'endChar'] })).toBe('changed explanation, selected words');
      expect(historySummary({ action: 'hide', previousRevision: 0, newRevision: 1, createdAt: 'x', before: null, after: null, legacy: true })).toBe('from older history');
      expect(historyQuote({ action: 'hide', previousRevision: 0, newRevision: 1, createdAt: 'x', after: { anchor: { quotedText: 'goes' } } })).toBe('goes');
    });
  });

  it('request ids have the form the server accepts and are fresh', () => {
    expect(newRequestId()).toMatch(/^[a-f0-9-]{36}$/i);
    expect(newRequestId()).not.toBe(newRequestId());
  });
});
