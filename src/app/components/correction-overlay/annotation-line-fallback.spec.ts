import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox, OcrWord } from '../../models/ocr-token.model';
import { buildAnnotationVisuals } from './annotation-geometry';
import { isSentenceLevel, lineFallbackBands, reliableTranscriptLines, transcriptLineOfWords } from './annotation-line-fallback';
import { CorrectionOverlay } from './correction-overlay';
import { correctionGeometryTargets } from '../../utils/correction-bbox.util';

// Synthetic page: `rows[n]` is one transcript line; each cell is a word, boxed at the given centre height or null when the provider did not read it.
const box = (y: number, x = 20): OcrBBox => ({ x, y: y - 2, w: 8, h: 4 });
function page(rows: (number | null)[][]): OcrWord[] {
  return rows.flatMap((row, line) => row.map((y, index) => ({ id: `w${line}_${index}`, text: `word${line}x${index}`, bbox: y === null ? null : box(y, 20 + index * 10),
    separatorBefore: line && !index ? '\n' : index ? ' ' : '' } as OcrWord)));
}
const REGULAR = page([[10, null], [15, null], [20, null], [null, null], [30, null]]);
const target = (ids: string[], quotedText = ids.map(id => `word${id.slice(1).replace('_', 'x')}`).join(' '), renderTarget: Record<string, unknown> | null = { source: 'none', textRanges: [{ start: 0, end: 4 }] }, symbol = 'FRAG') => ({ wordIds: ids, quotedText, renderTarget, symbol });

describe('reliableTranscriptLines', () => {
  it('only the transcript\'s own line breaks make a line', () => {
    expect(transcriptLineOfWords(REGULAR).get('w2_1')).toBe(2);
  });
  it('a line is proven by its own boxes; a line without one is not interpolated', () => {
    const lines = reliableTranscriptLines(REGULAR);
    expect([...lines.keys()]).toEqual([0, 1, 2, 4]);
    expect(lines.get(1)).toEqual({ line: 1, top: 13, bottom: 17 });
    expect(lines.has(3)).toBeFalse();
  });
  it('fewer than three boxed lines give no spacing to check against: nothing is reliable', () => {
    expect(reliableTranscriptLines(page([[10], [15], [null]])).size).toBe(0);
  });
  it('a gap of two rows means a transcript line spans two rows of the page: both lines beside it lose their place', () => {
    // The real case: the reader joined two written lines, so the words of line 2 may be on either.
    const lines = reliableTranscriptLines(page([[10], [15], [20], [29], [34], [39]]));
    expect([...lines.keys()]).toEqual([0, 1, 4, 5]);
  });
  it('boxes of one line too far apart: that line is not reliable', () => {
    const lines = reliableTranscriptLines(page([[10], [15], [20, 24], [25], [30]]));
    expect(lines.has(2)).toBeFalse();
  });
  it('lines that run backwards up the page are not reliable', () => {
    expect(reliableTranscriptLines(page([[30], [25], [20], [15]])).size).toBe(0);
  });
});

describe('isSentenceLevel', () => {
  it('sentence codes, Content and Organization codes, and quotes of more than four words', () => {
    expect(isSentenceLevel({ symbol: 'FRAG', quotedText: 'a' })).toBeTrue();
    expect(isSentenceLevel({ symbol: 'RO', quotedText: 'a b' })).toBeTrue();
    expect(isSentenceLevel({ symbol: 'COH', quotedText: 'a' })).toBeTrue();
    expect(isSentenceLevel({ symbol: 'TA', quotedText: 'a' })).toBeTrue();
    expect(isSentenceLevel({ symbol: 'WC', quotedText: 'one two three four five' })).toBeTrue();
  });
  it('word errors are not, up to four words', () => {
    for (const symbol of ['SP', 'AGR', 'WF', 'PREP', 'P']) expect(isSentenceLevel({ symbol, quotedText: 'chany' })).toBeFalse();
    expect(isSentenceLevel({ symbol: 'WC', quotedText: 'one two three four' })).toBeFalse();
  });
});

