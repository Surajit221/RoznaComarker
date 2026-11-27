import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { StudentSubmissionPages } from './student-submission-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { TeacherEvaluationApiService } from '../../../../../api/teacher-evaluation-api.service';
import { SimilarityApiService, type SimilarityReport, type SimilarityView } from '../../../../../api/similarity-api.service';

// The "Check similarity" button in the Student's Uploaded File card (and the Transcribed Text card), like "Review corrections": it opens the
// similarity view in place of the uploaded image, turns into "Close", and only one of the two views is open at a time. No bottom card.
const PANEL: SimilarityView = { state: 'none', eligible: true, reason: null, wordCount: 10, checksLeftToday: 20, checksLeftForSubmission: 3,
  externalAvailable: true, noticeShown: true, confirmationNeeded: false };
const REPORT = { ...PANEL, state: 'completed', revision: 2, checkedAt: null, outdated: false, text: 'one two three', totalWords: 3, matchedWords: 1,
  overallPercent: 12, external: { state: 'completed', reason: null }, settings: { excludeQuotes: true, minMatchWords: 8 }, sources: [], highlights: [],
  audit: { provider: null, units: null, costUsd: null, resultCount: null } } as unknown as SimilarityReport;

describe('StudentSubmissionPages: the Check similarity button and view', () => {
  let fixture: ComponentFixture<StudentSubmissionPages>;
  let component: StudentSubmissionPages;
  let view: SimilarityView | null;
  const dom = () => fixture.nativeElement as HTMLElement;
  const toggle = () => dom().querySelector<HTMLButtonElement>('[data-similarity-toggle]');
  const review = () => dom().querySelector<HTMLButtonElement>('[data-review-corrections]');
  const label = (b: HTMLElement | null) => b?.querySelector('span:last-child')?.textContent?.trim();
  const settle = () => { flushMicrotasks(); fixture.detectChanges(); tick(); flushMicrotasks(); fixture.detectChanges(); };

  beforeEach(async () => {
    view = PANEL;
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('teacher'),
        { provide: TeacherEvaluationApiService, useValue: { snapshot: async () => null, save: async () => { throw new Error('not used'); } } },
        { provide: SimilarityApiService, useValue: { get: jasmine.createSpy('get').and.callFake(async () => view), notice: async () => null } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).match(() => true).forEach(req => req.flush({}, { status: 404, statusText: 'Not Found' }));
    verifyHttpRequestsAfterEach();
  });

  function show(uploaded = true) {
    component.currentSubmission = { _id: 'submission-1' } as NonNullable<typeof component.currentSubmission>;
    component.isUploadedFile = uploaded;
    void component.loadSimilarity('submission-1');
    settle();
    const controls = component.annotationControls!;
    spyOn(controls, 'toggle').and.callFake(async () => { controls.open.update(open => !open); });
  }

  it('no button while the feature is off or the teacher is not the owner (404)', fakeAsync(() => {
    view = null;
    show();
    expect(toggle()).toBeNull();
  }));

  it('sits next to Review corrections in the Uploaded File card, teal, closed, labelled Check similarity', fakeAsync(() => {
    show();
    const button = toggle()!;
    expect(button.closest('.submission-media-actions')).toBe(review()!.closest('.submission-media-actions'));
    expect(button.previousElementSibling).toBe(review());
    expect(button.classList).toContain('btn-primary');
    expect(label(button)).toBe('Check similarity');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('similarity-view');
  }));

  it('a finished report shows its percentage on the button', fakeAsync(() => {
    view = REPORT;
    show();
    expect(label(toggle())).toBe('Similarity 12%');
  }));

  it('opens in place of the uploaded image: the button says Close, the heading takes focus; Close restores the image and the focus', fakeAsync(() => {
    show();
    toggle()!.click();
    settle(); tick(50); fixture.detectChanges();
    const card = toggle()!.closest('.rounded-3xl')!;
    expect(card.querySelector('#similarity-view app-similarity-report')).not.toBeNull();
    expect(dom().querySelector<HTMLElement>('[data-standalone-viewer]')!.hidden).toBeTrue();
    expect(label(toggle())).toBe('Close');
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('similarity-title');
    toggle()!.click();
    settle(); tick(50);
    expect(dom().querySelector('#similarity-view')).toBeNull();
    expect(dom().querySelector<HTMLElement>('[data-standalone-viewer]')!.hidden).toBeFalse();
    expect(label(toggle())).toBe('Check similarity');
    expect(document.activeElement).toBe(toggle());
  }));

  it('only one view at a time: Review corrections closes similarity, and Check similarity closes the correction editor', fakeAsync(() => {
    show();
    toggle()!.click(); settle(); tick(50);
    review()!.click(); settle(); tick(50);
    expect(component.annotationControls!.open()).toBeTrue();
    expect(dom().querySelector('#similarity-view')).toBeNull();
    expect(label(toggle())).toBe('Check similarity');
    toggle()!.click(); settle(); tick(50);
    expect(component.annotationControls!.open()).toBeFalse();
    expect(dom().querySelector('#similarity-view')).not.toBeNull();
    expect(label(review())).toBe('Review corrections');
  }));

  it('the separate Similarity card at the bottom of the page is gone (the panel exists only inside the open view)', fakeAsync(() => {
    show();
    expect(dom().querySelectorAll('app-similarity-report').length).toBe(0);
    toggle()!.click(); settle(); tick(50);
    expect(dom().querySelectorAll('app-similarity-report').length).toBe(1);
  }));

  it('in the Transcribed Text card: the same button, and the view replaces the transcribed content', fakeAsync(() => {
    show(false);
    const button = toggle()!;
    expect(button.previousElementSibling).toBe(review());
    button.click(); settle(); tick(50);
    expect(dom().querySelector('#similarity-view app-similarity-report')).not.toBeNull();
    expect(dom().querySelector<HTMLElement>('[data-transcribed-content]')!.hidden).toBeTrue();
  }));

  it('a check finished inside the view updates the button percentage', fakeAsync(() => {
    show();
    component.onSimilarityView(REPORT);
    fixture.detectChanges();
    expect(label(toggle())).toBe('Similarity 12%');
    component.onSimilarityView({ ...REPORT, state: 'running' } as SimilarityReport);
    fixture.detectChanges();
    expect(label(toggle())).toBe('Check similarity');
  }));
});
