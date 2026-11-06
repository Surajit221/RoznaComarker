import { imagePresentationGeometry, type AnnotationImageGeometry } from '../../correction-overlay/annotation-image-geometry';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import type { AnnotationSnapshot, CorrectionRow, SnapshotPage } from './annotation-editor.logic';
import {
  APPROXIMATE_POSITION, LINE_IMAGE_POSITION, NO_IMAGE_POSITION, NO_SELECTION, NO_TRANSCRIPT_POSITION, activeOf, buildPositions, nextInCycle, nextSelection, normalizeQuote, panelScrollTop, positionLabels, preferCurrent, revealRow,
  syncStates, unverifiedRowPosition, validBox, withDrawn, workspaceCorrections,
} from './annotation-sync.logic';

const box = (x: number) => ({ x, y: 10, w: 5, h: 2 });
const page = (fileId: string, pageNumber: number, text: string, patch: Partial<SnapshotPage> = {}): SnapshotPage => ({ fileId, pageNumber, startChar: 0, endChar: text.length, text,
  words: text.split(' ').map((word, i) => ({ id: `${fileId}_${pageNumber}_${i}`, text: word, bbox: box(i * 6) })), ...patch });
const row = (patch: Partial<CorrectionRow>): CorrectionRow => ({ key: 'c1', targetId: 'c1', status: 'hidden', source: 'AI', manual: false, edited: false, orphanReason: null, suppressing: false, fileId: 'f1', page: 1, startChar: 0, endChar: 1,
  quotedText: 'goes', symbol: 'AGR', symbolLabel: 'AGR', category: 'GRAMMAR', message: '', suggestedText: '', wordIds: ['f1_1_1'], ...patch });
const snap = (pages: SnapshotPage[], effective: unknown[] = []) => ({ pages, effective } as unknown as Pick<AnnotationSnapshot, 'pages' | 'effective'>);
const P1 = page('f1', 1, 'I goes to the park'), P2 = page('f1', 2, 'She goes home');

describe('a correction the server could not place on a word', () => {
  // Five transcript lines: lines 0, 1, 2 and 4 have a boxed word; line 3 has none.
  const lineBox = (y: number) => ({ x: 20, y, w: 8, h: 4 });
  const words = [0, 1, 2, 3, 4].flatMap(line => [
    { id: `boxed${line}`, text: `boxed${line}`, bbox: line === 3 ? null : lineBox(10 + line * 5), separatorBefore: line ? '\n' : '' },
    { id: `plain${line}`, text: `plain${line}`, bbox: null, separatorBefore: ' ' }]);
  const linesPage = page('f1', 1, 'unused', { words } as Partial<SnapshotPage>);
  const target = (id: string, patch: Record<string, unknown> = {}) => ({ id: 'c1', wordIds: [id], quotedText: id, renderTarget: { source: 'none', wordIds: [], boxes: [], textRanges: [{ start: 0, end: 4 }] }, ...patch });
  const position = (effective: unknown, patch: Partial<SnapshotPage> = {}, rowPatch: Partial<CorrectionRow> = {}) =>
    buildPositions([row({ status: 'visible', quotedText: 'x', symbol: 'FRAG', ...rowPatch })], snap([{ ...linesPage, ...patch }], [effective])).get('c1')!;

  it('a one-word error is never marked by line, even on a proven line', () => {
    const found = position(target('plain1'), {}, { symbol: 'SP' });
    expect(found.image).toBe('none');
    expect(positionLabels(found)).toEqual([NO_IMAGE_POSITION]);
  });
  it('a sentence on a line proven by other words: marked by line, and the list says so', () => {
    const found = position(target('plain1'));
    expect(found.image).toBe('line');
    expect(positionLabels(found)).toEqual([LINE_IMAGE_POSITION]);
    expect(LINE_IMAGE_POSITION).toBe('Marked by line on image');
  });
  it('its line has no box: not located, in those words', () => {
    const found = position(target('plain3'));
    expect(found.image).toBe('none');
    expect(positionLabels(found)).toEqual([NO_IMAGE_POSITION]);
    expect(NO_IMAGE_POSITION).toBe('Not located on image');
  });
  it('an ambiguous image: not located, whatever the words say', () => {
    expect(position(target('plain1'), { sourceGeometry: { version: 1, fileId: 'f1', pageNumber: 1, width: 10, height: 10, orientation: 1, coordinateSpace: 'display-image', ambiguous: true } } as Partial<SnapshotPage>).image).toBe('none');
  });
  it('a target with boxes stays exact and says nothing', () => {
    const found = position({ id: 'c1', wordIds: ['boxed1'], renderTarget: { source: 'wordIds', wordIds: ['boxed1'], boxes: [lineBox(15)] } });
    expect(found.image).toBe('exact');
    expect(positionLabels(found)).toEqual([]);
  });
  it('the server did not check its text: not located', () => {
    expect(position(target('plain1', { renderTarget: { source: 'none', boxes: [], wordIds: [] } })).image).toBe('none');
  });
});