describe('lineFallbackBands', () => {
  it('a one-word error never gets a line, even on a proven line', () => {
    expect(lineFallbackBands(target(['w1_1'], undefined, undefined, 'SP'), REGULAR)).toEqual([]);
  });
  it('a checked sentence correction whose words have no box gets its line', () => {
    expect(lineFallbackBands(target(['w1_1']), REGULAR).map(band => band.line)).toEqual([1]);
  });
  it('nothing when its line has no box', () => {
    expect(lineFallbackBands(target(['w3_0']), REGULAR)).toEqual([]);
  });
  it('nothing when the server did not check the text (no textRanges), or refused the target', () => {
    expect(lineFallbackBands(target(['w1_1'], undefined, { source: 'none', textRanges: [] }), REGULAR)).toEqual([]);
    expect(lineFallbackBands(target(['w1_1'], undefined, { source: 'none' }), REGULAR)).toEqual([]);
    expect(lineFallbackBands(target(['w1_1'], undefined, null), REGULAR)).toEqual([]);
    expect(lineFallbackBands(target(['w1_1'], undefined, { source: 'wordIds', textRanges: [{}] }), REGULAR)).toEqual([]);
  });
  it('nothing when the words do not read as the quote', () => {
    expect(lineFallbackBands(target(['w1_1'], 'something else'), REGULAR)).toEqual([]);
  });
  it('nothing when a word is unknown, or has its own box (that is a word-level target)', () => {
    expect(lineFallbackBands(target(['gone']), REGULAR)).toEqual([]);
    expect(lineFallbackBands(target(['w1_0']), REGULAR)).toEqual([]);
  });
  it('across two lines: both must be reliable, and they must follow each other', () => {
    expect(lineFallbackBands(target(['w1_1', 'w2_1']), REGULAR).map(band => band.line)).toEqual([1, 2]);
    expect(lineFallbackBands(target(['w2_1', 'w3_0']), REGULAR)).toEqual([]);
    expect(lineFallbackBands(target(['w0_1', 'w2_1']), REGULAR)).toEqual([]);
  });
});

const annotation = (id: string, wordIds: string[], patch: Partial<FeedbackAnnotation> = {}): FeedbackAnnotation => ({ _id: id, submissionId: 's', fileId: 'f', page: 1, wordIds, symbol: 'FRAG', group: 'GRAMMAR', color: '#c00',
  message: 'm', suggestedText: 's', source: 'AI', editable: false, bboxList: [], quotedText: wordIds.map(w => `word${w.slice(1).replace('_', 'x')}`).join(' '),
  renderTarget: { version: 1, source: 'none', wordIds: [], anchors: [], boxes: [], textRanges: [{ start: 0, end: 4 }] }, ...patch } as FeedbackAnnotation);

describe('the pages\' correction mapping', () => {
  it('keeps what the line check reads: without the quote the real pages drew nothing', () => {
    const server = annotation('a', ['w1_1']);
    const mapped = { ...annotation('a', ['w1_1'], { quotedText: undefined, renderTarget: undefined }), ...correctionGeometryTargets(server) };
    expect(mapped.quotedText).toBe(server.quotedText);
    expect(mapped.renderTarget?.textRanges?.length).toBe(1);
    expect(buildAnnotationVisuals([mapped], REGULAR, 1, 1000, 1000)[0].lineLevel).toBeTrue();
  });
});

describe('buildAnnotationVisuals: line level', () => {
  it('a word error without a box draws nothing', () => {
    expect(buildAnnotationVisuals([annotation('a', ['w1_1'], { symbol: 'SP', group: 'MECHANICS' })], REGULAR, 1, 1000, 1000)).toEqual([]);
  });
  it('a sentence over two lines is one bracket from the first line to the last', () => {
    const visual = buildAnnotationVisuals([annotation('a', ['w1_1', 'w2_1'])], REGULAR, 1, 1000, 1000)[0];
    expect(visual.segments.length).toBe(1);
    expect(visual.segments[0].top).toBe(13);
    expect(visual.segments[0].height).toBe(9);
  });
  it('a margin bracket over the line band, never a box on a word', () => {
    const visual = buildAnnotationVisuals([annotation('a', ['w1_1'])], REGULAR, 1, 1000, 1000)[0];
    expect(visual.lineLevel).toBeTrue();
    expect(visual.segments.length).toBe(1);
    expect(visual.segments[0].lineLevel).toBeTrue();
    expect(visual.segments[0].width).toBe(0);
    expect(visual.segments[0].left).toBeLessThan(20);
    expect(visual.segments[0].top).toBe(13);
    expect(visual.segments[0].height).toBe(4);
  });
  it('a correction with a box stays word level', () => {
    const boxed = annotation('b', ['w1_0'], { renderTarget: { version: 1, source: 'wordIds', wordIds: ['w1_0'], anchors: [], boxes: [box(15)] } });
    const visual = buildAnnotationVisuals([boxed], REGULAR, 1, 1000, 1000)[0];
    expect(visual.lineLevel).toBeUndefined();
    expect(visual.segments[0].lineLevel).toBeUndefined();
  });
  it('no reliable line: no visual', () => {
    expect(buildAnnotationVisuals([annotation('c', ['w3_0'])], REGULAR, 1, 1000, 1000)).toEqual([]);
  });
});

