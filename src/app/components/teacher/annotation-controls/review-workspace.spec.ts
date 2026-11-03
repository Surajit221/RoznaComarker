import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import { DeviceService } from '../../../services/device.service';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import { SharedPageImages } from '../../submission-page-review/shared-page-images';
import { CorrectionSelection } from './correction-selection';
import { applySyncPointer, scrollPanelTo } from './review-workspace';

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
