import { By } from '@angular/platform-browser';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import { DeviceService } from '../../../services/device.service';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import { SharedPageImages } from '../../submission-page-review/shared-page-images';
import { AnnotationSnapshot, buildRows } from './annotation-editor.logic';
import { buildPositions } from './annotation-sync.logic';
import { CorrectionSelection } from './correction-selection';
import { AnnotationLayoutSession, ReviewWorkspace, applySyncPointer, scrollPanelTo } from './review-workspace';

const annotation = (patch: Partial<FeedbackAnnotation>): FeedbackAnnotation => ({ _id: 'c1', submissionId: 's', wordIds: ['w1'], symbol: 'AGR', message: 'm', color: '#c00', source: 'AI', editable: false, ...patch });
const WORDS = Array.from({ length: 200 }, (_, i) => ({ id: `w${i}`, text: `word${i}`, bbox: { x: 1 + (i % 10) * 9, y: 1 + Math.floor(i / 10) * 4, w: 8, h: 3 }, separatorBefore: (i ? ' ' : '') as '' | ' ' }));

describe('CorrectionSelection', () => {
  it('hover waits, a pin is immediate, and destroying cancels what is waiting', fakeAsync(() => {
    const selection = new CorrectionSelection();
    selection.hover('a', 'list');
    expect(selection.activeId()).toBeNull();
    tick(149);
    expect(selection.activeId()).toBeNull();
    tick(1);
    expect(selection.activeId()).toBe('a');
    expect(selection.source()).toBe('list');
    selection.pin('b', 'image');
    expect(selection.activeId()).toBe('b');
    tick(800);
    selection.hover('c', 'list');
    selection.ngOnDestroy();
    tick(500);
    expect(selection.activeId()).toBe('b');
  }));
  it('moving across items only ever activates where the pointer stopped', fakeAsync(() => {
    const selection = new CorrectionSelection();
    selection.hover('a', 'list'); tick(50); selection.hoverEnd(); tick(50); selection.hover('b', 'list'); tick(150);
    expect(selection.activeId()).toBe('b');
    selection.hoverEnd(); tick(150);
    expect(selection.activeId()).toBeNull();
  }));
  it('a hover right after a pin is a page that scrolled under a resting pointer: the choice stays', fakeAsync(() => {
    const selection = new CorrectionSelection();
    selection.pin('a', 'list');
    selection.hover('b', 'list'); tick(400);
    expect(selection.activeId()).toBe('a');
    tick(400);
    selection.hover('b', 'list'); tick(150);
    expect(selection.activeId()).toBe('b');
    expect(selection.pinnedId()).toBe('a');
  }));
  it('clear cancels a waiting hover and clears cleanly', fakeAsync(() => {
    const selection = new CorrectionSelection();
    selection.pin('a', 'list'); tick(800); selection.hover('b', 'list'); selection.clear(); tick(500);
    expect(selection.activeId()).toBeNull();
    expect(selection.pinnedId()).toBeNull();
    expect(selection.source()).toBeNull();
  }));
});

describe('applySyncPointer', () => {
  it('keyboard focus pins; activate cycles overlapping corrections from the pinned one', () => {
    const selection = new CorrectionSelection();
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'focus' }, 'transcript');
    expect(selection.pinnedId()).toBe('a');
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'activate' }, 'transcript');
    expect(selection.pinnedId()).toBe('b');
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'activate' }, 'transcript');
    expect(selection.pinnedId()).toBe('a');
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'focus' }, 'transcript');
    expect(selection.pinnedId()).toBe('a');
  });
  it('the first click after hovering picks the first, not the second', fakeAsync(() => {
    const selection = new CorrectionSelection();
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'hover' }, 'image');
    tick(150);
    applySyncPointer(selection, { ids: ['a', 'b'], kind: 'activate' }, 'image');
    expect(selection.pinnedId()).toBe('a');
  }));
});

