import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { TokenizedTranscript } from './tokenized-transcript';

describe('TokenizedTranscript canonical separators', () => {
  it('renders only backend separators and never infers line breaks from geometry', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'Parking', bbox: { x: 10, y: 10, w: 10, h: 2 }, separatorBefore: '' },
      { id: '2', text: 'gives', bbox: { x: 10, y: 30, w: 8, h: 2 }, separatorBefore: ' ' },
      { id: '3', text: 'more', bbox: null, separatorBefore: ' ' },
      { id: '4', text: 'in', bbox: null, separatorBefore: ' ' },
      { id: '5', text: 'campus.', bbox: null, separatorBefore: ' ' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    const rendered = component.tokens.map((token) => token.kind === 'word' ? token.word.text : token.value).join('');
    expect(rendered).toBe('Parking gives more in campus.');
    expect(component.tokens.some((token) => token.kind === 'newline')).toBeFalse();
  });

  it('renders a canonical paragraph only when the API supplies two newlines', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'First.', bbox: null, separatorBefore: '' },
      { id: '2', text: 'Second.', bbox: null, separatorBefore: '\n\n' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    const separator = component.tokens.find((token) => token.kind === 'newline');
    expect(separator && separator.kind === 'newline' ? separator.value : '').toBe('\n\n');
  });

  it('renders a physical OCR line separator as a normal space', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'line', bbox: null, separatorBefore: '' },
      { id: '2', text: 'wraps.', bbox: null, separatorBefore: '\n' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    expect(component.tokens.map((token) => token.kind === 'word' ? token.word.text : token.value).join('')).toBe('line wraps.');
    expect(component.tokens.some((token) => token.kind === 'newline')).toBeFalse();
  });

  it('does not insert a space before punctuation', () => {
    const component = new TokenizedTranscript();
    component.ocrWords = [
      { id: '1', text: 'Hello', bbox: null, separatorBefore: '' },
      { id: '2', text: ',', bbox: null, separatorBefore: '' },
      { id: '3', text: 'world', bbox: null, separatorBefore: ' ' },
      { id: '4', text: '!', bbox: null, separatorBefore: '' }
    ];
    component.ngOnChanges({ ocrWords: new SimpleChange(null, component.ocrWords, true) });
    expect(component.tokens.map((token) => token.kind === 'word' ? token.word.text : token.value).join('')).toBe('Hello, world!');
  });
});