describe('hidden and removed items: the approximate position safety check', () => {
  it('draws only when every word is on one page and they read as the quote', () => {
    expect(unverifiedRowPosition(row({}), [P1])).toEqual({ words: ['f1_1_1'], onImage: true });
    expect(buildPositions([row({})], snap([P1])).get('c1')?.image).toBe('approximate');
  });
  it('(a) fails when a word does not exist: no position, nothing drawn', () => {
    const position = buildPositions([row({ wordIds: ['f1_1_1', 'gone'], quotedText: 'goes to' })], snap([P1])).get('c1')!;
    expect(position.image).toBe('none');
    expect(position.transcriptWordIds).toEqual([]);
    expect(positionLabels(position)).toEqual([NO_IMAGE_POSITION, NO_TRANSCRIPT_POSITION]);
  });
  it('(a) fails when the words are spread over two pages', () => {
    const position = buildPositions([row({ wordIds: ['f1_1_1', 'f1_2_1'], quotedText: 'goes goes' })], snap([P1, P2])).get('c1')!;
    expect(position.image).toBe('none');
  });
  it('(a) fails when the words are on another page or file than the row says', () => {
    expect(buildPositions([row({ page: 2 })], snap([P1, P2])).get('c1')?.image).toBe('none');
    expect(buildPositions([row({ fileId: 'f9' })], snap([P1])).get('c1')?.image).toBe('none');
  });
  it('(a) a word without a box keeps the transcript place but draws nothing', () => {
    const noBox = page('f1', 1, 'I goes to', {}); noBox.words[1].bbox = null;
    const position = buildPositions([row({})], snap([noBox])).get('c1')!;
    expect(position.image).toBe('none');
    expect(position.transcriptWordIds).toEqual(['f1_1_1']);
    expect(positionLabels(position)).toEqual([NO_IMAGE_POSITION]);
  });
  it('(b) fails when the words do not read as the quote', () => {
    const position = buildPositions([row({ wordIds: ['f1_1_0'], quotedText: 'goes' })], snap([P1])).get('c1')!;
    expect(position.image).toBe('none');
    expect(position.transcriptWordIds).toEqual([]);
    expect(positionLabels(position)).toContain(NO_IMAGE_POSITION);
  });
  it('(b) a subset of the quote is not enough, nor is a different word order', () => {
    expect(unverifiedRowPosition(row({ wordIds: ['f1_1_1'], quotedText: 'goes to' }), [P1]).words).toEqual([]);
    expect(unverifiedRowPosition(row({ wordIds: ['f1_1_1', 'f1_1_2'], quotedText: 'to goes' }), [P1]).words).toEqual([]);
  });
  it('(b) ignores case and whitespace only, not punctuation', () => {
    expect(normalizeQuote('  Goes\n TO ')).toBe('goesto');
    expect(unverifiedRowPosition(row({ wordIds: ['f1_1_1', 'f1_1_2'], quotedText: 'GOES\n  to' }), [P1]).onImage).toBeTrue();
    expect(unverifiedRowPosition(row({ quotedText: 'goes,' }), [P1]).onImage).toBeFalse();
  });
  it('an empty quote or no word ids never passes', () => {
    expect(unverifiedRowPosition(row({ quotedText: '   ' }), [P1]).onImage).toBeFalse();
    expect(unverifiedRowPosition(row({ wordIds: [] }), [P1]).onImage).toBeFalse();
    expect(unverifiedRowPosition(row({ wordIds: undefined }), [P1]).onImage).toBeFalse();
  });
  it('labels a drawn one in words', () => {
    expect(positionLabels(buildPositions([row({})], snap([P1])).get('c1'))).toEqual([APPROXIMATE_POSITION]);
  });
  it('rejects a box outside the image', () => {
    expect(validBox({ x: 99, y: 0, w: 5, h: 1 })).toBeFalse();
    expect(validBox({ x: 0, y: 0, w: 0, h: 1 })).toBeFalse();
    expect(validBox(null)).toBeFalse();
  });
});