describe('scrollPanelTo', () => {
  let panel: HTMLDivElement, target: HTMLDivElement;
  beforeEach(() => {
    panel = document.createElement('div'); panel.style.cssText = 'height:100px;overflow:auto;position:fixed;top:0';
    target = document.createElement('div'); target.style.cssText = 'margin-top:900px;height:20px';
    panel.appendChild(target); document.body.appendChild(panel);
  });
  afterEach(() => panel.remove());
  const motion = (reduce: boolean) => spyOn(window, 'matchMedia').and.returnValue({ matches: reduce } as MediaQueryList);
  it('smooth by default, and only the panel moves', () => {
    motion(false);
    const scroll = spyOn(panel, 'scrollTo'), scrollPage = spyOn(window, 'scrollTo');
    scrollPanelTo(panel, target);
    expect(scroll.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ behavior: 'smooth' }));
    expect(scrollPage).not.toHaveBeenCalled();
  });
  it('respects prefers-reduced-motion', () => {
    motion(true);
    const scroll = spyOn(panel, 'scrollTo');
    scrollPanelTo(panel, target);
    expect(scroll.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ behavior: 'auto' }));
  });
  it('does nothing when already visible or when there is no target', () => {
    motion(false);
    target.style.marginTop = '20px';
    const scroll = spyOn(panel, 'scrollTo');
    scrollPanelTo(panel, target); scrollPanelTo(panel, null); scrollPanelTo(undefined, target);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('TokenizedTranscript sync mode', () => {
  let fixture: ComponentFixture<TokenizedTranscript>, component: TokenizedTranscript;
  const dom = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TokenizedTranscript] }).compileComponents();
    fixture = TestBed.createComponent(TokenizedTranscript); component = fixture.componentInstance;
  });
  function render(sync: boolean, annotations: FeedbackAnnotation[], states?: Map<string, 'hidden' | 'archived'>) {
    component.ocrWords = WORDS; component.annotations = annotations; component.syncMode = sync; component.syncStates = states ?? null;
    component.ngOnChanges({ ocrWords: new SimpleChange(null, WORDS, true), annotations: new SimpleChange(null, annotations, true) });
    fixture.detectChanges();
  }
  it('off (student pages): no sync attributes, and activating opens the tooltip as before', () => {
    render(false, [annotation({})]);
    expect(dom().querySelector('[data-word-id], [data-sync-state], .is-sync-active')).toBeNull();
    const word = dom().querySelector('.correction-highlight') as HTMLElement;
    const seen = jasmine.createSpy();
    component.syncPointer.subscribe(seen);
    word.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    word.click();
    expect(seen).not.toHaveBeenCalled();
    expect(component.activeWordId).toBe('w1');
  });
  it('on: one set of listeners on the container, none per word', () => {
    const adds = spyOn(HTMLElement.prototype, 'addEventListener').and.callThrough();
    render(true, WORDS.map((w, i) => annotation({ _id: `c${i}`, wordIds: [w.id] })));
    const onWords = adds.calls.all().filter(call => (call.object as HTMLElement).hasAttribute?.('data-word-id'));
    expect(onWords.length).toBe(0);
    expect(dom().querySelectorAll('[data-word-id]').length).toBe(200);
  });
  it('on: hover, keyboard and click report the word\'s corrections, without a tooltip', () => {
    render(true, [annotation({ _id: 'a' }), annotation({ _id: 'b' })]);
    const seen: { ids: string[]; kind: string }[] = [];
    component.syncPointer.subscribe(event => seen.push(event));
    const word = dom().querySelector('[data-word-id="w1"]') as HTMLElement;
    word.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    word.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
    word.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
    word.click();
    word.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(seen.map(e => e.kind)).toEqual(['hover', 'leave', 'activate', 'activate']);
    expect(seen[0].ids).toEqual(['a', 'b']);
    expect(component.activeWordId).toBeNull();
  });
  it('a word without a correction reports nothing and is not a tab stop', () => {
    render(true, [annotation({})]);
    const seen = jasmine.createSpy();
    component.syncPointer.subscribe(seen);
    const plain = dom().querySelector('[data-word-id="w5"]') as HTMLElement;
    plain.click();
    expect(seen).not.toHaveBeenCalled();
    expect(plain.hasAttribute('tabindex')).toBeFalse();
  });
  it('marks every word of the active correction and clears it, touching only those nodes', () => {
    render(true, [annotation({ _id: 'a', wordIds: ['w1', 'w2', 'w11'] }), annotation({ _id: 'b', wordIds: ['w5'] })]);
    const select = (id: string | null) => { component.syncActiveId = id; component.ngOnChanges({ syncActiveId: new SimpleChange(null, id, false) }); fixture.detectChanges(); };
    const marked = () => [...dom().querySelectorAll('.is-sync-active')].map(el => el.getAttribute('data-word-id'));
    select('a');
    expect(marked()).toEqual(['w1', 'w2', 'w11']);
    select('b');
    expect(marked()).toEqual(['w5']);
    select(null);
    expect(marked()).toEqual([]);
  });
  it('a word shared with a visible correction does not read as hidden', () => {
    render(true, [annotation({ _id: 'h', wordIds: ['w1'] }), annotation({ _id: 'v', wordIds: ['w1'] })], new Map([['h', 'hidden']]));
    expect(dom().querySelector('[data-word-id="w1"]')?.hasAttribute('data-sync-state')).toBeFalse();
  });
  it('hidden and removed words carry their state', () => {
    render(true, [annotation({ _id: 'h', wordIds: ['w1'] }), annotation({ _id: 'r', wordIds: ['w2'] })], new Map([['h', 'hidden'], ['r', 'archived']]));
    expect(dom().querySelector('[data-word-id="w1"]')?.getAttribute('data-sync-state')).toBe('hidden');
    expect(dom().querySelector('[data-word-id="w2"]')?.getAttribute('data-sync-state')).toBe('archived');
    expect(dom().querySelector('[data-word-id="w3"]')?.hasAttribute('data-sync-state')).toBeFalse();
  });
  it('destroying removes the listeners', () => {
    render(true, [annotation({})]);
    const root = dom().querySelector('.tokenized-transcript') as HTMLElement, removes = spyOn(root, 'removeEventListener').and.callThrough();
    fixture.destroy();
    expect(removes.calls.allArgs().map(args => args[0])).toEqual(jasmine.arrayWithExactContents(['pointerover', 'pointerout', 'focusin', 'click', 'keydown']));
  });
});

