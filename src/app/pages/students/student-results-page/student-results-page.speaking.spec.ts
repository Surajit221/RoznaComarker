// Stage 7g: the results page shows flashcard and worksheet results from navigation state only (it loads nothing). A speaking state never
// renders here as a score: it goes to the student's speaking page.
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { StudentResultsPage } from './student-results-page';

describe('StudentResultsPage and speaking (stage 7g)', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [StudentResultsPage], providers: [provideRouter([])] }));
  const start = (state: Record<string, unknown>) => {
    history.replaceState(state, '');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(StudentResultsPage);
    fixture.componentInstance.ngOnInit();
    return { component: fixture.componentInstance, navigate };
  };
  afterEach(() => history.replaceState(null, ''));

  it('a speaking state goes to the speaking page and shows no result', () => {
    const { component, navigate } = start({ type: 'speaking', total: 100, score: 50, assignmentId: 'a1', classId: 'c1' });
    expect(component.hasState).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/student/my-classes/detail/my-speaking', 'a1'], { queryParams: { classId: 'c1' } });
  });

  it('an unknown type without an assignment goes to My Classes', () => {
    const { component, navigate } = start({ type: 'other', total: 10, score: 5 });
    expect(component.hasState).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/student/my-classes']);
  });

  it('a flashcard result is unchanged', () => {
    const { component, navigate } = start({ type: 'flashcard', total: 10, score: 7, classId: 'c1' });
    expect(component.hasState).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });
});
