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

  function initializeQa(results: Array<{ isCorrect: boolean; known: boolean }>, stale: any = {}): void {
    const cardResults = results.map((result, index) => ({ cardId: `card-${index + 1}`, ...result }));
    spyOn((component as any).router, 'getCurrentNavigation').and.returnValue({ extras: { state: {
      type: 'flashcard', template: 'qa', total: results.length, score: stale.score ?? 60,
      correctCount: stale.correctCount ?? 3, needsReviewCount: stale.needsReviewCount ?? 2,
      cardResults, cards: cardResults.map((_, index) => ({ _id: `card-${index + 1}`, front: 'Q', back: 'A', order: index })),
    } } });
    component.ngOnInit();
  }

  it('derives 0%, 0 correct and 5 incorrect from five authoritative wrong results', () => {
    initializeQa(Array.from({ length: 5 }, () => ({ isCorrect: false, known: true })));
    expect(component.score).toBe(0);
    expect(component.correctCount).toBe(0);
    expect(component.needsReviewCount).toBe(5);
    expect(component.cardsNeedingReview.length).toBe(5);
  });

  it('derives 100% and no review cards from five authoritative correct results', () => {
    initializeQa(Array.from({ length: 5 }, () => ({ isCorrect: true, known: false })));
    expect(component.score).toBe(100);
    expect(component.correctCount).toBe(5);
    expect(component.needsReviewCount).toBe(0);
    expect(component.cardsNeedingReview.length).toBe(0);
  });

  it('derives 60% and review count two from three correct and two wrong', () => {
    initializeQa([
      { isCorrect: true, known: false }, { isCorrect: true, known: false }, { isCorrect: true, known: false },
      { isCorrect: false, known: true }, { isCorrect: false, known: true },
    ]);
    expect(component.score).toBe(60);
    expect(component.correctCount).toBe(3);
    expect(component.needsReviewCount).toBe(2);
    expect(component.cardsNeedingReview.length).toBe(2);
  });

  it('ignores stale supplied score, counts, and contradictory legacy known values', () => {
    initializeQa(Array.from({ length: 5 }, () => ({ isCorrect: false, known: true })),
      { score: 100, correctCount: 5, needsReviewCount: 0 });
    expect(component.score).toBe(0);
    expect(component.correctCount).toBe(0);
    expect(component.needsReviewCount).toBe(5);
  });
});
