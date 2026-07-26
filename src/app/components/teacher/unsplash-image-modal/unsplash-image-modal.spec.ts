import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UnsplashService } from '../../../services/unsplash.service';
import { UnsplashImageModal } from './unsplash-image-modal';

describe('UnsplashImageModal accessibility and duplicate-selection safety', () => {
  let fixture: ComponentFixture<UnsplashImageModal>;
  let component: UnsplashImageModal;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnsplashImageModal],
      providers: [{ provide: UnsplashService, useValue: {
        prewarm: jasmine.createSpy('prewarm'),
        searchImages: () => of({ data: [] })
      } }]
    }).compileComponents();
    fixture = TestBed.createComponent(UnsplashImageModal);
    component = fixture.componentInstance;
  });

  it('emits a selected image only once even on a double click', () => {
    const selected = jasmine.createSpy('selected');
    component.imageSelected.subscribe(selected);
    component.show = true;
    component.ngOnChanges();
    component.selectImage('image.jpg');
    component.selectImage('image.jpg');
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith('image.jpg');
  });

  it('closes with Escape and restores background scrolling', () => {
    document.body.style.overflow = 'auto';
    component.show = true;
    component.ngOnChanges();
    expect(document.body.style.overflow).toBe('hidden');
    component.onEscape();
    expect(component.show).toBeFalse();
    expect(document.body.style.overflow).toBe('auto');
  });
});
