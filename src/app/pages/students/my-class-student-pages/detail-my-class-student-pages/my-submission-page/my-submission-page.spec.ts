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

  it('shows evaluation-specific wording without exposing a student retry action', async () => {
    component.submission = { _id: 'submission-1' } as any;
    component.canonicalResultState = normalizeCanonicalResult({ correctionStatus: 'completed', semanticStatus: 'completed',
      correctionSourceHash: 'fresh-hash', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 5, organization: 0, vocabulary: 0, mechanics: 3 },
      evaluationStatus: 'failed', detailedFeedbackStatus: 'blocked', manualRetryAllowed: true, terminal: true });
    component.scoreState = 'error'; component.feedbackState = 'error'; component.aiFeedbackState = 'error';
    for (const width of [1440, 390]) {
      (component.device as any).width.set(width); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Correction analysis completed, but scoring and detailed feedback could not be generated.');
      expect(fixture.nativeElement.textContent).not.toContain('Retry scoring');
    }
    expect((component as any).retryCanonicalAnalysis).toBeUndefined();
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

  it('does not expose fake fixed-category zeros while evaluation is pending', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'pending', detailedFeedbackStatus: 'pending',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    component.feedback = { submissionId: 'submission-1', rubricScores: null } as any;
    component.aiFeedbackState = 'processing';
    fixture.detectChanges();

    expect(component.feedbacks).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
  });

  it('shows a nontechnical stale-result message and never exposes an evaluation action', () => {
    component.feedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true
    });
    component.scoreState = 'loaded';
    (component.device as any).width.set(390);
    component.onTabSelected('transcribed-text');
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.state).toBe('stale');
    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Your teacher is updating this evaluation');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.textContent).not.toContain('Re-evaluate with current rubric');
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    )).toBeNull();
  });

  it('shows student update progress without fake zero scores or retry controls', () => {
    component.feedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 },
      rubricScores: null
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'processing',
      detailedFeedbackStatus: 'processing',
      processingActive: true,
      automaticPollingAllowed: true
    });
    component.scoreState = 'loaded';
    component.aiFeedbackState = 'processing';
    (component.device as any).width.set(390);
    component.onTabSelected('transcribed-text');
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Your teacher is updating this evaluation');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
    expect(fixture.nativeElement.querySelector('button[aria-label*="evaluation"]')).toBeNull();
  });

  it('renders custom-rubric criteria through the original fixed-category row layout', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 60, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.feedback = {
      submissionId: 'submission-1',
      scoringAudit: { overallMethod: 'custom_rubric_weighted_total' },
      customRubricScores: { overallScore: 60, criteria: [{
        criterionId: 'criterion-1', title: 'Content Accuracy', normalizedWeight: 30,
        selectedLevel: 'Satisfactory', configuredLevelPercentage: 60,
        weightedPoints: 18, comment: 'Meets the criterion at a satisfactory level.', evidenceIds: []
      }] }
    } as any;
    component.aiFeedbackState = 'loaded';
    (component.device as any).width.set(1440);
    fixture.detectChanges();

    expect(component.isCustomRubricResult).toBeTrue();
    expect(component.feedbacks).toEqual([
      jasmine.objectContaining({
        category: 'Content Accuracy',
        score: 18,
        maxScore: 30,
        description: 'Meets the criterion at a satisfactory level.',
        selectedLevel: 'Satisfactory'
      })
    ]);
    expect(fixture.nativeElement.textContent).toContain('This overall score is calculated from the assignment’s custom rubric.');
    expect(fixture.nativeElement.textContent).toContain('Content Accuracy');
    expect(fixture.nativeElement.textContent).toContain('Selected level: Satisfactory');
    expect(fixture.nativeElement.textContent).toContain('18.0 / 30');
    expect(fixture.nativeElement.textContent).not.toContain('Normalized weight:');
    expect(fixture.nativeElement.querySelector('.score-badge')).toBeTruthy();
  });

  it('keeps no-rubric completed results on the existing fixed six-category path', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 75, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.feedback = {
      submissionId: 'submission-1',
      scoringAudit: { overallMethod: 'fixed_six_category_sum' },
      rubricScores: {
        CONTENT: { score: 15, maxScore: 20, comment: '' },
        ORGANIZATION: { score: 15, maxScore: 20, comment: '' },
        GRAMMAR: { score: 20, maxScore: 25, comment: '' },
        VOCABULARY: { score: 15, maxScore: 20, comment: '' },
        MECHANICS: { score: 7, maxScore: 10, comment: '' },
        PRESENTATION: { score: 3, maxScore: 5, comment: '' }
      }
    } as any;
    component.aiFeedbackState = 'loaded';

    expect(component.isCustomRubricResult).toBeFalse();
    expect(component.feedbacks.length).toBe(6);
  });
});
