import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { StudentFlashcardPlayer } from './student-flashcard-player';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

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

  it('assessed Q&A renders typed checking without self-rating buttons', () => {
    spyOn<any>(component, 'loadSet');
    fixture.detectChanges();
    component.isLoading = false;
    component.hasError = false;
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Question', back: 'Answer', order: 0 }];
    component.set = { _id: 'set-1', title: 'Set', description: '', visibility: 'public', language: 'English' };
    (component as any).cdr.detectChanges();
    expect(fixture.nativeElement.querySelector('.sfp-answer-input')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Check answer');
    expect(fixture.nativeElement.textContent).not.toContain('Got it right');
    expect(fixture.nativeElement.textContent).not.toContain('Got it wrong');
    expect(component.isFlipped).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sfp-card-object').classList).not.toContain('is-flipped');
  });

  it('locks and reveals only the authoritative successful result', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Question', back: 'Canonical', order: 0 }];
    component.studentAnswer = 'Paraphrase';
    const api = (component as any).flashcardApi;
    spyOn(api, 'gradeAnswer').and.returnValue(of({ isCorrect: true, correct: true,
      correctAnswer: 'Canonical', studentAnswer: 'Paraphrase', explanation: 'Matches the key idea.',
      gradingMethod: 'semantic_ai', confidence: .95, checkedAt: new Date().toISOString() }));
    component.checkAnswer();
    expect(component.isFlipped).toBeTrue();
    expect(component.gradeResult).toBe('correct');
    expect((component as any).authoritativeGrade.isCorrect).toBeTrue();
  });

  it('upserts the authoritative checked result before creating the progress snapshot', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Question', back: 'Canonical', order: 0 }];
    component.studentAnswer = 'Wrong';
    spyOn((component as any).flashcardApi, 'gradeAnswer').and.returnValue(of({ isCorrect: false,
      correctAnswer: 'Canonical', studentAnswer: 'Wrong', gradingMethod: 'semantic_ai',
      checkedAt: new Date().toISOString() }));
    const save = spyOn<any>(component, 'saveProgress').and.callFake(() => {
      expect(component.cardResults.length).toBe(1);
      expect(component.cardResults[0].isCorrect).toBeFalse();
    });
    component.checkAnswer();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('Next after grading advances without adding the authoritative result twice', () => {
    component.template = 'qa';
    component.cards = [
      { _id: 'card-1', front: 'Q1', back: 'A1', order: 0 },
      { _id: 'card-2', front: 'Q2', back: 'A2', order: 1 },
    ];
    component.cardResults = [{ cardId: 'card-1', known: false, isCorrect: false }];
    (component as any).authoritativeGrade = component.cardResults[0];
    component.gradeResult = 'wrong';
    spyOn<any>(component, 'advance');
    component.advanceAfterGrade();
    expect(component.cardResults.length).toBe(1);
  });

  it('manual grading methods cannot alter assessed Q&A results', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.markCorrect();
    component.markWrong();
    expect(component.cardResults).toEqual([]);
  });

  it('queues the latest checked snapshot behind an in-flight typed-answer save', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.studentAnswer = 'Wrong';
    (component as any).resolvedFlashcardSetId = 'set-1';
    const firstSave = new Subject<any>();
    const api = (component as any).flashcardApi;
    const save = spyOn(api, 'saveProgress').and.returnValues(firstSave, of({ revision: 2 }));
    spyOn(api, 'gradeAnswer').and.returnValue(of({ isCorrect: false, studentAnswer: 'Wrong',
      correctAnswer: 'A', gradingMethod: 'semantic_ai', checkedAt: new Date().toISOString() }));

    (component as any).saveProgress();
    component.checkAnswer();
    expect(save).toHaveBeenCalledTimes(1);
    firstSave.next({ revision: 1 });
    firstSave.complete();

    expect(save).toHaveBeenCalledTimes(2);
    expect((save.calls.mostRecent().args[1] as any).cardProgress.length).toBe(1);
    expect((save.calls.mostRecent().args[1] as any).expectedRevision).toBe(1);
  });

  it('does not reveal or record a result when authoritative grading fails', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Question', back: 'Canonical', order: 0 }];
    component.studentAnswer = 'Nonsense';
    spyOn((component as any).flashcardApi, 'gradeAnswer').and.returnValue(throwError(() => new Error('failed')));
    component.checkAnswer();
    expect(component.isFlipped).toBeFalse();
    expect(component.cardResults).toEqual([]);
    expect(component.gradingError).toContain("couldn't check");
  });

  it('blocks repeated checks while the first request is active', () => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Question', back: 'Canonical', order: 0 }];
    component.studentAnswer = 'Answer';
    const pending = new Subject<any>();
    const spy = spyOn((component as any).flashcardApi, 'gradeAnswer').and.returnValue(pending);
    component.checkAnswer();
    component.checkAnswer();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  function configureResume(completed: string[], currentCardId?: string, partialAnswer = ''): void {
    component.cards = [1, 2, 3, 4, 5].map(n => ({ _id: `card-${n}`, front: `Q${n}`, back: `A${n}`, order: n - 1 }));
    component.savedProgress = {
      status: 'in_progress', revision: 3, currentCardId,
      cardsViewed: completed.map(id => Number(id.split('-')[1]) - 1),
      cardResults: Object.fromEntries(completed.map(id => [Number(id.split('-')[1]) - 1, 'knew'])),
      cardProgress: [
        ...completed.map(cardId => ({ cardId, completedAt: new Date().toISOString(), isChecked: true, isCorrect: false })),
        ...(currentCardId && partialAnswer ? [{ cardId: currentCardId, studentAnswer: partialAnswer,
          completedAt: null, isChecked: false }] : []),
      ],
    };
  }

  it('starts at card 1 when there is no restored progress', () => {
    expect(component.currentIndex).toBe(0);
  });

  it('resumes at card 3 after cards 1 and 2 are complete', () => {
    configureResume(['card-1', 'card-2'], 'card-3');
    component.resumeProgress();
    expect(component.currentIndex).toBe(2);
    expect(component.answeredCount).toBe(2);
  });

  it('resumes at card 5 after cards 1 through 4 are complete', () => {
    configureResume(['card-1', 'card-2', 'card-3', 'card-4'], 'card-5');
    component.resumeProgress();
    expect(component.currentIndex).toBe(4);
  });

  it('restores a partial answer on the first incomplete card', () => {
    configureResume(['card-1', 'card-2'], 'card-3', 'photosyn');
    component.resumeProgress();
    expect(component.currentIndex).toBe(2);
    expect(component.studentAnswer).toBe('photosyn');
    expect(component.isFlipped).toBeFalse();
  });

  it('ignores a saved current card that is already complete', () => {
    configureResume(['card-1', 'card-2'], 'card-2');
    component.resumeProgress();
    expect(component.currentIndex).toBe(2);
  });

  it('uses card identity when display order changes', () => {
    configureResume(['card-1', 'card-2'], 'card-3');
    component.cards = [component.cards[1], component.cards[0], component.cards[2], component.cards[3], component.cards[4]];
    component.resumeProgress();
    expect((component.currentCard as any)._id).toBe('card-3');
  });

  it('normalizes non-string saved card IDs', () => {
    configureResume([], 'card-2');
    component.savedProgress.cardProgress = [{ cardId: { toString: () => 'card-1' }, completedAt: new Date(), isChecked: false }];
    component.resumeProgress();
    expect(component.currentIndex).toBe(1);
  });

  it('preserves completed state when every card is complete', () => {
    configureResume(['card-1', 'card-2', 'card-3', 'card-4', 'card-5'], 'card-5');
    const navigate = spyOn((component as any).router, 'navigate');
    component.resumeProgress();
    expect(component.isComplete).toBeTrue();
    expect(navigate).toHaveBeenCalledWith(['/student/results'], jasmine.any(Object));
  });

  it('prioritizes a persisted incomplete currentCardId over a stale index', () => {
    configureResume(['card-1', 'card-2'], 'card-4', 'partial card four');
    component.resumeProgress();
    expect(component.currentIndex).toBe(3);
    expect(component.studentAnswer).toBe('partial card four');
  });

  it('does not render/reset card 1 while the asynchronous progress lookup is pending', () => {
    component.template = 'qa';
    component.cards = [1, 2, 3, 4, 5].map(n => ({ _id: `card-${n}`, front: `Q${n}`, back: `A${n}`, order: n - 1 }));
    const pending = new Subject<any>();
    spyOn((component as any).flashcardApi, 'getProgress').and.returnValue(pending);
    spyOn<any>(component, 'saveInitialProgress');
    (component as any).checkForExistingProgress('set-1');
    expect(component.isLoading).toBeTrue();
    pending.next({ status: 'in_progress', completedCards: 2, revision: 4, currentCardId: 'card-3',
      cardsViewed: [], cardProgress: [
        { cardId: 'card-1', isChecked: true, isCorrect: false },
        { cardId: 'card-2', isChecked: true, isCorrect: false },
      ] });
    expect(component.currentIndex).toBe(2);
    expect(component.isLoading).toBeFalse();
    expect((component as any).saveInitialProgress).not.toHaveBeenCalled();
  });

  it('includes the same assignmentId in progress GET', () => {
    (component as any).assignmentId = 'assignment-1';
    const api = (component as any).flashcardApi;
    spyOn(api, 'getProgress').and.returnValue(of({ status: 'not_started', completedCards: 0,
      cardProgress: [], revision: 0 }));
    spyOn(api, 'saveProgress').and.returnValue(of({ revision: 1 }));
    (component as any).checkForExistingProgress('set-1');
    expect(api.getProgress).toHaveBeenCalledWith('set-1', 'assignment-1');
  });

  it('includes assignmentId in PATCH and updates the returned revision', () => {
    (component as any).assignmentId = 'assignment-1';
    (component as any).resolvedFlashcardSetId = 'set-1';
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    const api = (component as any).flashcardApi;
    const save = spyOn(api, 'saveProgress').and.returnValue(of({ revision: 6 }));
    (component as any).saveProgress();
    expect((save.calls.mostRecent().args[1] as any).assignmentId).toBe('assignment-1');
    expect((component as any).progressRevision).toBe(6);
  });

  it('does not leave until the latest queued card-3 snapshot is persisted', () => {
    component.template = 'qa';
    component.cards = [1, 2, 3, 4, 5].map(n => ({ _id: `card-${n}`, front: `Q${n}`, back: `A${n}`, order: n - 1 }));
    component.currentIndex = 1;
    (component as any).initializeRuntimeCards();
    (component as any).upsertRuntime('card-1', { completed: true, known: false, isCorrect: false });
    (component as any).upsertRuntime('card-2', { completed: true, known: false, isCorrect: false });
    (component as any).resolvedFlashcardSetId = 'set-1';
    const firstSave = new Subject<any>();
    const nextCardSave = new Subject<any>();
    const save = spyOn((component as any).flashcardApi, 'saveProgress').and.returnValues(firstSave, nextCardSave);
    const navigate = spyOn((component as any).router, 'navigate');

    (component as any).saveProgress();
    (component as any).saveProgressWithNextIndex(2);
    component.goBackToClass();
    expect(navigate).not.toHaveBeenCalled();

    firstSave.next({ revision: 1 });
    firstSave.complete();
    expect(save).toHaveBeenCalledTimes(2);
    expect((save.calls.mostRecent().args[1] as any).currentCardId).toBe('card-3');
    expect((save.calls.mostRecent().args[1] as any).cardProgress.map((item: any) => item.cardId))
      .toEqual(['card-1', 'card-2']);
    expect(navigate).not.toHaveBeenCalled();

    nextCardSave.next({ revision: 2 });
    nextCardSave.complete();
    expect(navigate).toHaveBeenCalledOnceWith(['/student/my-classes']);
  });

  it('restores two wrong cards through initialization and includes all five in final results', fakeAsync(() => {
    component.template = 'qa';
    component.cards = [1, 2, 3, 4, 5].map(n => ({ _id: `card-${n}`, front: `Q${n}`, back: `A${n}`, order: n - 1 }));
    component.set = { _id: 'set-1', title: 'Five cards', description: '', visibility: 'public',
      language: 'English', template: 'qa', cards: component.cards } as any;
    (component as any).resolvedFlashcardSetId = 'set-1';
    const api = (component as any).flashcardApi;
    spyOn(api, 'getProgress').and.returnValue(of({ status: 'in_progress', completedCards: 2,
      totalCards: 5, currentCardId: 'card-3', revision: 2, cardsViewed: [0, 1], cardResults: {},
      cardProgress: [
        { cardId: 'card-1', studentAnswer: 'wrong 1', isChecked: true, isCorrect: false },
        { cardId: 'card-2', studentAnswer: 'wrong 2', isChecked: true, isCorrect: false },
      ] }));
    let revision = 2;
    spyOn(api, 'saveProgress').and.callFake((_setId: string, payload: any) => of({ revision: ++revision,
      status: payload.cardProgress.length === 5 ? 'completed' : 'in_progress' }));
    spyOn(api, 'gradeAnswer').and.callFake((_setId: string, cardId: string, answer: string) => of({
      correct: false, isCorrect: false, correctAnswer: `A${cardId.slice(-1)}`, studentAnswer: answer,
      explanation: 'Wrong', gradingMethod: 'exact', checkedAt: new Date().toISOString(),
    }));
    const navigate = spyOn((component as any).router, 'navigate');

    (component as any).checkForExistingProgress('set-1');
    expect(component.currentIndex).toBe(2);
    expect(component.currentCard?._id).toBe('card-3');
    expect(component.learningCount).toBe(2);
    expect(component.knownCount).toBe(0);
    expect(component.incompleteCount).toBe(3);

    for (const cardNumber of [3, 4, 5]) {
      component.studentAnswer = `wrong ${cardNumber}`;
      component.checkAnswer();
      component.advanceAfterGrade();
      if (cardNumber < 5) tick(600);
    }

    expect(component.learningCount).toBe(5);
    expect(component.knownCount).toBe(0);
    expect(component.incompleteCount).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/student/results'], jasmine.objectContaining({ state: jasmine.objectContaining({
      score: 0, correctCount: 0, needsReviewCount: 5, incompleteCount: 0,
      cardResults: jasmine.arrayWithExactContents(component.cardResults),
    }) }));
    flush();
  }));

  function configureTermResume(useLegacyIndexes = false, completed = 2): void {
    component.template = 'term-def';
    component.cards = [1, 2, 3, 4, 5].map(n => ({ _id: `term-${n}`, front: `T${n}`, back: `D${n}`, order: n - 1 }));
    const ratings = ['knew', 'didnt_know', 'knew', 'didnt_know', 'knew'].slice(0, completed);
    component.savedProgress = {
      status: completed === 5 ? 'completed' : 'in_progress', completedCards: completed, totalCards: 5,
      currentCardId: completed < 5 ? `term-${completed + 1}` : null, revision: 4,
      cardsViewed: ratings.map((_, index) => index),
      cardResults: useLegacyIndexes
        ? Object.fromEntries(ratings.map((rating, index) => [index, rating]))
        : Object.fromEntries(ratings.map((rating, index) => [`term-${index + 1}`, rating])),
      cardProgress: useLegacyIndexes ? [] : ratings.map((rating, index) => ({
        cardId: `term-${index + 1}`, selfRating: rating, completedAt: new Date().toISOString(),
        isChecked: false, isCorrect: null,
      })),
    };
  }

  it('resumes self-rated term cards at 3 / 5 with canonical counters', () => {
    configureTermResume();
    component.resumeProgress();
    expect(component.currentIndex).toBe(2);
    expect(component.displayCardNumber).toBe(3);
    expect(component.currentCard?._id).toBe('term-3');
    expect(component.knownCount).toBe(1);
    expect(component.learningCount).toBe(1);
    expect(component.progress).toBe(40);
  });

  it('normalizes legacy index-keyed self ratings and resumes card 3', () => {
    configureTermResume(true);
    component.resumeProgress();
    expect(component.currentCard?._id).toBe('term-3');
    expect(component.knownCount).toBe(1);
    expect(component.learningCount).toBe(1);
  });

  it('remains stable across five repeated term-card restores', () => {
    configureTermResume();
    for (let refresh = 0; refresh < 5; refresh++) {
      component.resumeProgress();
      expect(component.currentIndex).toBe(2);
      expect(component.answeredCount).toBe(2);
      expect(component.knownCount).toBe(1);
      expect(component.learningCount).toBe(1);
    }
  });

  it('persists the last self-rating, completes once, and never sets index 5', () => {
    configureTermResume(false, 4);
    component.resumeProgress();
    component.isFlipped = true;
    (component as any).resolvedFlashcardSetId = 'set-1';
    const save = spyOn((component as any).flashcardApi, 'saveProgress').and.callFake((_setId: string, payload: any) => {
      expect(payload.cardProgress).toHaveSize(5);
      expect(payload.currentCardId).toBeNull();
      return of({ revision: 5, status: 'completed' });
    });
    const navigate = spyOn((component as any).router, 'navigate');

    component.markKnown();

    expect(save).toHaveBeenCalledTimes(1);
    expect(component.currentIndex).toBe(4);
    expect(component.displayCardNumber).toBe(5);
    expect(component.isComplete).toBeTrue();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/student/results'], jasmine.any(Object));
  });

  it('builds the same completed payload for final Still learning', () => {
    configureTermResume(false, 4);
    component.resumeProgress();
    component.isFlipped = true;
    (component as any).resolvedFlashcardSetId = 'set-1';
    const save = spyOn((component as any).flashcardApi, 'saveProgress').and.callFake((_setId: string, payload: any) => {
      expect(payload.status).toBe('completed');
      expect(payload.currentCardId).toBeNull();
      expect(payload.cardProgress[4]).toEqual(jasmine.objectContaining({ cardId: 'term-5', selfRating: 'didnt_know' }));
      return of({ revision: 5, status: 'completed' });
    });
    spyOn((component as any).router, 'navigate');

    component.markLearning();

    expect(save).toHaveBeenCalledTimes(1);
    expect(component.currentIndex).toBe(4);
    expect(component.learningCount).toBe(3);
  });

  it('keeps currentCardId until the template-aware session is complete', () => {
    configureTermResume(false, 4);
    component.resumeProgress();
    const partial = (component as any).buildProgressSnapshot(null);
    expect(partial.status).toBe('in_progress');
    expect(partial.currentCardId).toBe('term-5');
  });

  it('keeps the final card and local rating intact when completion persistence returns 500', () => {
    configureTermResume(false, 4);
    component.resumeProgress();
    component.isFlipped = true;
    (component as any).resolvedFlashcardSetId = 'set-1';
    spyOn((component as any).flashcardApi, 'saveProgress').and.returnValue(throwError(() =>
      new HttpErrorResponse({ status: 500 })));
    const navigate = spyOn((component as any).router, 'navigate');

    component.markKnown();

    expect(component.currentIndex).toBe(4);
    expect(component.knownCount).toBe(3);
    expect(component.saveState).toBe('error');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('preserves a loaded revision and sends it with final completion', () => {
    configureTermResume(false, 4);
    component.savedProgress.revision = 12;
    component.resumeProgress();
    component.isFlipped = true;
    (component as any).resolvedFlashcardSetId = 'set-1';
    const save = spyOn((component as any).flashcardApi, 'saveProgress').and.callFake((_setId: string, payload: any) => {
      expect(payload.expectedRevision).toBe(12);
      return of({ revision: 13, status: 'completed' });
    });
    spyOn((component as any).router, 'navigate');

    component.markKnown();

    expect(save).toHaveBeenCalledTimes(1);
    expect((component as any).progressRevision).toBe(13);
  });

  it('opens results directly for five persisted term ratings without rendering card 6', () => {
    configureTermResume(false, 5);
    component.currentIndex = 4;
    const navigate = spyOn((component as any).router, 'navigate');
    component.resumeProgress();
    component.resumeProgress();
    expect(component.currentIndex).toBe(4);
    expect(component.displayCardNumber).toBe(5);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does not classify HTTP 400 as retryable', () => {
    const error = new HttpErrorResponse({ status: 400 });
    expect(() => (component as any).progressRetryDelay(error)).toThrow(error);
  });

  it('does not classify optimistic conflict 409 as retryable', () => {
    const error = new HttpErrorResponse({ status: 409 });
    expect(() => (component as any).progressRetryDelay(error)).toThrow(error);
  });

  it('uses authoritative Q&A correctness for live counters, ignoring legacy known', () => {
    component.template = 'qa';
    component.cards = [1, 2, 3].map(n => ({ _id: String(n), front: 'Q', back: 'A', order: n }));
    (component as any).initializeRuntimeCards();
    for (const cardId of ['1', '2', '3']) (component as any).upsertRuntime(cardId,
      { completed: true, known: true, isCorrect: false });
    expect(component.knownCount).toBe(0);
    expect(component.learningCount).toBe(3);
  });

  it('preserves legacy self-rating counters for non-Q&A templates', () => {
    component.template = 'term-def';
    component.cards = [1, 2].map(n => ({ _id: String(n), front: 'Q', back: 'A', order: n }));
    (component as any).initializeRuntimeCards();
    (component as any).upsertRuntime('1', { completed: true, known: true });
    (component as any).upsertRuntime('2', { completed: true, known: false });
    expect(component.knownCount).toBe(1);
    expect(component.learningCount).toBe(1);
  });

  it('rebuilds two persisted wrong answers before continuing session two', () => {
    component.template = 'qa';
    configureResume(['card-1', 'card-2'], 'card-3');
    component.resumeProgress();
    expect(component.knownCount).toBe(0);
    expect(component.learningCount).toBe(2);
    expect(component.answeredCount).toBe(2);
    expect(component.incompleteCount).toBe(3);

    for (const cardId of ['card-3', 'card-4', 'card-5']) (component as any).upsertRuntime(cardId,
      { completed: true, known: false, isCorrect: false });
    expect(component.learningCount).toBe(5);
    expect(component.answeredCount).toBe(5);
    expect(component.incompleteCount).toBe(0);
    expect(component.isComplete).toBeTrue();
  });

  it('rebuilds mixed persisted correctness and remains stable across repeated restore', () => {
    component.template = 'qa';
    configureResume(['card-1', 'card-2'], 'card-3');
    component.savedProgress.cardProgress[0].isCorrect = true;
    component.savedProgress.cardProgress[1].isCorrect = false;
    component.resumeProgress();
    component.resumeProgress();
    expect(component.knownCount).toBe(1);
    expect(component.learningCount).toBe(1);
    expect(component.answeredCount).toBe(2);
  });

  it('waits for the final assignment submission before showing Q&A results', fakeAsync(() => {
    component.template = 'qa';
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.set = { _id: 'set-1', title: 'Set', description: '', visibility: 'public',
      language: 'English', template: 'qa', cards: component.cards } as any;
    (component as any).assignmentId = 'assignment-1';
    (component as any).resolvedFlashcardSetId = 'set-1';
    (component as any).initializeRuntimeCards();
    (component as any).upsertRuntime('card-1', {
      completed: true, known: true, isCorrect: true, studentAnswer: 'A'
    });
    const submit = spyOn((component as any).assignmentApi, 'submitFlashcardAssignment')
      .and.returnValue(Promise.resolve({}));
    spyOn((component as any).assignmentState, 'markCompleted');
    const navigate = spyOn((component as any).router, 'navigate');

    (component as any).onComplete();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();

    tick();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(component.currentIndex).toBe(0);
    expect(component.isCompleting).toBeTrue();
  }));

  it('does not count an unchecked partial resumed answer as completed', () => {
    component.template = 'qa';
    configureResume(['card-1', 'card-2'], 'card-3', 'partial');
    component.resumeProgress();
    expect(component.studentAnswer).toBe('partial');
    expect(component.answeredCount).toBe(2);
    expect(component.incompleteCount).toBe(3);
  });

  it('advances the visible counter immediately without waiting for the progress PATCH', fakeAsync(() => {
    component.template = 'term-def';
    component.cards = [1, 2, 3].map(n => ({ _id: `card-${n}`, front: 'Q', back: 'A', order: n }));
    (component as any).initializeRuntimeCards();
    (component as any).resolvedFlashcardSetId = 'set-1';
    spyOn((component as any).flashcardApi, 'saveProgress').and.returnValue(new Subject());
    component.isFlipped = true;

    component.markKnown();

    expect(component.currentIndex).toBe(1);
    expect(component.displayCardNumber).toBe(2);
    tick(600);
  }));

  it('shows a retryable finalization state and retries without resetting cards', fakeAsync(() => {
    component.template = 'term-def';
    component.cards = [{ _id: 'card-1', front: 'Q', back: 'A', order: 0 }];
    component.set = { _id: 'set-1', title: 'Set', cards: component.cards } as any;
    (component as any).assignmentId = 'assignment-1';
    (component as any).resolvedFlashcardSetId = 'set-1';
    (component as any).initializeRuntimeCards();
    (component as any).upsertRuntime('card-1', { completed: true, known: true });
    const submit = spyOn((component as any).assignmentApi, 'submitFlashcardAssignment');
    spyOn((component as any).router, 'navigate');
    submit.and.returnValue(Promise.reject(new Error('temporary')));

    (component as any).onComplete();
    tick();
    expect(component.finalizationFailed).toBeTrue();
    expect(component.currentIndex).toBe(0);

    submit.and.returnValue(Promise.resolve({}));
    component.retryFinalSubmission();
    tick();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(component.finalizationFailed).toBeFalse();
  }));
});
