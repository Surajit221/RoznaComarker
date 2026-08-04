import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { MySubmissionPage } from './my-submission-page';
import { CorrectionOverlay } from '../../../../../components/correction-overlay/correction-overlay';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';

describe('MySubmissionPage', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MySubmissionPage;
  let fixture: ComponentFixture<MySubmissionPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MySubmissionPage], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('student')
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MySubmissionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resets student sections independently for a new submission', () => {
    (component as any).resetSectionStates();
    expect(component.scoreState).toBe('loading');
    expect(component.transcriptState).toBe('loading');
    expect(component.correctionsState).toBe('loading');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
  });

  it('preserves valid loaded zero corrections', () => {
    component.correctionsState = 'loaded';
    component.feedback = { correctionStatistics: { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 } } as any;
    expect(component.contentIssuesCount).toBe(0);
    expect(component.grammarIssuesCount).toBe(0);
  });

  it('allows feedback to remain loading after transcript content is ready', () => {
    component.transcriptState = 'loaded';
    component.feedbackState = 'loading';
    expect(component.transcriptState).toBe('loaded');
    expect(component.feedbackState).toBe('loading');
  });

  it('keeps canonical score, grade, statistics and comments identical across viewport branches', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 4, organization: 0, vocabulary: 0, mechanics: 2 },
      overallScore: 36.5, grade: 'F', processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.scoreState = 'loaded';
    component.statisticsState = 'loaded';
    component.correctionsState = 'loaded';
    component.teacherComment = 'Canonical teacher comment';
    component.feedbackForm.patchValue({ message: component.teacherComment });

    const snapshot = () => ({
      state: component.canonicalResultState,
      score: component.overallScoreText,
      grade: component.gradeLabel,
      counts: [component.contentIssuesDisplay, component.grammarIssuesDisplay,
        component.organizationIssuesDisplay, component.vocabularyIssuesDisplay, component.mechanicsIssuesDisplay],
      comment: component.feedbackForm.value.message
    });
    (component.device as any).width.set(1440);
    fixture.detectChanges();
    const desktop = snapshot();
    (component.device as any).width.set(390);
    fixture.detectChanges();
    const mobile = snapshot();

    expect(mobile).toEqual(desktop);
    expect(mobile.counts).toEqual([0, 4, 0, 0, 2]);
    expect(fixture.nativeElement.textContent).toContain('Download PDF');
    expect(fixture.nativeElement.textContent).toContain('View Rubric');
    expect(fixture.nativeElement.textContent).toContain('Teacher Comments');
    expect(fixture.nativeElement.querySelector('app-adaptive-writing-studio')).toBeTruthy();

    component.onTabSelected('transcribed-text');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Correction Statistics');
    expect(fixture.nativeElement.textContent).toContain('Correction Legend');
  });

  it('shows evaluation-specific wording on desktop and mobile and retries scoring only', async () => {
    component.submission = { _id: 'submission-1' } as any;
    component.canonicalResultState = normalizeCanonicalResult({ correctionStatus: 'completed', semanticStatus: 'completed',
      correctionSourceHash: 'fresh-hash', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 5, organization: 0, vocabulary: 0, mechanics: 3 },
      evaluationStatus: 'failed', detailedFeedbackStatus: 'blocked', manualRetryAllowed: true, terminal: true });
    component.scoreState = 'error'; component.feedbackState = 'error'; component.aiFeedbackState = 'error';
    const api = (component as any).submissionApi;
    spyOn(api, 'retryCanonicalEvaluation').and.resolveTo({});
    spyOn(api, 'regenerateCanonicalCorrections').and.resolveTo({});

    for (const width of [1440, 390]) {
      (component.device as any).width.set(width); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Correction analysis completed, but scoring and detailed feedback could not be generated.');
      expect(fixture.nativeElement.textContent).toContain('Retry scoring');
    }
    await component.retryCanonicalAnalysis();
    expect(api.retryCanonicalEvaluation).toHaveBeenCalledOnceWith('submission-1');
    expect(api.regenerateCanonicalCorrections).not.toHaveBeenCalled();
  });

  it('passes the student annotations to the mobile correction overlay', () => {
    (component.device as any).width.set(390);
    component.submissionFileUrls = ['image-1.jpg'];
    component.annotations = [{ _id: 'student-a-1', fileId: 'file-1' }] as any;
    fixture.detectChanges();

    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay))
      .componentInstance as CorrectionOverlay;
    expect(overlay.annotations).toBe(component.annotations);
  });

  it('keeps mobile thumbnails after the uploaded image and before AI feedback', () => {
    (component.device as any).width.set(390);
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('app-correction-overlay') as HTMLElement;
    const thumbnails = fixture.nativeElement.querySelector('.mobile-submission-thumbs') as HTMLElement;
    const aiFeedback = fixture.nativeElement.querySelector('#ai-feedback-section-mobile') as HTMLElement;

    expect(overlay.compareDocumentPosition(thumbnails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thumbnails.compareDocumentPosition(aiFeedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thumbnails.querySelectorAll('.submission-thumb').length).toBe(2);
  });

  it('keeps multiple-image selection working on the student page', () => {
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    spyOn<any>(component, 'setUploadedFileUrl').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();

    component.onSelectSubmissionImage(1);

    expect(component.activeFileIndex).toBe(1);
  });
});