describe('CorrectionOverlay sync mode', () => {
  let fixture: ComponentFixture<CorrectionOverlay>, component: CorrectionOverlay;
  const dom = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay], providers: [{ provide: DeviceService, useValue: { isMobile: () => false } }] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay); component = fixture.componentInstance;
  });
  function render(sync: boolean, annotations: FeedbackAnnotation[], states?: Map<string, 'hidden' | 'archived'>) {
    component.imageUrl = 'blob:test-image'; component.annotations = annotations; component.ocrWords = WORDS; component.syncMode = sync; component.syncStates = states ?? null;
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true), annotations: new SimpleChange(null, annotations, true) });
    fixture.detectChanges();
    const image = dom().querySelector('img') as HTMLImageElement;
    if (!image) return;
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1600, configurable: true });
    image.style.cssText = 'width:600px;aspect-ratio:3/4;display:block';
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }
  const load = async () => { await Promise.resolve(); fixture.detectChanges(); };
  async function ready(sync: boolean, annotations: FeedbackAnnotation[], states?: Map<string, 'hidden' | 'archived'>) {
    component.syncMode = sync;
    render(sync, annotations, states); await load(); render(sync, annotations, states);
  }
  it('off (student pages): no sync attributes on anything it draws', async () => {
    await ready(false, [annotation({})]);
    expect(dom().querySelectorAll('.correction-overlay__marker').length).toBe(1);
    expect(dom().querySelector('[data-sync-state], [aria-pressed], .is-sync-active, .is-sync')).toBeNull();
    expect(dom().querySelector('.correction-overlay__marker')?.hasAttribute('aria-expanded')).toBeTrue();
  });
  it('off: registers no sync listeners', async () => {
    const adds = spyOn(HTMLElement.prototype, 'addEventListener').and.callThrough();
    await ready(false, [annotation({})]);
    const kinds = adds.calls.all().filter(call => (call.object as HTMLElement).classList?.contains('correction-overlay') && call.args[2] === true).map(call => call.args[0]);
    expect(kinds).toEqual([]);
  });
  it('on: reports what a marker holds, opens no tooltip, and says what is drawn', async () => {
    const drawn: Set<string>[] = [], seen: { ids: string[]; kind: string }[] = [];
    component.syncDrawn.subscribe(ids => drawn.push(ids)); component.syncPointer.subscribe(e => seen.push(e));
    await ready(true, [annotation({ _id: 'a' })]);
    fixture.detectChanges();
    component.ngAfterViewInit();
    const marker = dom().querySelector('.correction-overlay__marker') as HTMLButtonElement;
    expect(drawn.at(-1)).toEqual(new Set(['a']));
    marker.click();
    marker.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    marker.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect(seen.map(e => e.kind)).toEqual(jasmine.arrayContaining(['activate', 'hover']));
    expect(seen[0].ids).toEqual(['a']);
    expect(component.activeMarker).toBeNull();
    expect(marker.getAttribute('aria-pressed')).toBe('false');
  });
  it('on: marks the active marker, and says the state in words on a hidden one', async () => {
    await ready(true, [annotation({ _id: 'a' }), annotation({ _id: 'h', wordIds: ['w50'] })], new Map([['h', 'hidden']]));
    component.syncActiveId = 'a';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const markers = [...dom().querySelectorAll<HTMLElement>('.correction-overlay__marker')];
    expect(markers.length).toBe(2);
    const hidden = markers.find(m => m.getAttribute('data-sync-state') === 'hidden')!;
    expect(hidden.getAttribute('aria-label')).toContain('hidden from the student, approximate position');
  });
  it('state: only when everything on the item is not visible', () => {
    component.syncStates = new Map<string, 'hidden' | 'archived'>([['h', 'hidden'], ['r', 'archived']]);
    expect(component.syncState(['h'])).toBe('hidden');
    expect(component.syncState(['r', 'h'])).toBe('archived');
    expect(component.syncState(['h', 'visible'])).toBeNull();
    expect(component.syncState([])).toBeNull();
    component.syncStates = null;
    expect(component.syncState(['h'])).toBeNull();
  });
  it('reports nothing drawn when the geometry refuses the image', async () => {
    const drawn: Set<string>[] = [];
    component.syncDrawn.subscribe(ids => drawn.push(ids));
    component.fileId = 'f1';
    component.sourceGeometry = { version: 1, fileId: 'f1', pageNumber: 1, width: 10, height: 10, orientation: 1, coordinateSpace: 'encoded-image', ambiguous: true };
    await ready(true, [annotation({ _id: 'a' })]);
    expect(drawn.at(-1)).toEqual(new Set());
    expect(dom().querySelectorAll('.correction-overlay__marker').length).toBe(0);
  });
  it('destroying removes the listeners', async () => {
    await ready(true, [annotation({})]);
    fixture.detectChanges();
    const root = dom().querySelector('.correction-overlay') as HTMLElement, removes = spyOn(root, 'removeEventListener').and.callThrough();
    fixture.destroy();
    expect(removes.calls.allArgs().map(args => args[0])).toEqual(jasmine.arrayWithExactContents(['pointerover', 'pointerout', 'focusin', 'click', 'keydown']));
  });
});