describe('TokenizedTranscript tooltip stability', () => {
  let fixture: ComponentFixture<TokenizedTranscript>;
  let component: TokenizedTranscript;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TokenizedTranscript] }).compileComponents();
    fixture = TestBed.createComponent(TokenizedTranscript);
    component = fixture.componentInstance;
    component.ocrWords = [
      { id: '1', text: 'First', bbox: null, separatorBefore: '' },
      { id: '2', text: 'second', bbox: null, separatorBefore: ' ' }
    ];
    component.annotations = [
      { _id: 'a1', submissionId: 's1', wordIds: ['1'], symbol: 'DEV', message: 'Develop this.', source: 'AI', editable: false },
      { _id: 'a2', submissionId: 's1', wordIds: ['2'], symbol: 'COH', message: 'Connect this.', source: 'AI', editable: false }
    ];
    component.ngOnChanges({
      ocrWords: new SimpleChange(null, component.ocrWords, true),
      annotations: new SimpleChange(null, component.annotations, true)
    });
    fixture.detectChanges();
  });

  function prepareGeometry(positioningRect?: DOMRect) {
    const container = fixture.nativeElement.querySelector('.tokenized-transcript') as HTMLElement;
    const words = fixture.nativeElement.querySelectorAll('.correction-highlight') as NodeListOf<HTMLElement>;
    const tooltip = fixture.nativeElement.querySelector('.transcript-tooltip') as HTMLElement;
    spyOn(container, 'getBoundingClientRect').and.returnValue({ left: 10, top: 10, right: 410, bottom: 310,
      width: 400, height: 300, x: 10, y: 10, toJSON: () => ({}) } as DOMRect);
    spyOn(words[0], 'getBoundingClientRect').and.returnValue({ left: 40, top: 80, right: 80, bottom: 100,
      width: 40, height: 20, x: 40, y: 80, toJSON: () => ({}) } as DOMRect);
    spyOn(words[1], 'getBoundingClientRect').and.returnValue({ left: 160, top: 120, right: 210, bottom: 140,
      width: 50, height: 20, x: 160, y: 120, toJSON: () => ({}) } as DOMRect);
    Object.defineProperty(tooltip, 'offsetWidth', { configurable: true, value: 180 });
    Object.defineProperty(tooltip, 'offsetHeight', { configurable: true, value: 70 });
    const positioningParent = document.createElement('div');
    spyOn(positioningParent, 'getBoundingClientRect').and.returnValue(positioningRect || ({ left: 0, top: 0,
      right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    Object.defineProperty(tooltip, 'offsetParent', { configurable: true, get: () => positioningParent });
    return { container, words, tooltip, positioningParent };
  }

  it('converts clamped browser coordinates to the actual positioning parent', fakeAsync(() => {
    const parentRect = { left: 25, top: 35, right: 825, bottom: 635, width: 800, height: 600,
      x: 25, y: 35, toJSON: () => ({}) } as DOMRect;
    const { words, tooltip } = prepareGeometry(parentRect);
    words[0].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    tick(20);
    expect(tooltip.parentElement).toBe(document.body);
    const localLeft = Number.parseFloat(component.tooltipStyle['left']);
    const localTop = Number.parseFloat(component.tooltipStyle['top']);
    const viewportLeft = localLeft + parentRect.left;
    const viewportTop = localTop + parentRect.top;
    expect(localLeft).not.toBe(viewportLeft);
    expect(localTop).not.toBe(viewportTop);
    expect(viewportLeft).toBeGreaterThanOrEqual(18);
    expect(viewportLeft + tooltip.offsetWidth).toBeLessThanOrEqual(402);
    expect(viewportTop).toBeGreaterThanOrEqual(18);
    expect(viewportTop + tooltip.offsetHeight).toBeLessThanOrEqual(302);
  }));

  it('opens and closes without changing scroll position, overflow, or viewport dimensions', fakeAsync(() => {
    const { container, words } = prepareGeometry();
    container.style.overflowY = 'auto';
    let scrollTop = 75;
    Object.defineProperty(container, 'scrollTop', { configurable: true, get: () => scrollTop, set: (value) => { scrollTop = value; } });
    const before = container.getBoundingClientRect();
    words[0].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    tick(20);
    expect(component.tooltipStyle['visibility']).toBe('visible');
    expect(container.scrollTop).toBe(75);
    expect(container.style.overflowY).toBe('auto');
    expect(container.getBoundingClientRect()).toEqual(before);
    words[0].dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    tick(20);
    expect(component.tooltipStyle['display']).toBe('none');
    expect(container.scrollTop).toBe(75);
  }));

  it('updates one overlay between adjacent words and ignores stale animation frames', fakeAsync(() => {
    const { words } = prepareGeometry();
    words[0].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    words[0].dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    words[1].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    tick(20);
    expect(component.activeWordId).toBe('2');
    expect(component.tooltipText).toContain('COH');
    expect(component.tooltipText).not.toContain('DEV');
    expect(component.tooltipStyle['visibility']).toBe('visible');
    expect(document.body.querySelectorAll('.transcript-tooltip').length).toBe(1);
  }));

  it('repositions safely on scroll and resize and closes with Escape', fakeAsync(() => {
    const { container, words } = prepareGeometry();
    words[0].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    tick(20);
    expect(() => container.dispatchEvent(new Event('scroll'))).not.toThrow();
    expect(() => component.onWindowResize()).not.toThrow();
    expect(() => component.onWindowScroll()).not.toThrow();
    tick(20);
    component.onEscape();
    expect(component.activeWordId).toBeNull();
    expect(component.tooltipStyle['display']).toBe('none');
  }));

  it('clamps edge placements without increasing horizontal overflow', fakeAsync(() => {
    const { container, words } = prepareGeometry();
    const beforeWidth = document.documentElement.scrollWidth;
    (words[0].getBoundingClientRect as jasmine.Spy).and.returnValue({ left: 398, top: 292, right: 410,
      bottom: 310, width: 12, height: 18, x: 398, y: 292, toJSON: () => ({}) } as DOMRect);
    words[0].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    tick(20);
    const left = Number.parseFloat(component.tooltipStyle['left']);
    expect(left).toBeGreaterThanOrEqual(18);
    expect(left + 180).toBeLessThanOrEqual(402);
    expect(document.documentElement.scrollWidth).toBe(beforeWidth);
    expect(container.getBoundingClientRect().width).toBe(400);
  }));

  it('preserves pen activation and outside-click closing', fakeAsync(() => {
    const { words } = prepareGeometry();
    words[0].dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', bubbles: true }));
    tick(20);
    expect(component.activeWordId).toBe('1');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }));
    expect(component.activeWordId).toBeNull();
  }));
});