describe('CorrectionOverlay: what the page shows', () => {
  function render(annotations: FeedbackAnnotation[], words: OcrWord[] = REGULAR) {
    TestBed.configureTestingModule({ imports: [CorrectionOverlay] });
    const fixture = TestBed.createComponent(CorrectionOverlay), component = fixture.componentInstance;
    component.imageUrl = 'blob:test-image'; component.annotations = annotations; component.ocrWords = words; component.fileId = 'f'; component.submissionId = 's';
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true), annotations: new SimpleChange(null, annotations, true) });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    Object.defineProperty(image, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1000, configurable: true });
    image.style.aspectRatio = '1 / 1';
    component.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    return { fixture, component, dom: fixture.nativeElement as HTMLElement };
  }
  it('a word error without a box: nothing on the image, and it is counted in the note', () => {
    const { dom } = render([annotation('a', ['w1_1'], { symbol: 'SP', group: 'MECHANICS' })]);
    expect(dom.querySelector('[data-line-rail]')).toBeNull();
    expect(dom.querySelector('.correction-overlay__marker')).toBeNull();
    expect(dom.querySelector('[data-overlay-unlocated]')!.textContent).toContain('1 correction is not located');
  });
  it('a word underline is two pixels, in a strong shade of its own colour', () => {
    const boxed = annotation('b', ['w1_0'], { symbol: 'SP', group: 'MECHANICS', color: '#FFF3BF', renderTarget: { version: 1, source: 'wordIds', wordIds: ['w1_0'], anchors: [], boxes: [box(15)] } });
    const { dom } = render([boxed]);
    const line = dom.querySelector<HTMLElement>('.correction-overlay__underline')!;
    expect(line.getBoundingClientRect().height).toBe(2);
    expect(getComputedStyle(line).backgroundColor).toBe('rgb(203, 167, 11)');
    expect(getComputedStyle(line).backgroundColor).not.toBe('rgb(255, 243, 191)');
  });
  it('a sentence marker is a bracket, has a badge and says in words that it marks the lines', () => {
    const { dom, fixture } = render([annotation('a', ['w1_1'])]);
    const rail = dom.querySelector<HTMLElement>('[data-line-rail]')!;
    expect(rail.classList.contains('correction-overlay__line-rail')).toBeTrue();
    expect(getComputedStyle(rail).borderLeftStyle).toBe('solid');
    expect(getComputedStyle(rail).borderTopStyle).toBe('solid');
    expect(getComputedStyle(rail).borderRightStyle).toBe('none');
    const marker = dom.querySelector<HTMLElement>('.correction-overlay__marker')!;
    expect(marker.textContent).toContain('FRAG');
    expect(marker.getAttribute('aria-label')).toContain('exact words could not be located');
    expect(dom.querySelector('[data-overlay-line-count]')!.textContent).toContain('1 sentence correction, not the exact words');
    marker.click(); fixture.detectChanges();
    expect(dom.querySelector('[data-line-note]')?.textContent).toContain('exact words could not be located');
  });
  it('corrections without a place: nothing drawn for them, and the page says how many', () => {
    const { dom } = render([annotation('a', ['w3_0']), annotation('b', ['w3_1'])]);
    expect(dom.querySelector('[data-line-rail]')).toBeNull();
    expect(dom.querySelector('.correction-overlay__marker')).toBeNull();
    expect(dom.querySelector('[data-overlay-unlocated]')!.textContent).toContain('2 corrections are not located on this image');
  });
  it('everything placed on words: no note at all', () => {
    const boxed = annotation('b', ['w1_0'], { renderTarget: { version: 1, source: 'wordIds', wordIds: ['w1_0'], anchors: [], boxes: [box(15)] } });
    const { dom } = render([boxed]);
    expect(dom.querySelector('[data-overlay-placement]')).toBeNull();
    expect(dom.querySelector('[data-line-rail]')).toBeNull();
  });
  it('an image the geometry refuses: all are counted as not located', () => {
    TestBed.configureTestingModule({ imports: [CorrectionOverlay] });
    const fixture = TestBed.createComponent(CorrectionOverlay), component = fixture.componentInstance;
    component.imageUrl = 'blob:test-image'; component.annotations = [annotation('a', ['w1_1'])]; component.ocrWords = REGULAR; component.fileId = 'f'; component.submissionId = 's';
    component.sourceGeometry = { version: 1, fileId: 'f', pageNumber: 1, width: 500, height: 500, orientation: 1, coordinateSpace: 'display-image' };
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true) });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    Object.defineProperty(image, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1000, configurable: true });
    component.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-line-rail]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-overlay-unlocated]').textContent).toContain('1 correction is not located');
  });
});
