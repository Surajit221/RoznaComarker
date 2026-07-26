import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { FlashcardEditor } from './flashcard-editor';

describe('FlashcardEditor state safety', () => {
  let fixture: ComponentFixture<FlashcardEditor>;
  let component: FlashcardEditor;
  const updateSet = jasmine.createSpy('updateSet').and.returnValue(of({}));

  beforeEach(async () => {
    updateSet.calls.reset();
    await TestBed.configureTestingModule({
      imports: [FlashcardEditor],
      providers: [
        { provide: FlashcardApiService, useValue: {
          getSetById: () => of({
            _id: 'set-1', title: 'Set', description: '', visibility: 'public',
            cards: [
              { front: 'One', back: 'First', order: 0, frontImage: 'old-one.jpg' },
              { front: 'Two', back: 'Second', order: 1, frontImage: 'old-two.jpg' }
            ]
          }),
          updateSet,
          uploadFlashcardImage: () => of({ imageUrl: '/image.jpg' }),
          generateFlashcards: () => of([{ front: 'Generated title', back: '' }])
        } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: ActivatedRoute, useValue: {
          snapshot: {
            paramMap: { get: () => 'set-1' },
            queryParamMap: { get: () => null }
          }
        } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(FlashcardEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('applies a selected image only to the intended card', () => {
    component.openUnsplashModal(1, 'front');
    component.onUnsplashImageSelected('selected.jpg');
    expect(component.cardsArray.at(0).get('frontImage')?.value).toBe('old-one.jpg');
    expect(component.cardsArray.at(1).get('frontImage')?.value).toBe('selected.jpg');
  });

  it('preserves the previous image when image search is cancelled', () => {
    component.openUnsplashModal(0, 'front');
    component.onUnsplashVisibilityChange(false);
    expect(component.cardsArray.at(0).get('frontImage')?.value).toBe('old-one.jpg');
  });

  it('keeps the existing save payload shape and card order', () => {
    component.saveModalForm.patchValue({ title: 'Updated', visibility: 'private' });
    component.confirmSave();
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith('set-1', jasmine.objectContaining({
      title: 'Updated', visibility: 'private',
      cards: [
        jasmine.objectContaining({ front: 'One', back: 'First', order: 0 }),
        jasmine.objectContaining({ front: 'Two', back: 'Second', order: 1 })
      ]
    }));
  });
});
