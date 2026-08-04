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

  it('does not expose correction markers before image dimensions are ready', () => {
    component.imageUrl = 'blob:test-image';
    component.annotations = [{ _id: 'a', symbol: 'GR', page: 1, bboxList: [{ x: 1, y: 1, w: 1, h: 1 }] }] as unknown as FeedbackAnnotation[];
    component.ngOnChanges({ imageUrl: new SimpleChange(null, component.imageUrl, true), annotations: new SimpleChange(null, component.annotations, true) });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.correction-overlay__marker')).toBeNull();
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
