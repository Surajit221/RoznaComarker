import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { FlashcardApiService } from '../../../api/flashcard-api.service';
import { FlashcardDetail } from './flashcard-detail';

describe('FlashcardDetail workspace', () => {
  let fixture: ComponentFixture<FlashcardDetail>;
  let component: FlashcardDetail;
  const set = {
    _id: 'set-1', title: 'Science', description: 'Long-form learning set',
    cards: [
      { _id: 'card-a', front: 'A very long front that remains fully rendered', back: 'First answer', order: 0 },
      { _id: 'card-b', front: 'Second question', back: 'A very long back that remains fully rendered', order: 1 }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlashcardDetail],
      providers: [
        { provide: FlashcardApiService, useValue: { getSetById: () => of(set) } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: ActivatedRoute, useValue: {
          snapshot: {
            paramMap: { get: () => 'set-1' },
            queryParamMap: { get: () => null }
          }
        } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(FlashcardDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    try { fixture.destroy(); } catch { /* no-op in browsers without speech synthesis */ }
  });

  it('preserves front/back content while flipping and reports current progress', () => {
    expect(component.currentCard?.front).toContain('very long front');
    expect(component.isFlipped).toBeFalse();
    component.flip();
    expect(component.isFlipped).toBeTrue();
    expect(component.currentCard?.back).toBe('First answer');
    expect(fixture.nativeElement.textContent).toContain('Card 1 of 2');
  });

  it('keeps navigation on the correct card and resets the flipped state', () => {
    component.flip();
    component.next();
    expect(component.currentIndex).toBe(1);
    expect(component.currentCard?._id).toBe('card-b');
    expect(component.isFlipped).toBeFalse();
    component.prev();
    expect(component.currentCard?._id).toBe('card-a');
  });

  it('renders disabled boundaries and accessible flip/icon controls', () => {
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.find((button) => button.textContent?.includes('Previous'))?.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.card-stage').getAttribute('role')).toBe('button');
    expect(fixture.nativeElement.querySelector('[aria-label="Edit flashcard set"]')).toBeTruthy();
    component.next();
    fixture.detectChanges();
    expect(buttons.find((button) => button.textContent?.includes('Next'))?.disabled).toBeTrue();
  });
});
