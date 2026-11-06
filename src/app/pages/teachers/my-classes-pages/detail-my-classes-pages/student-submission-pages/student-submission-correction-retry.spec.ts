// Task 20: the teacher's retry after a failed correction stage retries the correction stage alone (no credit, no re-score, works under a
// teacher override); while it runs the score and an unsent comment are left alone; the corrections reload once when they arrive.
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentSubmissionPages } from './student-submission-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';
import { CanonicalSubmissionResultCoordinator } from '../../../../../services/canonical-submission-result-coordinator.service';

/** The private members these tests drive. */
interface PageInternals {
  submissionApi: { retryCorrectionStage(id: string): Promise<void>; regenerateCanonicalCorrections(id: string): Promise<void>; retryCanonicalEvaluation(id: string): Promise<void> };
  feedbackApi: { getSubmissionFeedback(id: string): Promise<unknown> };
  refreshRetriedAnalysis(id: string, sequence?: number): Promise<unknown>;
  refreshAssessmentResult(id: string, sequence?: number): Promise<void>;
}
type Page = PageInternals;

describe('StudentSubmissionPages: correction-stage retry (Task 20)', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: StudentSubmissionPages;
  let fixture: ComponentFixture<StudentSubmissionPages>;
  const failed = { submissionId: 'submission-1', overallScore: 72, evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
    correctionStatus: 'partial', semanticStatus: 'failed', processingActive: false, automaticPollingAllowed: false, terminal: true,
    manualRetryAllowed: true, teacherComments: 'Saved comment' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('teacher')
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.currentSubmission = { _id: 'submission-1', ocrStatus: 'completed' } as unknown as NonNullable<typeof component.currentSubmission>;
  });

  it('retry after a failed correction stage calls the correction-only endpoint, never the full regenerate, even under a teacher override', async () => {
    const api = (component as unknown as Page).submissionApi;
    const only = spyOn(api, 'retryCorrectionStage').and.resolveTo();
    const regenerate = spyOn(api, 'regenerateCanonicalCorrections').and.resolveTo();
    const evaluationOnly = spyOn(api, 'retryCanonicalEvaluation').and.resolveTo();
    const start = spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    component.currentFeedback = { overriddenByTeacher: true, overallScore: 72 } as unknown as NonNullable<typeof component.currentFeedback>;
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true, teacherOverride: true });
    await component.reEvaluateCurrentSubmission();
    expect(only).toHaveBeenCalledOnceWith('submission-1');
    expect(regenerate).not.toHaveBeenCalled(); expect(evaluationOnly).not.toHaveBeenCalled();
    expect(component.canonicalResultState?.correctionRetryActive).toBeTrue();
    expect(component.canonicalResultState?.score).toBe(72);
    expect(start).toHaveBeenCalledTimes(1);
    expect(component.correctionRetryNotice).toContain('score does not change');
  });

  it('without the correction-only retry the existing full retry is unchanged', async () => {
    const api = (component as unknown as Page).submissionApi;
    const only = spyOn(api, 'retryCorrectionStage').and.resolveTo();
    const regenerate = spyOn(api, 'regenerateCanonicalCorrections').and.resolveTo();
    spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: false });
    await component.reEvaluateCurrentSubmission();
    expect(only).not.toHaveBeenCalled();
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it('while the corrections are retried an unsent comment is kept; the corrections reload once when they arrive', async () => {
    const page = component as unknown as Page;
    const reload = spyOn(page, 'refreshAssessmentResult').and.resolveTo();
    const feedback = spyOn(page.feedbackApi, 'getSubmissionFeedback');
    component.feedbackForm.patchValue({ message: 'Unsent teacher comment' });
    feedback.and.resolveTo({ ...failed, terminal: false, processingActive: true, automaticPollingAllowed: true, correctionRetryActive: true });
    await page.refreshRetriedAnalysis('submission-1');
    await page.refreshRetriedAnalysis('submission-1');
    expect(reload).not.toHaveBeenCalled();
    expect(component.feedbackForm.value.message).toBe('Unsent teacher comment');
    feedback.and.resolveTo({ ...failed, correctionStatus: 'completed', semanticStatus: 'completed', manualRetryAllowed: false });
    await page.refreshRetriedAnalysis('submission-1');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(component.feedbackForm.value.message).toBe('Unsent teacher comment');
    expect(component.correctionRetryNotice).toBeNull();
  });
});
