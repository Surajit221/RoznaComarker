// Task 20: the failed correction stage on the student (and guest) result page: one notice, the retry action (no credit, no re-score),
// polling while it runs, and the corrections reloaded without a page reload when they arrive.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpHeaders } from '@angular/common/http';

import { MySubmissionPage } from './my-submission-page';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';
import { CanonicalSubmissionResultCoordinator } from '../../../../../services/canonical-submission-result-coordinator.service';

/** The private members these tests drive. */
interface PageInternals {
  feedbackApi: { getSubmissionFeedback(id: string): Promise<unknown> };
  refreshCanonicalResult(id: string, sequence: number): Promise<unknown>;
  refreshAssessmentResult(id: string): Promise<void>;
}

describe('MySubmissionPage: correction-stage retry (Task 20)', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MySubmissionPage;
  let fixture: ComponentFixture<MySubmissionPage>;
  const failed = { submissionId: 'submission-1', overallScore: 72, evaluationStatus: 'completed', detailedFeedbackStatus: 'completed',
    correctionStatus: 'partial', semanticStatus: 'failed', processingActive: false, automaticPollingAllowed: false, terminal: true };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MySubmissionPage], providers: [
        ...routedComponentProviders({ classId: 'class-1', assignmentId: 'assignment-1', submissionId: 'submission-1' }),
        ...httpTestingProviders, ...authenticatedUserProviders('student')
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(MySubmissionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.submission = { _id: 'submission-1', ocrStatus: 'completed' } as NonNullable<typeof component.submission>;
  });

  it('one notice per state: retrying, retry available, no retry left; none when corrections are fine', () => {
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    expect(component.correctionRetryNotice).toBe('Corrections could not be prepared for this draft.');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: false });
    expect(component.correctionRetryNotice).toContain('ask your teacher');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, terminal: false, processingActive: true, correctionRetryActive: true });
    expect(component.correctionRetryNotice).toContain('will appear here automatically');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionStatus: 'completed', semanticStatus: 'completed' });
    expect(component.correctionRetryNotice).toBeNull();
  });

  it('registered student: posts the correction-only retry, then polls; the score is untouched', async () => {
    const http = TestBed.inject(HttpTestingController);
    const start = spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    const done = component.retryCorrections();
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/submissions/submission-1/corrections/retry'));
    expect(req.request.headers.has('X-Guest-Token')).toBeFalse();
    req.flush({ success: true, data: { correctionRetryActive: true } }, { status: 202, statusText: 'Accepted' });
    await done;
    expect(component.canonicalResultState?.correctionRetryActive).toBeTrue();
    expect(component.canonicalResultState?.correctionRetryAllowed).toBeFalse();
    expect(component.canonicalResultState?.score).toBe(72);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('guest: uses the guest route with the guest token', async () => {
    const http = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    (component as unknown as { guestAccess: unknown }).guestAccess = {
      url: (suffix: string) => `/api/guest/submissions/submission-1/${suffix}`, headers: new HttpHeaders({ 'X-Guest-Token': 'guest-token' }) };
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    const done = component.retryCorrections();
    const req = http.expectOne(r => r.method === 'POST' && r.url === '/api/guest/submissions/submission-1/corrections/retry');
    expect(req.request.headers.get('X-Guest-Token')).toBe('guest-token');
    req.flush({ success: true }, { status: 202, statusText: 'Accepted' });
    await done;
    expect(component.canonicalResultState?.correctionRetryActive).toBeTrue();
  });

  it('already running elsewhere (409 in progress): just waits for it; any other refusal shows a message and does not poll', async () => {
    const http = TestBed.inject(HttpTestingController);
    const start = spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    let done = component.retryCorrections();
    http.expectOne(r => r.url.endsWith('/corrections/retry')).flush({ code: 'CORRECTION_RETRY_IN_PROGRESS' }, { status: 409, statusText: 'Conflict' });
    await done;
    expect(start).toHaveBeenCalledTimes(1);
    expect(component.correctionRetryError).toBeNull();
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    done = component.retryCorrections();
    http.expectOne(r => r.url.endsWith('/corrections/retry')).flush({ code: 'CORRECTION_RETRY_LIMIT_REACHED' }, { status: 409, statusText: 'Conflict' });
    await done;
    expect(start).toHaveBeenCalledTimes(1);
    expect(component.correctionRetryError).toContain('could not be started');
    expect(component.canonicalResultState?.correctionRetryActive).toBeFalse();
  });

  it('does nothing when the server does not allow a retry, and never sends two at once', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: false });
    await component.retryCorrections();
    http.expectNone(r => r.url.endsWith('/corrections/retry'));
    spyOn(TestBed.inject(CanonicalSubmissionResultCoordinator), 'start');
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true });
    const first = component.retryCorrections(), second = component.retryCorrections();
    http.expectOne(r => r.url.endsWith('/corrections/retry')).flush({ success: true }, { status: 202, statusText: 'Accepted' });
    await Promise.all([first, second]);
  });

  it('Task 22: a failed correction stage has one message: the notice; no progress banner, no contradictory statistics text', () => {
    component.isUploadedFile = false; component.scoreState = 'loaded'; component.statisticsState = 'error';
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionRetryAllowed: true, statisticsCompleteness: 'language_only',
      processingProgress: { status: 'partial', stage: 'partial', percent: 95, message: 'Analysis partially completed. Some writing details are unavailable.',
        active: false, failed: false, completed: false } });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(component.partialStatisticsMessage).toBeNull();
    expect(text).toContain('Correction statistics will appear when the corrections are ready.');
    expect(text).not.toContain('Grammar and mechanics');
    expect(text).not.toContain('retrying is safe');
    expect(text).not.toContain('Analysis partially completed');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-analysis-progress section')).toBeNull();
  });

  it("Task 22: the date under the title is this draft's submission date, not the assignment's", () => {
    component.submission = { _id: 'submission-2', submittedAt: '2026-11-05T10:00:00.000Z',
      assignment: { _id: 'assignment-1', createdAt: '2026-11-01T10:00:00.000Z', title: 'Essay' } } as unknown as NonNullable<typeof component.submission>;
    expect(component.submissionDateText).toBe(new Date('2026-11-05T10:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  });

  it('C.3b: one neutral line under the score only when the corrections arrived after the score', () => {
    const line = () => (fixture.nativeElement as HTMLElement).querySelector('.score-before-corrections');
    component.scoreState = 'loaded'; component.isUploadedFile = false;   // the evaluation view holds the score card
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionStatus: 'completed', semanticStatus: 'completed', terminal: true });
    fixture.detectChanges();
    expect(line()).toBeNull();
    component.canonicalResultState = normalizeCanonicalResult({ ...failed, correctionStatus: 'completed', semanticStatus: 'completed', terminal: true,
      scoreBeforeCorrections: true });
    fixture.detectChanges();
    expect(line()?.textContent?.trim()).toBe('The score was calculated before the detailed corrections were available.');
  });

  it('late corrections: when the retried stage completes after the score, the annotations reload without a page reload', async () => {
    const page = component as unknown as PageInternals;
    const reload = spyOn(page, 'refreshAssessmentResult').and.resolveTo();
    const feedback = spyOn(page.feedbackApi, 'getSubmissionFeedback');
    feedback.and.resolveTo({ ...failed, terminal: false, processingActive: true, automaticPollingAllowed: true, correctionRetryActive: true,
      assessmentCompletedAt: '2026-11-06T10:00:00.000Z' });
    await page.refreshCanonicalResult('submission-1', 1);
    await page.refreshCanonicalResult('submission-1', 2);
    expect(reload).toHaveBeenCalledTimes(1);   // the score was already complete: once, as before
    feedback.and.resolveTo({ ...failed, correctionStatus: 'completed', semanticStatus: 'completed', assessmentCompletedAt: '2026-11-06T10:00:00.000Z' });
    await page.refreshCanonicalResult('submission-1', 3);
    expect(reload).toHaveBeenCalledTimes(2);   // the corrections arrived: reloaded once more
    await page.refreshCanonicalResult('submission-1', 4);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(component.correctionRetryNotice).toBeNull();
  });
});
