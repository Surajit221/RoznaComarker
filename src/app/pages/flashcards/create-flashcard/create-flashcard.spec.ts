import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import type { FlashCard, FlashcardSet } from '../../../models/flashcard-set.model';
import { CreateFlashcard } from './create-flashcard';

describe('CreateFlashcard', () => {
  let fixture: ComponentFixture<CreateFlashcard>;
  let component: CreateFlashcard;
  let api: jasmine.SpyObj<FlashcardApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<FlashcardApiService>('FlashcardApiService', [
      'generateFlashcards', 'createSet'
    ]);
    await TestBed.configureTestingModule({
      imports: [CreateFlashcard],
      providers: [provideRouter([]), { provide: FlashcardApiService, useValue: api }]
    }).compileComponents();
    fixture = TestBed.createComponent(CreateFlashcard);
    component = fixture.componentInstance;
  });

  for (const template of ['qa', 'concept']) {
    it(`generates and persists the ${template} template contract`, () => {
      const cards: FlashCard[] = [{ front: 'Question', back: 'Answer', order: 0 }];
      api.generateFlashcards.and.returnValue(of(cards));
      api.createSet.and.returnValue(of({ _id: 'set-1' } as FlashcardSet));
      spyOn(TestBed.inject(Router), 'navigate');
      component.createForm.patchValue({ content: 'Water cycle', template, cardCount: '5' });

      component.generateFlashcards();

      expect(api.generateFlashcards).toHaveBeenCalledWith(jasmine.objectContaining({
        content: 'Water cycle', template, cardCount: 5
      }));
      expect(api.createSet).toHaveBeenCalledWith(jasmine.objectContaining({
        template, cards: [{ front: 'Question', back: 'Answer', order: 0 }]
      }));
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
        ['/flashcards', 'set-1'], { queryParams: undefined }
      );
    });
  }

  it('blocks duplicate clicks while a generation request is active', () => {
    const pending = new Subject<FlashCard[]>();
    api.generateFlashcards.and.returnValue(pending);
    component.createForm.patchValue({ content: 'Mars', template: 'qa' });

    component.generateFlashcards();
    component.generateFlashcards();

    expect(component.isGenerating).toBeTrue();
    expect(api.generateFlashcards).toHaveBeenCalledTimes(1);
    pending.error({ status: 502, error: { code: 'FLASHCARD_OUTPUT_INVALID' } });
    expect(component.isGenerating).toBeFalse();
    expect(component.modalMessage).toContain('could not produce valid flashcards');
  });

  it('shows a specific connection error without exposing backend details', () => {
    api.generateFlashcards.and.returnValue(throwError(() => ({
      status: 0, error: { message: 'private upstream failure' }
    })));
    component.createForm.patchValue({ content: 'Mars' });

    component.generateFlashcards();

    expect(component.modalTitle).toBe('Connection error');
    expect(component.modalMessage).not.toContain('private upstream');
  });
});
