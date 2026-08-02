import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentSubmissionPages } from './student-submission-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';

describe('StudentSubmissionPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: StudentSubmissionPages;
  let fixture: ComponentFixture<StudentSubmissionPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('teacher')
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resets every asynchronous section to loading for a newly selected submission', () => {
    (component as any).resetSectionLoadStates(true);

    expect(component.transcriptState).toBe('loading');
    expect(component.correctionsState).toBe('loading');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
    expect(component.teacherCommentState).toBe('loading');
    expect(component.scoreState).toBe('loading');
  });

  it('keeps section loading states independent', () => {
    component.transcriptState = 'loaded';
    component.correctionsState = 'loaded';
    component.feedbackState = 'loading';
    component.aiFeedbackState = 'loading';

    expect(component.transcriptState).toBe('loaded');
    expect(component.correctionsState).toBe('loaded');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
  });

  it('preserves a valid zero correction count after loading', () => {
    component.correctionsState = 'loaded';
    component.currentFeedback = {
      correctionStatistics: { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 }
    } as any;

    expect(component.contentIssuesCount).toBe(0);
    expect(component.grammarIssuesCount).toBe(0);
  });

  it('uses an explicit error state instead of leaving a section loading', () => {
    component.correctionsState = 'error';
    component.feedbackState = 'loaded';

    expect(component.correctionsState).toBe('error');
    expect(component.feedbackState).toBe('loaded');
  });

  it('renders exactly one editable Teacher Comments section in the mobile branch', () => {
    (component.device as any).width.set(390);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor textarea[formControlName="message"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor button')?.textContent).toContain('Submit');
  });

  it('keeps the mobile Teacher Comments editor available when evaluation fails', () => {
    (component.device as any).width.set(320);
    component.aiFeedbackState = 'error';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.section-load-error')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor textarea')).toBeTruthy();
  });

  it('uses one canonical state for teacher desktop and mobile templates', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 4, organization: 0, vocabulary: 0, mechanics: 2 },
      overallScore: 36.5, grade: 'F', processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.scoreState = 'loaded';
    component.statisticsState = 'loaded';
    component.correctionsState = 'loaded';
    component.feedbackForm.patchValue({ message: 'Canonical teacher comment' });
    const state = component.canonicalResultState;

    (component.device as any).width.set(1440);
    fixture.detectChanges();
    expect(component.canonicalResultState).toBe(state);
    (component.device as any).width.set(390);
    fixture.detectChanges();

    expect(component.canonicalResultState).toBe(state);
    expect([component.contentIssuesDisplay, component.grammarIssuesDisplay,
      component.organizationIssuesDisplay, component.vocabularyIssuesDisplay,
      component.mechanicsIssuesDisplay]).toEqual([0, 4, 0, 0, 2]);
    expect(component.overallScoreText).toBe('36.5 / 100');
    expect(component.gradeLabel).toBe('F');
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor textarea')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Download PDF');
    expect(fixture.nativeElement.textContent).toContain('View / Edit Rubric');
  });

  it('shows the same evaluation-only failure and retry label at desktop and mobile widths', () => {
    component.canonicalResultState = normalizeCanonicalResult({ correctionStatus: 'completed', semanticStatus: 'completed',
      correctionSourceHash: 'fresh-hash', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 5, organization: 0, vocabulary: 0, mechanics: 3 },
      evaluationStatus: 'failed', detailedFeedbackStatus: 'blocked', manualRetryAllowed: true, terminal: true });
    component.scoreState = 'error'; component.feedbackState = 'error'; component.aiFeedbackState = 'error';
    for (const width of [1440, 390]) {
      (component.device as any).width.set(width);
      if (width === 390) component.onTabSelected('transcribed-text');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Correction analysis completed, but scoring and detailed feedback could not be generated.');
      expect(fixture.nativeElement.textContent).toContain('Retry scoring');
    }
  });
});
