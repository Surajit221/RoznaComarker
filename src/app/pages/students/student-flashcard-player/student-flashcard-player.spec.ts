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

  it('grade() pushes card to knownCards on "know"', () => {
    component.cards = [{ front: 'Q', back: 'A', order: 0 }];
    component.grade('know');
    expect(component.knownCards.length).toBe(1);
  });

  it('grade() pushes card to learningCards on "learning"', () => {
    component.cards = [{ front: 'Q', back: 'A', order: 0 }];
    component.grade('learning');
    expect(component.learningCards.length).toBe(1);
  });
});
