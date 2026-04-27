import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudentResultsPage } from './student-results-page';
import { provideRouter } from '@angular/router';

describe('StudentResultsPage', () => {
  let component: StudentResultsPage;
  let fixture: ComponentFixture<StudentResultsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentResultsPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture   = TestBed.createComponent(StudentResultsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('formattedTime returns seconds only when < 60s', () => {
    component.timeTaken = 45;
    expect(component.formattedTime).toBe('45s');
  });

  it('formattedTime returns m+s format when >= 60s', () => {
    component.timeTaken = 125;
    expect(component.formattedTime).toBe('2m 5s');
  });

  it('goToClasses() navigates to /student/my-classes when classId empty', () => {
    const spy = spyOn((component as any).router, 'navigate');
    component.classId = '';
    component.goToClasses();
    expect(spy).toHaveBeenCalledWith(['/student/my-classes']);
  });

  it('goToClasses() navigates to /student/classroom/:id when classId set', () => {
    const spy = spyOn((component as any).router, 'navigate');
    component.classId = 'abc';
    component.goToClasses();
    expect(spy).toHaveBeenCalledWith(['/student/classroom', 'abc']);
  });

  it('scorePercent returns 0 when score is null', () => {
    component.score = null;
    expect(component.scorePercent).toBe(0);
  });

  it('scorePercent returns numeric score when set', () => {
    component.score = 80;
    expect(component.scorePercent).toBe(80);
  });

  it('hasFlashcardBreakdown is true when both breakdown counts are present', () => {
    component.correctCount = 7;
    component.needsReviewCount = 3;
    expect(component.hasFlashcardBreakdown).toBeTrue();
  });

  it('hasFlashcardBreakdown is false when one breakdown count is missing', () => {
    component.correctCount = 7;
    component.needsReviewCount = null;
    expect(component.hasFlashcardBreakdown).toBeFalse();
  });
});
