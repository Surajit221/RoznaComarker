import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudentFlashcardPlayer } from './student-flashcard-player';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('StudentFlashcardPlayer', () => {
  let component: StudentFlashcardPlayer;
  let fixture: ComponentFixture<StudentFlashcardPlayer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentFlashcardPlayer],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture   = TestBed.createComponent(StudentFlashcardPlayer);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show loading skeleton on init', () => {
    expect(component.isLoading).toBeTrue();
    expect(component.hasError).toBeFalse();
  });

  it('goBackToClass() navigates to /student/my-classes when classId is empty', () => {
    const routerSpy = spyOn((component as any).router, 'navigate');
    component.classId = '';
    component.goBackToClass();
    expect(routerSpy).toHaveBeenCalledWith(['/student/my-classes']);
  });

  it('goBackToClass() navigates to /student/classroom/:id when classId is set', () => {
    const routerSpy = spyOn((component as any).router, 'navigate');
    component.classId = 'cls123';
    component.goBackToClass();
    expect(routerSpy).toHaveBeenCalledWith(['/student/classroom', 'cls123']);
  });

  it('markKnown() records the current card as known', () => {
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.isFlipped = true;
    spyOn<any>(component, 'advance');
    component.markKnown();
    expect(component.knownCount).toBe(1);
  });

  it('markLearning() records the current card for review', () => {
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.isFlipped = true;
    spyOn<any>(component, 'advance');
    component.markLearning();
    expect(component.learningCount).toBe(1);
  });
});
