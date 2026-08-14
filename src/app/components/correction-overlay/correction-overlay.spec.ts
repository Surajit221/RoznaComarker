import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { CorrectionOverlay } from './correction-overlay';

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

  it('keeps the desktop marker dimensions unchanged and defines a smaller shared compact marker', () => {
    fixture.detectChanges();
    const rules = componentStyleRules();
    const desktop = rules.filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText.includes('.correction-overlay__marker')
        && rule.style.width === '28px');
    const compactMedia = rules.filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
      .find((rule) => rule.conditionText.includes('1024px'));
    const compact = Array.from(compactMedia?.cssRules || [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText.includes('.correction-overlay__marker')
        && !rule.selectorText.includes('::before') && rule.style.width === '26px');
    const hitArea = Array.from(compactMedia?.cssRules || [])
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .find((rule) => rule.selectorText.includes('.correction-overlay__marker')
        && rule.style.inset === '-6px');

    expect(desktop?.style.height).toBe('28px');
    expect(desktop?.style.borderRadius).toBe('999px');
    expect(compact?.style.height).toBe('26px');
    expect(compact?.style.fontSize).toBe('9px');
    expect(hitArea?.style.inset).toBe('-6px');
  });

  it('keeps compact symbols circular, anchored, and individually tappable', () => {
    (component as any).device.width.set(390);
    const buttons = renderMarkers([
      { _id: 'nearby-1', symbol: 'REP', group: 'Repetition', color: '#287a55', page: 1,
        bboxList: [{ x: 20, y: 20, w: 8, h: 2 }] },
      { _id: 'nearby-2', symbol: 'P', group: 'Punctuation', color: '#946b00', page: 1,
        bboxList: [{ x: 21, y: 20, w: 8, h: 2 }] }
    ] as FeedbackAnnotation[]);

    expect(buttons).toHaveSize(2);
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['REP', 'P']);
    expect(buttons[0].style.left).toBe('28%');
    expect(buttons[0].style.top).toBe('20.3%');
    expect(getComputedStyle(buttons[0]).borderRadius).toBe('999px');

    buttons[1].click();
    fixture.detectChanges();
    expect(component.activeMarker?.annotation._id).toBe('nearby-2');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('opens and closes correction details by tap in compact view', () => {
    (component as any).device.width.set(390);
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

    it('opens on desktop mouse hover and closes on mouse leave when unpinned', () => {
      component.isMobile = false;
      const target = document.createElement('button');
      const event = pointerEvent(target);

      component.onMarkerEnter(marker, event);
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeFalse();

      component.onMarkerLeave(marker, event);
      expect(component.activeMarker).toBeNull();
    });

    it('pins on the first desktop click', () => {
      component.isMobile = false;
      const target = document.createElement('button');

      component.onMarkerClick(marker, mouseEvent(target));

      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();
    });

    it('handles pointer-induced focus and click as one opening interaction', () => {
      component.isMobile = false;
      const target = document.createElement('button');
      const openTooltip = spyOn<any>(component, 'openTooltip').and.callThrough();

      component.onMarkerPointerDown();
      component.onMarkerFocus(marker, { currentTarget: target } as unknown as FocusEvent);
      component.onMarkerClick(marker, mouseEvent(target));

      expect(openTooltip).toHaveBeenCalledTimes(1);
      expect(component.activeMarker).toBe(marker);
      expect(component.isPinned).toBeTrue();
    });

    it('opens from desktop keyboard focus', () => {
      component.isMobile = false;
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