describe('SharedPageImages', () => {
  const SOURCE = '/files/submissions/00000000-0000-4000-8000-000000000001.jpg';
  it('downloads once for two holders, revokes with the last one', async () => {
    const get = jasmine.createSpy('get').and.returnValue(of(new Blob(['x'])));
    const made = spyOn(URL, 'createObjectURL').and.returnValue('blob:one'), revoked = spyOn(URL, 'revokeObjectURL');
    const store = new SharedPageImages({ get } as never);
    const [a, b] = await Promise.all([store.acquire(SOURCE), store.acquire(SOURCE)]);
    expect([a, b]).toEqual(['blob:one', 'blob:one']);
    expect(get).toHaveBeenCalledTimes(1);
    expect(made).toHaveBeenCalledTimes(1);
    store.release(SOURCE);
    expect(revoked).not.toHaveBeenCalled();
    store.release(SOURCE);
    expect(revoked).toHaveBeenCalledOnceWith('blob:one');
  });
  it('refuses anything but a server page image, without a request', async () => {
    const get = jasmine.createSpy('get');
    const store = new SharedPageImages({ get } as never);
    await expectAsync(store.acquire('https://evil.example/x.jpg')).toBeRejected();
    await expectAsync(store.acquire('/files/submissions/../secret.jpg')).toBeRejected();
    expect(get).not.toHaveBeenCalled();
  });
  it('a failed download is not kept, so a retry asks again', async () => {
    const get = jasmine.createSpy('get').and.returnValues(throwError(() => new Error('nope')), of(new Blob(['x'])));
    spyOn(URL, 'createObjectURL').and.returnValue('blob:two');
    const store = new SharedPageImages({ get } as never);
    await expectAsync(store.acquire(SOURCE)).toBeRejected();
    expect(await store.acquire(SOURCE)).toBe('blob:two');
  });
  it('released before the download finished: the URL is revoked, not leaked', async () => {
    const get = jasmine.createSpy('get').and.returnValue(of(new Blob(['x'])));
    spyOn(URL, 'createObjectURL').and.returnValue('blob:late');
    const revoked = spyOn(URL, 'revokeObjectURL');
    const store = new SharedPageImages({ get } as never);
    const pending = store.acquire(SOURCE);
    store.release(SOURCE);
    await pending;
    expect(revoked).toHaveBeenCalledOnceWith('blob:late');
  });
  it('destroy revokes everything still held', async () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:held');
    const revoked = spyOn(URL, 'revokeObjectURL');
    const store = new SharedPageImages({ get: () => of(new Blob(['x'])) } as never);
    await store.acquire(SOURCE);
    store.destroy();
    expect(revoked).toHaveBeenCalledOnceWith('blob:held');
  });
});


