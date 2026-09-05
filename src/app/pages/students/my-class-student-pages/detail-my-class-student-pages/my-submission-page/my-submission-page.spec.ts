import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';

import { MySubmissionPage } from './my-submission-page';
import { CorrectionOverlay } from '../../../../../components/correction-overlay/correction-overlay';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import { normalizeCanonicalResult } from '../../../../../utils/canonical-result-state.util';

describe('MySubmissionPage', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MySubmissionPage;
  let fixture: ComponentFixture<MySubmissionPage>;

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

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

  it('shares one OCR network request and invalidates it only when source identity changes', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.submission = { _id: 'submission-1', correctionSourceHash: 'source-1' } as any;
    const first = (component as any).getOcrPayload('submission-1', 'initial');
    const shared = (component as any).getOcrPayload('submission-1', 'tab');
    const request = http.expectOne((candidate) => candidate.url.endsWith('/submissions/submission-1/ocr-corrections'));
    expect(request.request.urlWithParams).not.toContain('fileId=');
    request.flush({ success: true, data: { processing: false, ocrStatus: 'completed', ocr: [], corrections: [] } });
    await Promise.all([first, shared]);
    await (component as any).getOcrPayload('submission-1', 'tab');
    http.expectNone((candidate) => candidate.url.includes('/ocr-corrections'));

    (component.submission as any).correctionSourceHash = 'source-2';
    const changed = (component as any).getOcrPayload('submission-1', 'initial');
    http.expectOne((candidate) => candidate.url.endsWith('/submissions/submission-1/ocr-corrections'))
      .flush({ success: true, data: { processing: false, ocrStatus: 'completed', ocr: [], corrections: [] } });
    await changed;
  });

  it('does not permanently cache a processing OCR response and applies the later completed state', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.submission = { _id: 'submission-1', ocrStatus: 'processing' } as any;
    const first = (component as any).getOcrPayload('submission-1', 'initial');
    http.expectOne((request) => request.url.includes('/ocr-corrections')).flush({
      success: true, data: { processing: true, ocrStatus: 'processing', ocr: [], corrections: [] }
    });
    await first;

    const second = (component as any).getOcrPayload('submission-1', 'completion');
    http.expectOne((request) => request.url.includes('/ocr-corrections')).flush({
      success: true, data: { processing: false, ocrStatus: 'completed', correctionSourceHash: 'source-2',
        ocr: [{ fileId: 'file-1', pageNumber: 1, text: 'Completed transcript', words: [] }], corrections: [] }
    });
    const completed = await second;
    (component as any).applyOcrPayloadState('submission-1', completed.data);
    expect(component.ocrStatus).toBe('completed');
    expect(component.isOcrPending).toBeFalse();
  });

  it('reconciles completed multi-page OCR state and renders both transcript pages ready', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.submission = { _id: 'submission-1', ocrStatus: 'processing', correctionStatus: 'processing' } as any;
    component.submissionFileIds = ['file-1', 'file-2'];
    spyOn<any>(component, 'ensureWritingCorrectionsLegendLoaded').and.resolveTo();
    const corrections = (component as any).loadOcrCorrections('submission-1');
    const transcript = (component as any).loadCompleteTranscript('submission-1');
    const request = http.expectOne((candidate) => candidate.url.includes('/ocr-corrections'));
    request.flush({ success: true, data: { processing: false, ocrStatus: 'completed', correctionStatus: 'completed',
      semanticStatus: 'completed', correctionSourceHash: 'source-complete',
      statistics: { content: 6, grammar: 37, organization: 2, vocabulary: 5, mechanics: 4, total: 54 },
      corrections: [], ocr: [
        { fileId: 'file-1', pageNumber: 1, text: 'Submitted Page 1', words: [] },
        { fileId: 'file-2', pageNumber: 1, text: 'Submitted Page 2', words: [] }
      ] } });
    await Promise.all([corrections, transcript]);

    expect(component.ocrStatus).toBe('completed');
    expect(component.isOcrPending).toBeFalse();
    expect(component.submission?.correctionStatus).toBe('completed');
    expect(component.transcriptPageViews.map((page) => page.status)).toEqual(['ready', 'ready']);
    expect(component.transcriptPageViews.map((page) => page.text)).toEqual(['Submitted Page 1', 'Submitted Page 2']);
    expect((component.submission as any).correctionSourceHash).toBe('source-complete');
    expect(component.submission?.correctionStatistics?.grammar).toBe(37);
    component.transcriptState = 'loaded';
    component.isUploadedFile = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Submitted Page 1');
    expect(fixture.nativeElement.textContent).toContain('Submitted Page 2');
    expect(fixture.nativeElement.textContent).not.toContain('OCR is processing your file...');
    expect(fixture.nativeElement.textContent).not.toContain("Preparing this page's transcript...");
  });

  it('does not let an old OCR response mutate a newly selected submission', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.submission = { _id: 'old-submission', ocrStatus: 'processing' } as any;
    component.submissionFileIds = ['old-file'];
    const loading = (component as any).loadCompleteTranscript('old-submission');
    const request = http.expectOne((candidate) => candidate.url.includes('/old-submission/ocr-corrections'));
    component.submission = { _id: 'new-submission', ocrStatus: 'processing' } as any;
    request.flush({ success: true, data: { processing: false, ocrStatus: 'completed',
      ocr: [{ fileId: 'old-file', pageNumber: 1, text: 'Old transcript', words: [] }], corrections: [] } });
    await loading;
    expect(component.submission!._id).toBe('new-submission');
    expect(component.submission!.ocrStatus).toBe('processing');
    expect(component.transcriptPageViews).toEqual([]);
  });

  it('keeps intermediate polling scoped to feedback until completion', async () => {
    component.submission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    const submissionRefresh = spyOn((component as any).submissionApi, 'getMySubmissionByAssignmentId');
    const ocr = spyOn<any>(component, 'loadOcrCorrections');
    const transcript = spyOn<any>(component, 'loadCompleteTranscript');
    const writing = spyOn<any>(component, 'refreshWritingCorrections');
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', evaluationStatus: 'processing', detailedFeedbackStatus: 'processing',
      processingActive: true, automaticPollingAllowed: true, terminal: false
    });

    const snapshot = await (component as any).refreshCanonicalResult('submission-1', 1);

    expect(snapshot.canonical.evaluationStatus).toBe('processing');
    expect(submissionRefresh).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
    expect(transcript).not.toHaveBeenCalled();
    expect(writing).not.toHaveBeenCalled();
  });

  it('performs only one OCR reconciliation when completed feedback overtakes stale local OCR state', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.assignmentId = 'assignment-1';
    component.submission = { _id: 'submission-1', ocrStatus: 'processing' } as any;
    component.submissionFileIds = ['file-1'];
    spyOn<any>(component, 'ensureWritingCorrectionsLegendLoaded').and.resolveTo();
    spyOn((component as any).submissionApi, 'getMySubmissionByAssignmentId').and.resolveTo({
      _id: 'submission-1', assignment: 'assignment-1', ocrStatus: 'completed', correctionSourceHash: 'source-final'
    } as any);
    spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', overallScore: 67, evaluationStatus: 'completed', correctionStatus: 'completed',
      detailedFeedbackStatus: 'completed', processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    const completed = (component as any).refreshCanonicalResult('submission-1', 1);
    await Promise.resolve();
    http.expectOne((candidate) => candidate.url.includes('/ocr-corrections')).flush({ success: true, data: {
      processing: false, ocrStatus: 'completed', correctionStatus: 'completed', correctionSourceHash: 'source-final',
      statistics: { content: 6, grammar: 37, organization: 2, vocabulary: 5, mechanics: 4, total: 54 },
      corrections: [], ocr: [{ fileId: 'file-1', pageNumber: 1, text: 'Final transcript', words: [] }]
    } });
    await completed;
    await (component as any).refreshCanonicalResult('submission-1', 2);
    http.expectNone((candidate) => candidate.url.includes('/ocr-corrections'));
    expect(component.feedback?.overallScore).toBe(67);
    expect(component.ocrStatus).toBe('completed');
    expect(component.transcriptPageViews[0].status).toBe('ready');
    expect((component as any).submissionApi.getMySubmissionByAssignmentId).toHaveBeenCalledTimes(1);
  });

  it('keeps activeAnnotations reference stable until its source or selected file changes', () => {
    component.submissionFileIds = ['file-1', 'file-2'];
    component.activeFileIndex = 0;
    component.annotations = [
      { _id: 'a1', fileId: 'file-1', symbol: 'AGR' },
      { _id: 'a2', fileId: 'file-2', symbol: 'P' }
    ] as any;

    const first = component.activeAnnotations;
    expect(component.activeAnnotations).toBe(first);
    component.feedbackState = 'loading';
    fixture.detectChanges();
    expect(component.activeAnnotations).toBe(first);

    component.activeFileIndex = 1;
    const secondFile = component.activeAnnotations;
    expect(secondFile).not.toBe(first);
    expect(secondFile.map((annotation) => annotation._id)).toEqual(['a2']);

    component.annotations = [...component.annotations];
    expect(component.activeAnnotations).not.toBe(secondFile);
  });

  it('does not start polling when reopening a completed unchanged submission', () => {
    component.submission = { _id: 'submission-1', ocrStatus: 'completed' } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', evaluationCurrent: true,
      processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    const start = spyOn((component as any).resultCoordinator, 'start');

    (component as any).syncOcrPolling();

    expect(start).not.toHaveBeenCalled();
    expect(component.isOcrPolling).toBeFalse();
  });

  it('renders completed feedback while the initial OCR request is still slow', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.submission = { _id: 'submission-1', correctionSourceHash: 'source-1' } as any;
    (component as any).loadSeq = 7;
    const slowOcr = (component as any).getOcrPayload('submission-1', 'initial');
    const request = http.expectOne((candidate) => candidate.url.includes('/ocr-corrections'));
    spyOn((component as any).feedbackApi, 'getSubmissionFeedback').and.resolveTo({
      submissionId: 'submission-1', overallScore: 93, evaluationStatus: 'completed',
      detailedFeedbackStatus: 'completed', evaluationCurrent: true,
      processingActive: false, automaticPollingAllowed: false, terminal: true
    });

    await (component as any).loadAndApplyFeedback('submission-1', 7, 'initial');

    expect(component.feedback?.overallScore).toBe(93);
    expect(component.scoreState).toBe('loaded');
    request.flush({ success: true, data: { ocr: [], corrections: [] } });
    await slowOcr;
  });

  it('component destruction stops polling and clears request caches', () => {
    const stop = spyOn((component as any).resultCoordinator, 'stop');
    (component as any).ocrPayloadCache.set('submission-1:source-1', {});
    component.isOcrPolling = true;

    component.ngOnDestroy();

    expect(stop).toHaveBeenCalled();
    expect(component.isOcrPolling).toBeFalse();
    expect((component as any).ocrPayloadCache.size).toBe(0);
  });

  it('keeps one canonical result tree and state across viewport changes', () => {
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', statisticsCompleteness: 'canonical',
      correctionStatistics: { content: 0, grammar: 4, organization: 0, vocabulary: 0, mechanics: 2 },
      overallScore: 36.5, grade: 'F', processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.scoreState = 'loaded';
    component.statisticsState = 'loaded';
    component.correctionsState = 'loaded';
    component.isUploadedFile = false;
    component.teacherComment = 'Canonical teacher comment';
    component.hasAssignmentRubric = true;
    component.feedbackForm.patchValue({ message: component.teacherComment });

    const snapshot = () => ({
      state: component.canonicalResultState,
      score: component.overallScoreText,
      grade: component.gradeLabel,
      counts: [component.contentIssuesDisplay, component.grammarIssuesDisplay,
        component.organizationIssuesDisplay, component.vocabularyIssuesDisplay, component.mechanicsIssuesDisplay],
      comment: component.feedbackForm.value.message
    });
    fixture.detectChanges();
    const desktop = snapshot();
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    const mobile = snapshot();

    expect(mobile).toEqual(desktop);
    expect(mobile.counts).toEqual([0, 4, 0, 0, 2]);
    expect(fixture.nativeElement.textContent).toContain('Download PDF');
    expect(fixture.nativeElement.textContent).toContain('View Rubric');
    expect(fixture.nativeElement.textContent).toContain('Teacher Comments');
    expect(fixture.nativeElement.querySelector('app-adaptive-writing-studio')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.submission-review-page').length).toBe(1);
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
    component.isUploadedFile = false;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange')); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Correction analysis completed, but scoring and detailed feedback could not be generated.');
      expect(fixture.nativeElement.textContent).not.toContain('Retry scoring');
    }
    expect((component as any).retryCanonicalAnalysis).toBeUndefined();
  });

  it('passes only the selected page annotations to the shared correction overlay', () => {
    component.submissionFileUrls = ['image-1.jpg'];
    component.submissionFileIds = ['file-1'];
    component.annotations = [{ _id: 'student-a-1', fileId: 'file-1' }] as any;
    fixture.detectChanges();

    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay))
      .componentInstance as CorrectionOverlay;
    expect((overlay.annotations || []).map((annotation) => annotation._id)).toEqual(['student-a-1']);
  });

  it('keeps shared thumbnails after the uploaded image and before AI feedback', () => {
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.submissionPreviewUrls = ['blob:image-1', 'blob:image-2'];
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('app-correction-overlay') as HTMLElement;
    const thumbnails = fixture.nativeElement.querySelector('.submission-thumbs') as HTMLElement;
    const aiFeedback = fixture.nativeElement.querySelector('#ai-feedback-section') as HTMLElement;

    expect(overlay.compareDocumentPosition(thumbnails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thumbnails.compareDocumentPosition(aiFeedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thumbnails.querySelectorAll('.submission-thumb').length).toBe(2);
  });

  it('changes only student viewer state and preserves feedback/adaptive state on image selection', async () => {
    const savedFeedback = { submissionId: 'submission-1', overallScore: 91 } as any;
    const savedAdaptive = [{ skill: 'grammar', score: 91 }] as any;
    component.submission = { _id: 'submission-1' } as any;
    component.submissionFileUrls = ['image-1.jpg', 'image-2.jpg'];
    component.feedback = savedFeedback;
    component.adaptiveSkillScores = savedAdaptive;
    spyOn<any>(component, 'setUploadedFileUrl').and.resolveTo();
    const loadCorrections = spyOn<any>(component, 'loadOcrCorrections').and.resolveTo(true);
    const refreshCorrections = spyOn<any>(component, 'refreshWritingCorrections').and.resolveTo();
    const loadFeedback = spyOn((component as any).feedbackApi, 'getSubmissionFeedback');

    component.onSelectSubmissionImage(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(component.activeFileIndex).toBe(1);
    expect(component.feedback).toBe(savedFeedback);
    expect(component.adaptiveSkillScores).toBe(savedAdaptive);
    expect(loadCorrections).not.toHaveBeenCalled();
    expect(refreshCorrections).not.toHaveBeenCalled();
    expect(loadFeedback).not.toHaveBeenCalled();

    component.onSelectSubmissionImage(0);
    await Promise.resolve();
    expect(component.activeFileIndex).toBe(0);
    expect(loadCorrections).not.toHaveBeenCalled();
    expect(refreshCorrections).not.toHaveBeenCalled();
    expect(loadFeedback).not.toHaveBeenCalled();
  });

  it('never exposes a protected raw image URL while the authenticated blob fetch is pending', async () => {
    const request = deferred<string>();
    spyOn<any>(component, 'fetchAsObjectUrl').and.returnValue(request.promise);

    const pending = (component as any).setUploadedFileUrl('/files/submissions/test.jpg');
    fixture.detectChanges();
    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;

    expect(component.uploadedFileUrl).toBeNull();
    expect(component.imageMediaState).toBe('fetching');
    expect(overlay.imageUrl).toBeNull();
    expect(overlay.mediaState).toBe('fetching');
    expect(fixture.nativeElement.querySelector('app-correction-overlay img')).toBeNull();

    request.resolve('blob:authenticated-image');
    await pending;
    fixture.detectChanges();
    expect(component.uploadedFileUrl).toBe('blob:authenticated-image');
    expect(overlay.imageUrl).toBe('blob:authenticated-image');
  });

  it('shows a genuine authenticated-fetch failure without falling back to the protected URL', async () => {
    spyOn<any>(component, 'fetchAsObjectUrl').and.rejectWith(new Error('unauthorized'));

    await (component as any).setUploadedFileUrl('/files/submissions/test.jpg');
    fixture.detectChanges();
    const overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;

    expect(component.uploadedFileUrl).toBeNull();
    expect(component.imageMediaState).toBe('error');
    expect(overlay.imageUrl).toBeNull();
    expect(overlay.mediaState).toBe('error');
    expect(fixture.nativeElement.querySelector('app-correction-overlay img')).toBeNull();
  });

  it('ignores and revokes a stale image response when a newer file wins the race', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const revoke = spyOn(URL, 'revokeObjectURL');
    spyOn<any>(component, 'fetchAsObjectUrl').and.returnValues(first.promise, second.promise);

    const firstLoad = (component as any).setUploadedFileUrl('/files/submissions/a.jpg');
    const secondLoad = (component as any).setUploadedFileUrl('/files/submissions/b.jpg');
    second.resolve('blob:b');
    await secondLoad;
    first.resolve('blob:a');
    await firstLoad;

    expect(component.uploadedFileUrl).toBe('blob:b');
    expect(revoke).toHaveBeenCalledWith('blob:a');
  });

  it('invalidates Draft 1 derived state when the same submission id receives Draft 2 files', () => {
    spyOn<any>(component, 'refreshSubmissionPreviewUrls').and.resolveTo();
    const draft1 = { _id: 'same-submission', ocrJobId: 'job-1', submittedAt: '2026-08-10T00:00:00Z',
      files: [{ _id: 'old-1', url: '/uploads/submissions/old-1.png' }, { _id: 'old-2', url: '/uploads/submissions/old-2.png' }] } as any;
    const draft2 = { _id: 'same-submission', ocrJobId: 'job-2', submittedAt: '2026-08-11T00:00:00Z',
      files: [{ _id: 'new-1', url: '/uploads/submissions/new-1.png' }] } as any;
    (component as any).applyCanonicalDraft(draft1, false);
    component.activeFileIndex = 1;
    component.annotations = [{ _id: 'old-correction', fileId: 'old-2' }] as any;
    (component as any).canonicalWritingCorrections = [{ id: 'old-correction', fileId: 'old-2' }];
    component.transcriptPageViews = [{ key: 'old-2:1' }] as any;

    expect((component as any).applyCanonicalDraft(draft2, true)).toBeTrue();
    expect(component.submissionFileIds).toEqual(['new-1']);
    expect(component.activeFileIndex).toBe(0);
    expect(component.activeFileId).toBe('new-1');
    expect(component.annotations).toEqual([]);
    expect((component as any).canonicalWritingCorrections).toEqual([]);
    expect(component.transcriptPageViews).toEqual([]);
    expect((component as any).hasLoadedOcrCorrections).toBeFalse();
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
    component.isUploadedFile = false;
    window.dispatchEvent(new Event('orientationchange'));
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
    component.isUploadedFile = false;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();

      expect(component.evaluationStatusPresentation.showPreviousScore).toBeTrue();
      expect(fixture.nativeElement.textContent).not.toContain('Your teacher is updating this evaluation.');
      expect(fixture.nativeElement.textContent).toContain('The updated score and feedback will appear when the evaluation is ready.');
      expect(fixture.nativeElement.textContent).toContain('Previous score: 72 / 100 (outdated)');
      expect(fixture.nativeElement.textContent).not.toContain('0.0 /');
      expect(fixture.nativeElement.querySelector('button[aria-label*="evaluation"]')).toBeNull();
    }
  });

  it('renders custom-rubric criteria through the original fixed-category row layout', () => {
    component.hasAssignmentRubric = true;
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
    fixture.detectChanges();

    expect(component.isCustomRubricResult).toBeFalse();
    expect(component.feedbacks.length).toBe(6);
    expect(fixture.nativeElement.textContent).not.toContain('View Rubric');
    expect(fixture.nativeElement.textContent).not.toContain('custom rubric');
  });

  it('hides evaluation marks at every viewport while preserving feedback and teacher comments', () => {
    component.assignment = { _id: 'assignment-1', showMarksToStudent: false } as any;
    component.canonicalResultState = normalizeCanonicalResult({
      submissionId: 'submission-1', correctionStatus: 'completed', semanticStatus: 'completed',
      evaluationStatus: 'completed', detailedFeedbackStatus: 'completed', evaluationSource: 'ai',
      overallScore: 81.5, processingActive: false, automaticPollingAllowed: false, terminal: true
    });
    component.feedback = {
      submissionId: 'submission-1',
      marksVisible: false,
      teacherComments: 'Your structure is improving.',
      rubricScores: {
        CONTENT: { score: 16, maxScore: 20, comment: 'Your evidence supports the main idea.' },
        ORGANIZATION: { score: 15, maxScore: 20, comment: 'Your structure is improving.' },
        GRAMMAR: { score: 21.5, maxScore: 25, comment: 'Review sentence agreement.' },
        VOCABULARY: { score: 16, maxScore: 20, comment: 'Word choices are generally precise.' },
        MECHANICS: { score: 8, maxScore: 10, comment: 'Review comma placement.' },
        PRESENTATION: { score: 5, maxScore: 5, comment: 'Handwriting is clear and readable.' }
      }
    } as any;
    component.teacherComment = 'Your structure is improving.';
    component.feedbackForm.patchValue({ message: component.teacherComment });
    component.isUploadedFile = false;
    component.scoreState = 'loaded';
    component.feedbackState = 'loaded';
    component.aiFeedbackState = 'loaded';

    for (const width of [1440, 1280, 1024, 768, 430, 412, 390, 375, 360, 320]) {
      window.dispatchEvent(new Event(width > 768 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();

      const evaluation = fixture.nativeElement.querySelector('#ai-feedback-section') as HTMLElement;
      const banner = evaluation.querySelector('.evaluation-marks-hidden-banner') as HTMLElement;

      expect(component.marksVisible).withContext(`marks visibility at ${width}px`).toBeFalse();
      expect(banner).withContext(`hidden-marks banner at ${width}px`).toBeTruthy();
      expect(banner.textContent).toContain('Marks hidden by teacher');
      expect(banner.textContent).toContain(
        'Your teacher has hidden the grading scores for this assignment. You can still review the available feedback and comments.'
      );
      expect(evaluation.textContent).toContain('Grammar');
      expect(evaluation.textContent).toContain('Review sentence agreement.');
      expect(evaluation.textContent).toContain('Presentation & Handwriting');
      expect(evaluation.textContent).toContain('Handwriting is clear and readable.');
      expect(evaluation.textContent).toContain('Teacher Comments');
      expect(evaluation.querySelector('.score-badge')).toBeNull();
      expect(evaluation.textContent).not.toContain('21.5 / 25');
      expect(evaluation.textContent).not.toContain('5.0 / 5');
      expect((evaluation.querySelector('textarea[formControlName="message"]') as HTMLTextAreaElement).value)
        .toBe('Your structure is improving.');
    }

    expect(fixture.nativeElement.textContent).not.toContain('Download PDF');

    // The same persisted evaluation is immediately revealed when the teacher turns marks back on.
    (component.feedback as any).marksVisible = true;
    (component.assignment as any).showMarksToStudent = true;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
      const evaluation = fixture.nativeElement.querySelector('#ai-feedback-section') as HTMLElement;

      expect(component.marksVisible).toBeTrue();
      expect(evaluation.querySelector('.evaluation-marks-hidden-banner')).toBeNull();
      expect(evaluation.querySelector('.score-badge')).toBeTruthy();
      expect(evaluation.textContent).toContain('21.5 / 25');
      expect(evaluation.textContent).toContain('5.0 / 5');
    }
  });

  it('shows rubric details only when a meaningful assignment rubric exists', () => {
    component.aiFeedbackState = 'loaded';
    component.hasAssignmentRubric = false;
    component.openRubricDialog();
    expect(component.showRubricDialog).toBeFalse();
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('View Rubric');
    }

    component.hasAssignmentRubric = true;
    for (const width of [1440, 390]) {
      window.dispatchEvent(new Event(width > 1024 ? 'resize' : 'orientationchange'));
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('View Rubric');
    }
  });
});