describe('positions of the other kinds of row', () => {
  const server = (id: string, boxes: unknown[], source = 'wordIds') => ({ id, wordIds: ['f1_1_1'], renderTarget: { version: 1, source, wordIds: ['f1_1_1'], boxes } });
  it('a visible correction uses the server target as it is, even if its quote differs', () => {
    const position = buildPositions([row({ status: 'visible', quotedText: 'something else' })], snap([P1], [server('c1', [box(0)])])).get('c1')!;
    expect(position.image).toBe('exact');
    expect(positionLabels(position)).toEqual([]);
  });
  it('a correction the server has no box for (text-only manual, rejected target) has no image position, and stays in the transcript', () => {
    const position = buildPositions([row({ status: 'visible', manual: true })], snap([P1], [server('c1', [], 'none')])).get('c1')!;
    expect(position.image).toBe('none');
    expect(position.transcriptWordIds).toEqual(['f1_1_1']);
  });
  it('an orphan has no place at all, whatever it stored', () => {
    const position = buildPositions([row({ key: 'orphan:e1', targetId: 'e1', orphanReason: 'TEXT_NOT_FOUND' })], snap([P1])).get('orphan:e1')!;
    expect(position.image).toBe('none');
    expect(position.transcriptWordIds).toEqual([]);
  });
  it('nothing counts as placed on an image with ambiguous geometry', () => {
    const geometry = { version: 1, fileId: 'f1', pageNumber: 1, width: 10, height: 10, orientation: 1, coordinateSpace: 'encoded-image', ambiguous: true } as AnnotationImageGeometry;
    const positions = buildPositions([row({}), row({ key: 'c2', targetId: 'c2', status: 'visible' })], snap([{ ...P1, sourceGeometry: geometry }], [server('c2', [box(0)])]));
    expect(positions.get('c1')?.image).toBe('none');
    expect(positions.get('c2')?.image).toBe('none');
  });
  it('a target the overlay could not draw reads as no position; one it drew stays', () => {
    const position = buildPositions([row({})], snap([P1])).get('c1');
    expect(withDrawn(position, new Map([['f1:1', new Set<string>()]]), 'c1')?.image).toBe('none');
    expect(withDrawn(position, new Map([['f1:1', new Set(['c1'])]]), 'c1')?.image).toBe('approximate');
    expect(withDrawn(position, new Map(), 'c1')?.image).toBe('approximate');
  });
  it('state styles come from the row status', () => {
    expect([...syncStates([row({}), row({ key: 'c2', status: 'archived' }), row({ key: 'c3', status: 'visible' })])]).toEqual([['c1', 'hidden'], ['c2', 'archived']]);
  });
});

describe('what reaches the overlay and the transcript', () => {
  it('the server object for a visible correction; server word boxes for an approved hidden one; nothing for one with no place', () => {
    const effective = [{ id: 'v', wordIds: ['f1_1_2'], renderTarget: { version: 1, source: 'wordIds', wordIds: ['f1_1_2'], boxes: [box(12)] } }];
    const rows = [row({ key: 'v', targetId: 'v', status: 'visible', quotedText: 'to', wordIds: ['f1_1_2'] }), row({}), row({ key: 'bad', targetId: 'bad', quotedText: 'nope' })];
    const all = workspaceCorrections(rows, buildPositions(rows, snap([P1], effective)), snap([P1], effective)) as { id: string; renderTarget: { boxes: unknown[]; source: string } }[];
    expect(all.map(c => c.id)).toEqual(['v', 'c1']);
    expect(all[0]).toBe(effective[0] as never);
    expect(all[1].renderTarget.boxes).toEqual([P1.words[1].bbox]);
  });
  it('a hidden item with text but no box goes to the transcript without drawing', () => {
    const noBox = page('f1', 1, 'I goes to'); noBox.words[1].bbox = null;
    const rows = [row({})];
    const [item] = workspaceCorrections(rows, buildPositions(rows, snap([noBox])), snap([noBox])) as { wordIds: string[]; renderTarget: { source: string; boxes: unknown[] } }[];
    expect(item.wordIds).toEqual(['f1_1_1']);
    expect(item.renderTarget).toEqual(jasmine.objectContaining({ source: 'none', boxes: [] }));
  });
  it('rotation: several boxes of one item go through the same mapping as the student view (EXIF 6)', () => {
    const two = page('f1', 1, 'I goes to the', {});
    const rows = [row({ wordIds: ['f1_1_1', 'f1_1_2'], quotedText: 'goes to' })];
    const [item] = workspaceCorrections(rows, buildPositions(rows, snap([two])), snap([two])) as FeedbackAnnotation[];
    const geometry: AnnotationImageGeometry = { version: 1, fileId: 'f1', pageNumber: 1, width: 1200, height: 900, orientation: 6, coordinateSpace: 'encoded-image' };
    const mapped = imagePresentationGeometry([{ ...item, _id: 'c1', submissionId: 's', fileId: 'f1' } as FeedbackAnnotation], two.words as never, geometry, 'f1', 1, 900, 1200);
    const boxes = mapped.annotations[0].renderTarget!.boxes;
    expect(boxes).toEqual([{ x: 88, y: 6, w: 2, h: 5 }, { x: 88, y: 12, w: 2, h: 5 }]);
  });
});

