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
});