describe('ReviewWorkspace split layout', () => {
  let fixture: ComponentFixture<ReviewWorkspace>, frame: HTMLIFrameElement | undefined;
  const dom = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReviewWorkspace], providers: [CorrectionSelection,
      { provide: DeviceService, useValue: { isMobile: () => false } }] }).compileComponents();
    fixture = TestBed.createComponent(ReviewWorkspace);
    fixture.componentRef.setInput('submissionId', 's');
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('positions', new Map());
    fixture.componentRef.setInput('snapshot', { pages: [{ fileId: 'f', pageNumber: 1, text: 'word', words: [WORDS[0]] }], effective: [] });
    fixture.componentRef.setInput('imageUrl', 'blob:existing');
    fixture.detectChanges();
  });
  afterEach(() => frame?.remove());
  // Real CSS in an isolated browsing context: media queries use its actual viewport width.
  function atWidth(width: number) {
    frame?.remove();
    frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:800px;border:0';
    frame.style.width = width + 'px'; document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
    doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true));
    return { doc, css: (selector: string) => frame!.contentWindow!.getComputedStyle(doc.querySelector(selector)!) };
  }
  function images(count: number): AnnotationSnapshot {
    const pages = Array.from({ length: count }, (_, index) => ({ fileId: 'file-' + index, pageNumber: 1,
      startChar: index * 5, endChar: index * 5 + 4, text: 'word', words: [{ ...WORDS[0], text: 'word' }] }));
    const corrections = pages.map(page => ({ id: 'mark-' + page.fileId, fileId: page.fileId, page: 1, moderationStatus: 'visible' as const,
      wordIds: ['w0'], startChar: page.startChar, endChar: page.endChar, quotedText: 'word', symbol: 'AGR', message: 'Use this word.' }));
    const snapshot: AnnotationSnapshot = { revision: 1, sourceHash: 'original-source', scoringReviewRequired: false,
      pages, corrections, orphans: [], effective: corrections.map(c => ({ ...c, renderTarget: { version: 1, source: 'wordIds', wordIds: c.wordIds, boxes: [WORDS[0].bbox] } })), transitions: {}, legend: { groups: [] } };
    fixture.componentRef.setInput('snapshot', snapshot);
    fixture.componentRef.setInput('fileIds', pages.map(page => page.fileId));
    fixture.componentRef.setInput('activeFileId', pages[0].fileId);
    fixture.componentRef.setInput('rows', buildRows(snapshot));
    fixture.componentRef.setInput('positions', buildPositions(buildRows(snapshot), snapshot));
    fixture.componentInstance.fileRequested.subscribe(fileId => {
      fixture.componentRef.setInput('activeFileId', fileId);
      fixture.componentRef.setInput('imageUrl', 'blob:' + fileId);
    });
    fixture.detectChanges();
    return snapshot;
  }
  const imageTabs = () => [...dom().querySelectorAll<HTMLButtonElement>('[data-image-index]')];
  for (const count of [1, 2, 3, 23]) {
    it('derives image navigation from ' + count + ' uploaded files and preserves a single image', () => {
      images(count);
      expect(imageTabs().length).toBe(count === 1 ? 0 : count);
      expect(dom().querySelector('app-correction-overlay')).not.toBeNull();
      expect(dom().querySelector('.workspace__pages')).toBeNull();
      if (count > 1) {
        expect(imageTabs().map(tab => tab.textContent?.trim())).toEqual(Array.from({ length: count }, (_, i) => 'Image ' + (i + 1)));
        expect(imageTabs()[0].getAttribute('aria-selected')).toBe('true');
      }
    });
  }
  it('switches the existing viewer by file identity with scoped overlays and untouched full-document transcript offsets', () => {
    const snapshot = images(3), component = fixture.componentInstance;
    const transcript = component.views().map(view => ({ text: view.text, annotations: view.annotations.map(a => [a._id, a.startChar, a.endChar]) }));
    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect((overlay.annotations ?? []).map(a => a._id)).toEqual(['mark-file-0']);
    component.selection.pin('mark-file-0', 'image'); fixture.detectChanges();
    imageTabs()[1].click(); fixture.detectChanges();
    expect(component.view()?.fileId).toBe('file-1');
    expect(overlay.fileId).toBe('file-1'); expect(overlay.page).toBe(1); expect(overlay.imageUrl).toBe('blob:file-1');
    expect((overlay.annotations ?? []).map(a => a._id)).toEqual(['mark-file-1']);
    expect(imageTabs()[1].getAttribute('aria-selected')).toBe('true');
    expect((overlay.annotations ?? []).some(a => a._id === component.selection.activeId())).toBeFalse();
    expect(component.views().map(view => ({ text: view.text, annotations: view.annotations.map(a => [a._id, a.startChar, a.endChar]) }))).toEqual(transcript);
    expect(component.snapshot()).toBe(snapshot);
    imageTabs()[0].click(); fixture.detectChanges();
    expect((overlay.annotations ?? []).map(a => a._id)).toEqual(['mark-file-0']);
    expect(fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance).toBe(overlay);
  });
  it('keeps tabs for an uploaded file without OCR and never substitutes another file\'s marks', () => {
    images(2); fixture.componentRef.setInput('fileIds', ['file-0', 'file-1', 'missing-ocr']); fixture.detectChanges();
    imageTabs()[2].click(); fixture.detectChanges();
    expect(imageTabs().length).toBe(3);
    expect(fixture.componentInstance.view()?.fileId).toBe('missing-ocr');
    expect(fixture.componentInstance.overlayAnnotations()).toEqual([]);
    fixture.componentRef.setInput('activeFileId', 'unknown'); fixture.detectChanges();
    expect(fixture.componentInstance.overlayAnnotations()).toEqual([]);
  });
  it('renders only the active canonical transcript, retaining the full snapshot and repeated-word correction identities', () => {
    const original = images(3), component = fixture.componentInstance;
    const snapshot = { ...original, pages: original.pages.map((page, index) => ({ ...page, text: 'word page ' + (index + 1), endChar: page.startChar + 11,
      words: [{ ...page.words[0], text: 'word' }, { id: 'page', text: 'page', separatorBefore: ' ' }, { id: 'number', text: String(index + 1), separatorBefore: ' ' }] })) };
    fixture.componentRef.setInput('snapshot', snapshot); fixture.detectChanges();
    const visible = () => dom().querySelector('[data-sync-transcript]')!;
    for (const index of [0, 1, 2, 1, 0]) {
      imageTabs()[index].click(); fixture.detectChanges();
      expect(dom().querySelectorAll('[data-source-content]').length).toBe(1);
      expect(visible().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('file-' + index);
      expect(visible().textContent?.replace(/\s+/g, ' ').trim()).toBe('word page ' + (index + 1));
      const transcript = fixture.debugElement.query(By.directive(TokenizedTranscript)).componentInstance as TokenizedTranscript;
      expect(transcript.annotations?.map(annotation => annotation._id)).toEqual(['mark-file-' + index]);
      expect(component.snapshot()).toBe(snapshot); expect(component.views().length).toBe(3);
    }
  });
  it('uses an unavailable state for an unmapped or unknown page without borrowing another transcript', () => {
    images(2); fixture.componentRef.setInput('fileIds', ['file-0', 'file-1', 'without-ocr']); fixture.detectChanges();
    imageTabs()[2].click(); fixture.detectChanges();
    expect(dom().querySelector('[data-transcript-unavailable]')).not.toBeNull();
    expect(dom().querySelector('[data-sync-transcript]')?.textContent).not.toContain('word');
    fixture.componentRef.setInput('activeFileId', 'not-a-source'); fixture.detectChanges();
    expect(dom().querySelector('[data-transcript-unavailable]')).not.toBeNull();
    expect(dom().querySelector('[data-source-content]')).toBeNull();
    const snapshot = fixture.componentInstance.snapshot();
    fixture.componentRef.setInput('snapshot', { ...snapshot, pages: snapshot.pages.map(page => ({ ...page, text: '', words: [] })) });
    fixture.componentRef.setInput('activeFileId', 'file-0'); fixture.detectChanges();
    expect(dom().querySelector('[data-transcript-unavailable]')).not.toBeNull();
    expect(dom().querySelector('[data-sync-transcript]')).toBeNull();
  });
  it('navigates a selected list correction to its own image and transcript even without image geometry', async () => {
    images(2); const component = fixture.componentInstance;
    const positions = new Map(component.positions());
    positions.set('mark-file-1', { fileId: 'file-1', page: 1, image: 'none', transcriptWordIds: ['w0'] });
    fixture.componentRef.setInput('positions', positions); fixture.detectChanges();
    component.onPointer({ ids: ['mark-file-1'], kind: 'activate' }, 'list'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(component.view()?.fileId).toBe('file-1');
    expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('file-1');
    expect(component.selection.pinnedId()).toBe('mark-file-1');
    expect(component.overlayAnnotations()).toEqual([]);
    expect(dom().querySelector('.workspace__mark-menu')).toBeNull();
  });
  it('supports roving keyboard focus and quick consecutive tab changes through the original navigation output', () => {
    images(3); fixture.componentInstance.narrowTab.set('image'); fixture.detectChanges();
    imageTabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })); fixture.detectChanges();
    expect(fixture.componentInstance.view()?.fileId).toBe('file-2');
    expect(document.activeElement).toBe(imageTabs()[2]);
    expect(imageTabs()[2].tabIndex).toBe(0);
    imageTabs()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.view()?.fileId).toBe('file-0');
    imageTabs()[1].click(); imageTabs()[2].click(); imageTabs()[0].click(); fixture.detectChanges();
    expect(fixture.componentInstance.displayUrl()).toBe('blob:file-0');
    expect(fixture.componentInstance.overlayAnnotations().map(a => a._id)).toEqual(['mark-file-0']);
  });
  it('uses the established PDF page selector and shared page-image loader without image tabs', async () => {
    const snapshot = images(2);
    fixture.componentRef.setInput('snapshot', { ...snapshot, pages: snapshot.pages.map((page, i) => ({ ...page, pageImageUrl: 'https://example.test/page-' + i + '.png' })) });
    fixture.componentRef.setInput('isPdf', true);
    const store = { acquire: jasmine.createSpy().and.callFake((source: string) => Promise.resolve('blob:' + source)), release: jasmine.createSpy() };
    fixture.componentRef.setInput('imageStore', store); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(imageTabs()).toEqual([]);
    expect(dom().querySelector('[data-sync-page]')?.textContent).toContain('Page 1 of 2');
    dom().querySelectorAll<HTMLButtonElement>('.workspace__pages button')[1].click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.viewIndex()).toBe(1);
    expect(dom().querySelectorAll('[data-source-content]').length).toBe(1);
    expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('file-1');
    expect(store.acquire).toHaveBeenCalledWith('https://example.test/page-1.png');
  });
  it('keeps canonical file/page ordering when the existing PDF page abstraction contains multiple files', async () => {
    const original = images(2);
    const page = (fileId: string, pageNumber: number, text: string, startChar: number) => ({ fileId, pageNumber, text, startChar, endChar: startChar + text.length,
      pageImageUrl: 'https://example.test/' + fileId + '-' + pageNumber + '.png', words: text.split(' ').map((text, index) => ({ id: 'w' + index, text, separatorBefore: index ? ' ' : '' })) });
    const pages = [page('file-1', 1, 'Second file first page.', 80), page('file-0', 2, 'First file second page.', 40), page('file-0', 1, 'First file first page.', 0)];
    fixture.componentRef.setInput('snapshot', { ...original, pages, corrections: [], effective: [] }); fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('positions', new Map()); fixture.componentRef.setInput('isPdf', true); fixture.detectChanges();
    expect(fixture.componentInstance.views().map(view => view.key)).toEqual(['file-0:1', 'file-0:2', 'file-1:1']);
    for (const [index, text] of ['First file first page.', 'First file second page.', 'Second file first page.'].entries()) {
      fixture.componentInstance.goTo(index); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      expect(dom().querySelectorAll('[data-source-content]').length).toBe(1);
      expect(dom().querySelector('[data-sync-transcript]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(text);
      expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe(fixture.componentInstance.view()?.fileId ?? '');
    }
    expect(fixture.componentInstance.snapshot().pages).toBe(pages);
  });
  it('retains source geometry and existing loading/failure presentation on the chosen file', () => {
    const snapshot = images(2);
    const geometry = { version: 1 as const, fileId: 'file-1', pageNumber: 1, width: 1600, height: 1200, orientation: 6 as const, coordinateSpace: 'encoded-image' as const };
    fixture.componentRef.setInput('snapshot', { ...snapshot, pages: snapshot.pages.map((page, index) => index === 1 ? { ...page, sourceGeometry: geometry } : page) });
    fixture.detectChanges(); imageTabs()[1].click(); fixture.detectChanges();
    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect(overlay.sourceGeometry).toBe(geometry);
    fixture.componentRef.setInput('imageUrl', null); fixture.componentRef.setInput('imageLoading', true); fixture.detectChanges();
    expect(overlay.sourceLoading).toBeTrue(); expect((overlay.annotations ?? []).map(a => a._id)).toEqual(['mark-file-1']);
    fixture.componentRef.setInput('imageLoading', false); fixture.componentRef.setInput('imageFailed', true); fixture.detectChanges();
    expect(overlay.sourceLoadError).toBeTrue(); expect(overlay.imageUrl).toBeNull();
  });
  it('keeps single, two, three and many image layouts within all requested viewport widths', async () => {
    for (const count of [1, 2, 3, 23]) {
      images(count);
      fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="25" y="60" font-size="26">word ? original handwriting fixture</text></svg>'));
      fixture.componentInstance.narrowTab.set('image'); fixture.detectChanges();
      for (const width of [1440, 1024, 768, 375, 320]) {
        const { doc, css } = atWidth(width);
        doc.documentElement.setAttribute('data-qa-image-count', String(count));
        if (count > 1) {
          expect(css('.workspace__image-tabs').overflowX).toBe('auto');
          expect(css('.workspace__image-tabs').flexWrap).toBe('nowrap');
          expect(parseFloat(css('.workspace__image-tabs button').minHeight)).toBeGreaterThanOrEqual(40);
        }
        expect(doc.documentElement.scrollWidth).withContext(count + ' images at ' + width + 'px').toBeLessThanOrEqual(width);
        expect(doc.querySelector('.workspace__mark-menu')).toBeNull();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }
  });
  it('renders equal desktop columns at 1024px with independent scrolling and no horizontal page overflow', () => {
    const { doc, css } = atWidth(1024);
    const image = doc.querySelector('[aria-label="Submission image"]')!.getBoundingClientRect();
    const text = doc.querySelector('[aria-label="Transcript and annotations"]')!.getBoundingClientRect();
    expect(image.right).toBeLessThan(text.left);
    expect(Math.abs(image.width - text.width)).toBeLessThan(2);
    expect(css('[data-sync-image]').overflowY).toBe('auto');
    expect(css('.workspace__column-body').overflowY).toBe('auto');
    expect(Math.abs(image.top - text.top)).toBeLessThan(1);
    expect(Math.abs(image.bottom - text.bottom)).toBeLessThan(1);
    expect(css('.workspace__column--image').position).toBe('sticky');
    expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(1024);
    expect(css('[role="tablist"]').display).toBe('none');
  });
  it('defaults to Text below 1024px; switching tabs keeps the selected mark and supports arrow keys', () => {
    const selection = TestBed.inject(CorrectionSelection); selection.pin('c1', 'image'); fixture.detectChanges();
    let view = atWidth(1023);
    expect(view.css('[role="tablist"]').display).toBe('flex');
    expect(view.css('.workspace__column--image').display).toBe('none');
    dom().querySelector<HTMLButtonElement>('[data-tab="image"]')!.click(); fixture.detectChanges();
    view = atWidth(600);
    expect(view.css('.workspace__column--image').display).not.toBe('none');
    expect(view.css('.workspace__column--right').display).toBe('none');
    expect(selection.pinnedId()).toBe('c1');
    dom().querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); fixture.detectChanges();
    expect(fixture.componentInstance.narrowTab()).toBe('text');
    expect(selection.pinnedId()).toBe('c1');
  });
  it('text alone has no image column or view switch', () => {
    fixture.componentRef.setInput('imageUrl', null); fixture.detectChanges();
    expect(dom().querySelector('[aria-label="Submission image"]')).toBeNull();
    expect(dom().querySelector('[data-sync-transcript]')).not.toBeNull();
    expect(dom().querySelector('[role="tablist"], .workspace__desktop-switch')).toBeNull();
  });
  it('image alone uses full width without an empty transcript', () => {
    fixture.componentRef.setInput('snapshot', { pages: [], effective: [] }); fixture.detectChanges();
    const { doc } = atWidth(1200);
    expect(dom().querySelector('[data-sync-transcript]')).toBeNull();
    expect(dom().querySelector('[role="tablist"]')).toBeNull();
    expect(doc.querySelector('[aria-label="Submission image"]')!.getBoundingClientRect().width).toBeGreaterThan(1100);
  });
  it('desktop toggle is remembered in memory when reopened', () => {
    dom().querySelectorAll<HTMLButtonElement>('.workspace__desktop-switch button')[2].click(); fixture.detectChanges();
    expect(atWidth(1200).css('.workspace__column--image').display).toBe('none');
    fixture.destroy();
    expect(TestBed.inject(AnnotationLayoutSession).desktop()).toBe('text');
  });
  it('Escape clears selection and the removed Selected action bar is absent', () => {
    const selection = TestBed.inject(CorrectionSelection); selection.pin('c1', 'image'); fixture.detectChanges();
    dom().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(selection.activeId()).toBeNull();
    expect(dom().querySelector('[data-sync-status], [data-sync-clear]')).toBeNull();
  });
});