describe('the shared selection', () => {
  it('pin, hover over it, hover end, clear', () => {
    let state = nextSelection(NO_SELECTION, { type: 'pin', id: 'a' });
    expect(activeOf(state)).toBe('a');
    state = nextSelection(state, { type: 'hover', id: 'b' });
    expect(activeOf(state)).toBe('b');
    expect(state.pinnedId).toBe('a');
    state = nextSelection(state, { type: 'hoverEnd' });
    expect(activeOf(state)).toBe('a');
    expect(nextSelection(state, { type: 'clear' })).toEqual(NO_SELECTION);
  });
  it('a new pin replaces the old and ends any hover', () => {
    expect(nextSelection({ pinnedId: 'a', hoverId: 'b' }, { type: 'pin', id: 'c' })).toEqual({ pinnedId: 'c', hoverId: null });
  });
  it('overlapping corrections: repeating the action walks through them and comes back', () => {
    expect(nextInCycle(['a', 'b'], null)).toBe('a');
    expect(nextInCycle(['a', 'b'], 'a')).toBe('b');
    expect(nextInCycle(['a', 'b'], 'b')).toBe('a');
    expect(nextInCycle(['a', 'b'], 'x')).toBe('a');
    expect(nextInCycle([], 'a')).toBeNull();
  });
  it('focus or hover stays on the active one when it is there', () => {
    expect(preferCurrent(['a', 'b'], 'b')).toBe('b');
    expect(preferCurrent(['a', 'b'], 'x')).toBe('a');
    expect(preferCurrent([], 'x')).toBeNull();
  });
});

describe('list and panel helpers', () => {
  const many = Array.from({ length: 120 }, (_, i) => row({ key: `r${i}`, status: i === 110 ? 'hidden' : 'visible' }));
  it('past the shown limit: shows enough pages to include the row', () => {
    expect(revealRow(many, 'r60', 'all', 50, 50)).toEqual({ filter: 'all', limit: 100 });
    expect(revealRow(many, 'r10', 'all', 50, 50)).toBeNull();
  });
  it('filtered out: switches to All', () => {
    expect(revealRow(many, 'r110', 'visible', 50, 50)).toEqual({ filter: 'all', limit: 150 });
    expect(revealRow(many, 'r1', 'hidden', 50, 50)).toEqual({ filter: 'all', limit: 50 });
  });
  it('an unknown row changes nothing', () => { expect(revealRow(many, 'nope', 'all', 50, 50)).toBeNull(); });
  it('panel scroll: nothing when visible, centred otherwise, independent of page zoom (same units as the rectangles)', () => {
    const panel = { top: 100, height: 400, scrollTop: 50 };
    expect(panelScrollTop(panel, { top: 200, height: 20 })).toBeNull();
    expect(panelScrollTop(panel, { top: 900, height: 20 })).toBe(50 + 800 - 190);
    expect(panelScrollTop(panel, { top: 40, height: 20 })).toBe(0);
    expect(panelScrollTop({ top: 200, height: 800, scrollTop: 100 }, { top: 1800, height: 40 })).toBe(100 + 1600 - 380);
  });
});
