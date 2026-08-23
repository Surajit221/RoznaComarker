import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';

import { StudentSubmissionPages } from './student-submission-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';
import type { FeedbackAnnotation } from '../../../../../models/feedback-annotation.model';
import { CorrectionOverlay } from '../../../../../components/correction-overlay/correction-overlay';

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

  it('does not pass the protected raw submission URL to the teacher image overlay', () => {
    component.currentSubmission = { fileUrl: '/files/submissions/private.jpg' } as any;
    component.submissionFileUrls = ['/files/submissions/private.jpg'];
    component.essayImageUrl = null;
    component.imageMediaState = 'fetching';
    fixture.detectChanges();

    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect(overlay.imageUrl).toBeNull();
    expect(overlay.sourceLoading).toBeTrue();
    expect(overlay.displayImageUrl).toBeNull();
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

  it('stops previous polling and rebuilds submission-specific state on navigation', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overallScore: 42 } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', evaluationStatus: 'stale',
      evaluationStaleReason: 'rubric', requiresCanonicalReevaluation: true
    });
    const stop = spyOn((component as any).resultCoordinator, 'stop');
    spyOn<any>(component, 'loadAssignmentRubricPresence').and.resolveTo();
    spyOn<any>(component, 'ensureClassSettingsLoadedFromSubmission').and.resolveTo();
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn<any>(component, 'loadFeedback').and.callFake(async () => {
      expect(component.currentFeedback).toBeNull();
      expect(component.canonicalResultState).toBeNull();
      component.currentFeedback = { submissionId: 'submission-2', overallScore: 84 } as any;
      component.canonicalResultState = normalizeCanonicalResult({
        submissionId: 'submission-2', evaluationStatus: 'completed',
        detailedFeedbackStatus: 'completed', overallScore: 84
      });
      return true;
    });
    const markReviewed = spyOn((component as any).feedbackApi, 'markSubmissionReviewed').and.resolveTo({
      teacherReviewedAt: '2026-08-22T00:00:00.000Z', teacherReviewedBy: 'teacher-1'
    });
    const syncDashboard = spyOn((component as any).teacherDashboardState, 'markReviewed');

    await (component as any).applyCurrentSubmission({ _id: 'submission-2' } as any, false);

    expect(stop).toHaveBeenCalled();
    expect(component.currentFeedback?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.evaluationStatus).toBe('completed');
    expect(markReviewed).toHaveBeenCalledOnceWith('submission-2');
    expect(syncDashboard).toHaveBeenCalledOnceWith('submission-2');
  });

  it('rejects an older feedback response after the active submission changes', async () => {
    let resolveFeedback!: (value: any) => void;
    const response = new Promise<any>((resolve) => { resolveFeedback = resolve; });
    component.currentSubmission = { _id: 'submission-1' } as any;
    (component as any).applyCurrentSubmissionSeq = 10;
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.returnValue(response);

    const loading = (component as any).loadFeedback(10);
    component.currentSubmission = { _id: 'submission-2' } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-2', evaluationStatus: 'completed', overallScore: 84
    });
    (component as any).applyCurrentSubmissionSeq = 11;
    resolveFeedback({
      submissionId: 'submission-1', evaluationStatus: 'stale',
      evaluationStaleReason: 'rubric', requiresCanonicalReevaluation: true
    });

    await expectAsync(loading).toBeResolvedTo(false);
    expect(component.canonicalResultState?.submissionId).toBe('submission-2');
    expect(component.canonicalResultState?.evaluationStatus).toBe('completed');
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
    component.hasAssignmentRubric = true;
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

  it('keeps active annotations stable for the selected teacher image', () => {
    component.submissionFileIds = ['file-1', 'file-2'];
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.annotations = [
      { _id: 'a-1', fileId: 'file-1' },
      { _id: 'a-2', fileId: 'file-2' }
    ] as FeedbackAnnotation[];

    const firstRead = component.activeAnnotations;
    fixture.detectChanges();
    const secondRead = component.activeAnnotations;

    expect(firstRead.map((annotation) => annotation._id)).toEqual(['a-1']);
    expect(secondRead).toBe(firstRead);
  });

  it('updates active annotations when the selected teacher image changes', () => {
    component.submissionFileIds = ['file-1', 'file-2'];
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.annotations = [
      { _id: 'a-1', fileId: 'file-1' },
      { _id: 'a-2', fileId: 'file-2' }
    ] as FeedbackAnnotation[];

    expect(component.activeAnnotations.map((annotation) => annotation._id)).toEqual(['a-1']);
    component.activeFileIndex = 1;

    expect(component.activeAnnotations.map((annotation) => annotation._id)).toEqual(['a-2']);
  });

  it('Generate AI Feedback triggers canonical evaluation and never assigns a legacy preview', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overallScore: 77 } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed'
    });
    const retry = spyOn((component as any).submissionApi, 'retryCanonicalEvaluation')
      .and.resolveTo(undefined);
    const legacy = spyOn((component as any).feedbackApi, 'generateAiSubmissionFeedback');
    const start = spyOn((component as any).resultCoordinator, 'start');

    await component.reEvaluateCurrentSubmission();

    expect(retry).toHaveBeenCalledOnceWith('submission-1');
    expect(start).toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    expect(component.currentFeedback?.previousEvaluation?.overallScore).toBe(77);
    expect(component.canonicalResultState?.evaluationStatus).toBe('processing');
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('does not create fake fixed-category zeros while canonical evaluation is processing', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    component.currentFeedback = { submissionId: 'submission-1', rubricScores: null } as any;
    component.aiFeedbackState = 'processing';
    (component as any).recomputeRubricFeedbackItems();
    fixture.detectChanges();

    expect(component.rubricFeedbackItems).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
  });

  it('renders custom criteria through the original fixed-category row layout', () => {
    component.hasAssignmentRubric = true;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 60, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.currentFeedback = {
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
    (component as any).recomputeRubricFeedbackItems();
    fixture.detectChanges();

    expect(component.isCustomRubricResult).toBeTrue();
    expect(component.rubricFeedbackItems).toEqual([
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

  it('applies completed feedback and rebuilds custom rows in the same polling tick', async () => {
    component.hasAssignmentRubric = true;
    component.assignmentId = 'assignment-1';
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1',
      evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed',
      overallScore: 60,
      scoringAudit: { overallMethod: 'custom_rubric_weighted_total' },
      customRubricScores: { overallScore: 60, criteria: [{
        criterionId: 'criterion-1', title: 'Content Accuracy', normalizedWeight: 30,
        selectedLevel: 'Satisfactory', configuredLevelPercentage: 60,
        weightedPoints: 18, comment: 'Current rubric explanation.'
      }] }
    } as any);
    spyOn((component as any).submissionApi, 'getSubmissionsByAssignment')
      .and.resolveTo([{ _id: 'submission-1', evaluationStatus: 'completed' } as any]);
    const invalidate = spyOn((component as any).teacherDashboardState, 'invalidateEvaluationFreshness');

    await (component as any).refreshRetriedAnalysis('submission-1');

    expect(component.currentFeedback?.overallScore).toBe(60);
    expect(component.rubricFeedbackItems).toEqual([
      jasmine.objectContaining({ category: 'Content Accuracy', score: 18, maxScore: 30 })
    ]);
    expect(component.aiFeedbackState).toBe('loaded');
    expect(invalidate).toHaveBeenCalledOnceWith('assignment-1');
  });

  it('shows completed score rows while detailed feedback is still processing', async () => {
    component.assignmentId = 'assignment-1';
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    spyOn<any>(component, 'loadCompleteTranscript').and.resolveTo();
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1',
      evaluationStatus: 'completed',
      detailedFeedbackStatus: 'processing',
      overallScore: 75,
      scoringAudit: { overallMethod: 'fixed_six_category_sum' },
      rubricScores: {
        CONTENT: { score: 15, maxScore: 20 }, ORGANIZATION: { score: 15, maxScore: 20 },
        GRAMMAR: { score: 20, maxScore: 25 }, VOCABULARY: { score: 15, maxScore: 20 },
        MECHANICS: { score: 7, maxScore: 10 }, PRESENTATION: { score: 3, maxScore: 5 }
      }
    } as any);
    spyOn((component as any).submissionApi, 'getSubmissionsByAssignment')
      .and.resolveTo([{ _id: 'submission-1', evaluationStatus: 'completed' } as any]);

    const snapshot = await (component as any).refreshRetriedAnalysis('submission-1');

    expect(snapshot.canonical.detailedFeedbackStatus).toBe('processing');
    expect(component.aiFeedbackState).toBe('loaded');
    expect(component.feedbackState).toBe('processing');
    expect(component.rubricFeedbackItems.length).toBe(6);
    expect(component.detailedFeedbackDisplay.message).toContain('Preparing detailed feedback');
  });

  it('does not offer re-evaluation for a teacher-overridden result', () => {
    component.currentFeedback = { submissionId: 'submission-1', overriddenByTeacher: true } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'stale', detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true, overriddenByTeacher: true
    });
    expect(component.canGenerateAiFeedback).toBeFalse();
    expect(component.evaluationStatusPresentation.showAction).toBeFalse();
  });

  it('keeps the fixed six-category cards for completed no-rubric results', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
      overallScore: 75, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.currentFeedback = {
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
    (component as any).recomputeRubricFeedbackItems();

    expect(component.isCustomRubricResult).toBeFalse();
    expect(component.rubricFeedbackItems.length).toBe(6);
  });

  it('uses the existing rubric control as Create Rubric until a saved assignment rubric exists', async () => {
    component.hasAssignmentRubric = false;
    for (const width of [1440, 390]) {
      (component.device as any).width.set(width);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Create Rubric');
      expect(fixture.nativeElement.textContent).not.toContain('View / Edit Rubric');
    }

    const hydrate = spyOn<any>(component, 'hydrateRubricDesignerFromAssignmentThenFeedback');
    await component.onEditRubric();
    expect(component.showDialog).toBeTrue();
    expect(component.rubricDesignerForModal).toBeNull();
    expect(hydrate).not.toHaveBeenCalled();

    component.closeRubricDesignerDialog();
    component.hasAssignmentRubric = true;
    (component.device as any).width.set(1440);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('View / Edit Rubric');
    expect(fixture.nativeElement.textContent).not.toContain('Create Rubric');
  });

  it('prevents duplicate Generate AI Feedback calls while evaluation is pending', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });
    const retry = spyOn((component as any).submissionApi, 'retryCanonicalEvaluation');

    await component.reEvaluateCurrentSubmission();

    expect(component.canGenerateAiFeedback).toBeFalse();
    expect(retry).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('shows a stale previous result and routes the contextual action through canonical generation', () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true,
      evaluationStaleReason: 'rubric',
      terminal: true
    });
    component.scoreState = 'loaded';
    const reEvaluate = spyOn(component, 'reEvaluateCurrentSubmission').and.resolveTo();

    (component.device as any).width.set(390);
    component.onTabSelected('transcribed-text');
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.state).toBe('stale');
    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Re-evaluation required');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    const action = fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    ) as HTMLButtonElement;
    expect(action).toBeTruthy();
    action.click();
    expect(reEvaluate).toHaveBeenCalled();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });

  it('uses the same explicit rubric-stale condition on desktop and mobile', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      evaluationStaleReason: 'rubric',
      manualRetryAllowed: true
    });
    for (const width of [1440, 390]) {
      (component.device as any).width.set(width);
      expect(component.evaluationStatusPresentation.actionLabel)
        .toBe('Re-evaluate with current rubric');
      expect(component.evaluationStatusPresentation.showAction).toBeTrue();
    }
  });

  it('shows re-evaluation progress without fake zeros or duplicate actions', () => {
    component.currentFeedback = {
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
    (component as any).recomputeRubricFeedbackItems();
    (component.device as any).width.set(390);
    component.onTabSelected('transcribed-text');
    fixture.detectChanges();

    expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Re-evaluating…');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    )).toBeNull();
  });

  it('preserves the previous score after evaluation failure and protects teacher overrides', () => {
    component.currentFeedback = {
      submissionId: 'submission-1',
      previousEvaluation: { overallScore: 72 }
    } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'failed',
      detailedFeedbackStatus: 'blocked',
      manualRetryAllowed: true
    });
    component.scoreState = 'loaded';
    (component.device as any).width.set(390);
    component.onTabSelected('transcribed-text');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Re-evaluation could not be completed.');
    expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Try re-evaluation again"]'
    )).toBeTruthy();

    component.canonicalResultState = normalizeCanonicalResult({
      correctionStatus: 'completed',
      semanticStatus: 'completed',
      evaluationStatus: 'stale',
      detailedFeedbackStatus: 'stale',
      manualRetryAllowed: true,
      overriddenByTeacher: true
    });
    fixture.detectChanges();
    expect(component.evaluationStatusPresentation.showAction).toBeFalse();
    expect(fixture.nativeElement.querySelector(
      'button[aria-label="Re-evaluate with current rubric"]'
    )).toBeNull();
  });

  it('saving a submission rubric does not invoke legacy rubric score generation', async () => {
    component.currentSubmission = { _id: 'submission-1' } as any;
    component.currentFeedback = { submissionId: 'submission-1', overriddenByTeacher: true } as any;
    spyOn<any>(component, 'isRubricDesignerStateEmpty').and.returnValue(false);
    spyOn((component as any).feedbackApi, 'upsertSubmissionFeedback')
      .and.resolveTo(component.currentFeedback);
    const legacy = spyOn((component as any).feedbackApi, 'generateRubricDesignerAi');

    await component.saveRubricAndRegenerate();

    expect(legacy).not.toHaveBeenCalled();
    expect(component.currentFeedback?.overriddenByTeacher).toBeTrue();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach((request) => request.flush({ success: true, data: {} }));
  });
});
