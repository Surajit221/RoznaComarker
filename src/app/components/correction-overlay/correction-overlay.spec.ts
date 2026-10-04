import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { CorrectionOverlay } from './correction-overlay';
import { DeviceService } from '../../services/device.service';

describe('CorrectionOverlay media loading', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  let component: CorrectionOverlay;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay);
    component = fixture.componentInstance;
  });

  function renderMarkers(annotations: FeedbackAnnotation[]): HTMLButtonElement[] {
    component.imageUrl = 'blob:test-image';
    component.annotations = annotations;
    component.ngOnChanges({
      imageUrl: new SimpleChange(null, component.imageUrl, true),
      annotations: new SimpleChange(null, component.annotations, true)
    });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1600, configurable: true });
    component.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    return Array.from(fixture.nativeElement.querySelectorAll('.correction-overlay__marker'));
  }

  function componentStyleRules(): Array<CSSStyleRule | CSSMediaRule> {
    return Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).filter((rule) =>
          rule instanceof CSSStyleRule || rule instanceof CSSMediaRule) as Array<CSSStyleRule | CSSMediaRule>;
      } catch {
        return [];
      }
    });
  }

  it('keeps the skeleton visible until image decoding completes', () => {
    component.imageUrl = 'blob:test-image';
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true) });
    fixture.detectChanges();

    expect(component.mediaState).toBe('decoding');
    expect(fixture.nativeElement.querySelector('.document-skeleton__page')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.document-skeleton .skeleton-line').length).toBe(12);
  });

  it('moves to loaded only after a valid image load event', () => {
    component.imageUrl = 'blob:test-image';
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true) });
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    Object.defineProperty(image, 'naturalWidth', { value: 1200 });
    Object.defineProperty(image, 'naturalHeight', { value: 1600 });

    component.onImageLoad({ target: image } as unknown as Event);

    expect(component.mediaState).toBe('loaded');
  });

  it('contains image errors and offers Retry', () => {
    component.imageUrl = 'blob:test-image';
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true) });
    component.onImageError();
    fixture.detectChanges();

    expect(component.mediaState).toBe('error');
    expect(fixture.nativeElement.querySelector('.correction-overlay__media-error button')).toBeTruthy();
  });

  it('shows parent-owned authenticated loading and delegates retry without a raw image URL', () => {
    const retry = jasmine.createSpy('retry');
    component.retryRequested.subscribe(retry);
    component.imageUrl = null;
    component.sourceLoading = true;
    component.ngOnChanges({
      imageUrl: new SimpleChange(null, null, true),
      sourceLoading: new SimpleChange(false, true, true)
    });
    fixture.detectChanges();

    expect(component.displayImageUrl).toBeNull();
    expect(component.mediaState).toBe('fetching');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.document-skeleton__page')).toBeTruthy();

    component.sourceLoading = false;
    component.sourceLoadError = true;
    component.ngOnChanges({
      sourceLoading: new SimpleChange(true, false, false),
      sourceLoadError: new SimpleChange(false, true, false)
    });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.correction-overlay__media-error button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('does not expose correction markers before image dimensions are ready', () => {
    component.imageUrl = 'blob:test-image';
    component.annotations = [{ _id: 'a', symbol: 'GR', page: 1, bboxList: [{ x: 1, y: 1, w: 1, h: 1 }] }] as unknown as FeedbackAnnotation[];
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true), annotations: new SimpleChange(null, component.annotations, true) });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.correction-overlay__marker')).toBeNull();
  });

  it('uses content-sized badges and a smaller shared compact marker', fakeAsync(() => {
    fixture.detectChanges();
    const rules = componentStyleRules();
    const desktop = rules.filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText.includes('.correction-overlay__marker')
        && rule.style.width.includes('--badge-width'));
    expect(desktop?.style.borderRadius).toBe('999px');
    renderMarkers([{ _id: 'sizing', submissionId: 'test', source: 'AI', editable: false, symbol: 'T',
      bboxList: [{ x: 20, y: 20, w: 8, h: 2 }] }]);
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    try {
      for (const [viewport, height] of [[1440, 28], [1024, 26], [768, 24], [430, 20], [390, 19], [375, 19]]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport });
        component.onViewportChange(); tick(32); fixture.detectChanges();
        const button = fixture.nativeElement.querySelector('.correction-overlay__marker') as HTMLButtonElement;
        expect(button.getBoundingClientRect().height).toBe(height);
        if (viewport <= 480) {
          const style = getComputedStyle(button);
          expect(parseFloat(style.fontSize)).toBe(viewport <= 390 ? 7.5 : 8);
          expect(parseFloat(style.paddingLeft)).toBe(3.5);
        }
        if (viewport <= 768) expect(parseFloat(getComputedStyle(button, '::before').height)).toBeGreaterThanOrEqual(39.9);
      }
    } finally {
      if (descriptor) Object.defineProperty(window, 'innerWidth', descriptor);
      component.onViewportChange(); tick(32);
    }
  }));

  it('groups nearby compact symbols and exposes each canonical correction', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(true);
    const buttons = renderMarkers([
      { _id: 'nearby-1', symbol: 'REP', group: 'Repetition', color: '#287a55', page: 1,
        bboxList: [{ x: 20, y: 20, w: 8, h: 2 }] },
      { _id: 'nearby-2', symbol: 'P', group: 'Punctuation', color: '#946b00', page: 1,
        bboxList: [{ x: 21, y: 20, w: 8, h: 2 }] }
    ] as FeedbackAnnotation[]);

    expect(buttons).toHaveSize(1);
    expect(buttons[0].textContent?.trim()).toBe('2 Issues');
    const groupLeft = parseFloat(buttons[0].style.getPropertyValue('--marker-left'));
    expect(groupLeft).toBeGreaterThan(27);
    expect(groupLeft).toBeLessThan(30);
    expect(parseFloat(buttons[0].style.getPropertyValue('--marker-top'))).toBeLessThan(20);
    expect(getComputedStyle(buttons[0]).borderRadius).toBe('999px');

    buttons[0].click();
    fixture.detectChanges();
    const entries = fixture.nativeElement.querySelectorAll('.correction-overlay__entries button');
    expect(entries.length).toBe(2);
    entries[1].click();
    fixture.detectChanges();
    expect(component.selectedId).toBe('nearby-2');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('places grouped underlines and badges inside the actual image stage', () => {
    component.ocrWords = [
      { id: 'w1', text: 'about', bbox: { x: 10, y: 20, w: 7, h: 3 } },
      { id: 'w2', text: 'her', bbox: { x: 18, y: 20, w: 7, h: 3 } }
    ];
    const [badge] = renderMarkers([{ _id: 'group', symbol: 'P', wordIds: ['w1', 'w2'],
      bboxList: [{ x: 10, y: 20, w: 7, h: 3 }, { x: 18, y: 20, w: 7, h: 3 }] }] as FeedbackAnnotation[]);
    const stage = fixture.nativeElement.querySelector('.correction-overlay__image-stage') as HTMLElement;
    const lines = stage.querySelectorAll('.correction-overlay__underline');
    expect(stage.querySelector('img')).toBeTruthy();
    expect(lines.length).toBe(1);
    expect(stage.contains(badge)).toBeTrue();
    expect(parseFloat((lines[0] as HTMLElement).style.width)).toBeGreaterThan(14);
  });

  it('keeps right-edge grouped badges inside the image', () => {
    const buttons = renderMarkers([
      { _id: 'right-1', symbol: 'P', page: 1, bboxList: [{ x: 96, y: 1, w: 3, h: 2 }] },
      { _id: 'right-2', symbol: 'CAP', page: 1, bboxList: [{ x: 96, y: 1, w: 3, h: 2 }] }
    ] as FeedbackAnnotation[]);
    const stage = fixture.nativeElement.querySelector('.correction-overlay__image-stage') as HTMLElement;
    stage.style.width = '400px';
    stage.style.height = '500px';
    fixture.detectChanges();
    const stageRect = stage.getBoundingClientRect();
    const first = buttons[0].getBoundingClientRect();
    expect(first.right).toBeLessThanOrEqual(stageRect.right + 1);
    expect(first.top).toBeGreaterThanOrEqual(stageRect.top - 1);
    expect(component.markers).toHaveSize(1);
    expect(component.markers[0].annotations).toHaveSize(2);
  });

  it('opens and closes correction details by tap in compact view', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(true);
    fixture.detectChanges();
    const target = document.createElement('button');
    const marker = {
      annotation: { _id: 'touch-correction', symbol: 'GR', category: 'GRAMMAR' },
      code: 'GR', label: 'Grammar correction', left: 10, top: 10, offsetX: 0, offsetY: 0,
      textColor: '#ffffff'
    } as any;
    const event = {
      currentTarget: target,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation')
    } as unknown as MouseEvent;

    component.onMarkerClick(marker, event);
    fixture.detectChanges();
    expect(component.activeMarker).toBe(marker);
    expect(component.isPinned).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();

    component.closeFromControl(event);
    fixture.detectChanges();
    expect(component.activeMarker).toBeNull();
  });

  it('renders the real tooltip visibly on the first marker hover and keeps it pinned on click', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
    const [marker] = renderMarkers([{ _id: 'test-agr', symbol: 'AGR', group: 'Subject-Verb Agreement',
      message: 'Plural subject requires plural verb form.', quotedText: 'Students sometimes spends',
      suggestedText: 'Students sometimes spend', page: 1,
      bboxList: [{ x: 20, y: 20, w: 12, h: 3 }] }] as FeedbackAnnotation[]);

    marker.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    fixture.detectChanges();
    const tooltip = fixture.nativeElement.querySelector('.correction-overlay__tooltip') as HTMLElement;
    expect(component.activeMarker?.annotation._id).toBe('test-agr');
    expect(tooltip.textContent).toContain('Plural subject requires plural verb form.');
    expect(tooltip.textContent).toContain('Students sometimes spend');
    expect(component.tooltipStyle['visibility']).toBe('visible');
    expect(component.tooltipStyle['left']).not.toBe('-10000px');

    marker.click();
    fixture.detectChanges();
    expect(component.isPinned).toBeTrue();
    expect(component.tooltipStyle['visibility']).toBe('visible');
  });

  it('renders the mobile dialog and backdrop on the first real marker tap', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(true);
    const [marker] = renderMarkers([{ _id: 'test-mobile', symbol: 'AGR', group: 'Agreement',
      message: 'Use plural agreement.', suggestedText: 'Students spend', page: 1,
      bboxList: [{ x: 20, y: 20, w: 12, h: 3 }] }] as FeedbackAnnotation[]);

    marker.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('.correction-overlay__tooltip[role="dialog"]') as HTMLElement;
    expect(component.activeMarker?.annotation._id).toBe('test-mobile');
    expect(dialog).toBeTruthy();
    expect(component.tooltipStyle['visibility']).toBe('visible');
    expect(dialog.textContent).toContain('Use plural agreement.');
    expect(fixture.nativeElement.querySelector('.correction-overlay__backdrop')).toBeTruthy();
  });

  it('preserves an open correction across equivalent annotation input churn and closes when removed', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
    const annotation = { _id: 'stable-agr', symbol: 'AGR', group: 'Agreement', message: 'Current detail',
      suggestedText: 'Correct form', page: 1, bboxList: [{ x: 20, y: 20, w: 12, h: 3 }] } as any;
    const [marker] = renderMarkers([annotation]);
    marker.click();
    fixture.detectChanges();
    expect(component.activeMarker?.annotation._id).toBe('stable-agr');

    component.annotations = [{ ...annotation }];
    component.ngOnChanges({ annotations: new SimpleChange([annotation], component.annotations, false) });
    fixture.detectChanges();
    expect(component.activeMarker?.annotation._id).toBe('stable-agr');
    expect(component.tooltipStyle['visibility']).toBe('visible');

    component.annotations = [];
    component.ngOnChanges({ annotations: new SimpleChange([annotation], [], false) });
    fixture.detectChanges();
    expect(component.activeMarker).toBeNull();
  });

  it('selects each grouped correction, emphasizes its strokes, and leaves other corrections visible', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
    component.ocrWords = [
      { id: 'same', text: 'word', bbox: { x: 15, y: 20, w: 8, h: 3 } },
      { id: 'far', text: 'other', bbox: { x: 70, y: 60, w: 8, h: 3 } }
    ];
    const annotations = ['SP', 'WC', 'AGR'].map((symbol, i) => ({ _id: `c${i}`, symbol,
      wordIds: ['same'], message: `Message ${i}`, suggestedText: `Suggestion ${i}`, page: 1 }));
    const buttons = renderMarkers([...annotations, { _id: 'far', symbol: 'SP', wordIds: ['far'], page: 1 }] as FeedbackAnnotation[]);
    const geometry = component.underlineSegments;
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    const entries = fixture.nativeElement.querySelectorAll('.correction-overlay__entries button');
    expect(entries.length).toBe(3);
    entries[2].click();
    fixture.detectChanges();
    expect(component.selectedId).toBe('c2');
    expect(component.explanation).toBe('Message 2');
    expect(component.suggestion).toBe('Suggestion 2');
    expect(component.underlineSegments).toBe(geometry);
    expect(fixture.nativeElement.querySelectorAll('.correction-overlay__underline.is-selected').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.correction-overlay__underline').length).toBe(2);
    component.closeFromControl();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.has-selection')).toBeNull();
  });

  it('keeps a hover preview open while the pointer enters its grouped details', fakeAsync(() => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
    const [button] = renderMarkers([{ _id: 'c', symbol: 'SP', page: 1,
      bboxList: [{ x: 20, y: 20, w: 8, h: 3 }] }] as FeedbackAnnotation[]);
    button.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    button.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    component.cancelHoverClose();
    tick(250);
    expect(component.activeMarker).not.toBeNull();
    component.closeFromControl();
  }));

  it('does not let a previous marker blur close a newly pinned correction', fakeAsync(() => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
    const buttons = renderMarkers([
      { _id: 'first', symbol: 'SP', bboxList: [{ x: 10, y: 20, w: 8, h: 3 }] },
      { _id: 'second', symbol: 'AGR', bboxList: [{ x: 70, y: 60, w: 8, h: 3 }] }
    ] as FeedbackAnnotation[]);
    buttons[0].focus();
    component.onMarkerBlur();
    buttons[1].click();
    tick(32);
    expect(component.selectedId).toBe('second');
    expect(component.isPinned).toBeTrue();
    component.closeFromControl();
  }));

  it('includes body padding in mobile scroll-lock width and restores the original inline styles', () => {
    spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(true);
    const previous = document.body.style.cssText;
    document.body.style.padding = '16px';
    const original = document.body.style.cssText;
    try {
      const [button] = renderMarkers([{ _id: 'c', symbol: 'SP',
        bboxList: [{ x: 20, y: 20, w: 8, h: 3 }] }] as FeedbackAnnotation[]);
      button.click();
      expect(document.body.style.boxSizing).toBe('border-box');
      component.closeFromControl();
      expect(document.body.style.cssText).toBe(original);
    } finally { document.body.style.cssText = previous; }
  });

  describe('correction interactions', () => {
    const marker = {
      annotation: {
        _id: 'interaction-correction',
        symbol: 'GR',
        group: 'Grammar',
        message: 'Use the correct tense.',
        suggestedText: 'She went home.'
      },
      code: 'GR',
      label: 'Grammar correction',
      left: 10,
      top: 10,
      offsetX: 0,
      offsetY: 0,
      textColor: '#ffffff'
    } as any;

    function mouseEvent(target: HTMLElement): MouseEvent {
      return {
        currentTarget: target,
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation')
      } as unknown as MouseEvent;
    }

    function pointerEvent(target: HTMLElement): PointerEvent {
      return {
        currentTarget: target,
        target,
        pointerType: 'mouse',
        preventDefault: jasmine.createSpy('preventDefault'),
        stopPropagation: jasmine.createSpy('stopPropagation')
      } as unknown as PointerEvent;
    }

    it('does not open from focus in compact view', () => {
      component.isMobile = true;
      const target = document.createElement('button');

      component.onMarkerFocus(marker, { currentTarget: target } as unknown as FocusEvent);

      expect(component.activeMarker).toBeNull();
    });

    it('opens on the first mobile click and stays open on a second tap of the same marker', () => {
      component.isMobile = true;
      const target = document.createElement('button');

      component.onMarkerClick(marker, mouseEvent(target));
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();

      component.onMarkerClick(marker, mouseEvent(target));
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();
    });

    it('closes from the X control without focusing the marker on mobile', () => {
      component.isMobile = true;
      const target = document.createElement('button');
      spyOn(target, 'focus');
      component.onMarkerClick(marker, mouseEvent(target));
      fixture.detectChanges();

      const close = fixture.nativeElement.querySelector('.correction-overlay__close') as HTMLButtonElement;
      close.click();
      fixture.detectChanges();

      expect(component.activeMarker).toBeNull();
      expect(target.focus).not.toHaveBeenCalled();
    });

    it('closes from the backdrop on mobile', () => {
      component.isMobile = true;
      const target = document.createElement('button');
      component.onMarkerClick(marker, mouseEvent(target));
      fixture.detectChanges();

      const backdrop = fixture.nativeElement.querySelector('.correction-overlay__backdrop') as HTMLButtonElement;
      backdrop.click();
      fixture.detectChanges();

      expect(component.activeMarker).toBeNull();
    });

    it('allows pointer travel into the detail card before closing an unpinned preview', fakeAsync(() => {
      spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
      const target = document.createElement('button');
      const event = pointerEvent(target);

      component.onMarkerEnter(marker, event);
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeFalse();

      component.onMarkerLeave(marker, event);
      expect(component.activeMarker).toBe(marker);
      tick(221);
      expect(component.activeMarker).toBeNull();
    }));

    it('pins on the first desktop click', () => {
      component.isMobile = false;
      const target = document.createElement('button');

      component.onMarkerClick(marker, mouseEvent(target));

      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();
    });

    it('handles pointer-induced focus and click as one opening interaction', () => {
      spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
      const target = document.createElement('button');
      const openTooltip = spyOn<any>(component, 'openTooltip').and.callThrough();

      component.onMarkerFocus(marker, { currentTarget: target } as unknown as FocusEvent);
      component.onMarkerClick(marker, mouseEvent(target));

      expect(openTooltip).toHaveBeenCalledTimes(1);
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();
    });

    it('opens from desktop keyboard focus', () => {
      spyOn(TestBed.inject(DeviceService), 'isMobile').and.returnValue(false);
      const target = document.createElement('button');

      component.onMarkerFocus(marker, { currentTarget: target } as unknown as FocusEvent);

      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeFalse();
    });

    it('closes with Escape', () => {
      component.isMobile = true;
      const target = document.createElement('button');
      component.onMarkerClick(marker, mouseEvent(target));

      component.onEscape();

      expect(component.activeMarker).toBeNull();
    });
  });
});
