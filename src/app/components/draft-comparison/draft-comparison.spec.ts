import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { SubmissionApiService, DraftComparison } from '../../api/submission-api.service';
import { DraftComparisonComponent } from './draft-comparison';

describe('DraftComparisonComponent', () => {
  let fixture: ComponentFixture<DraftComparisonComponent>;
  let api: jasmine.SpyObj<SubmissionApiService>;
  const result: DraftComparison = { available: true, previousDraftNumber: 1, currentDraftNumber: 2,
    overall: { previousScore: 70, currentScore: 82, delta: 12, status: 'IMPROVED' },
    issues: { previousCount: 3, currentCount: 2, correctedCount: 2, remainingCount: 1, newIssueCount: 1 },
    rubricCategories: [{ categoryId: 'grammar', name: 'Grammar', previousScore: 12, currentScore: 17, delta: 5, maxScore: 20, available: true }],
    previousText: 'Old draft', currentText: 'Revised draft' };
  const currentUnassessed: DraftComparison = {
    available: false, code: 'CURRENT_UNASSESSED', message: 'Complete the assessment to see improvement.'
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<SubmissionApiService>('SubmissionApiService', ['getDraftComparison', 'retryCanonicalEvaluation']);
    api.getDraftComparison.and.resolveTo(result);
    await TestBed.configureTestingModule({ imports: [DraftComparisonComponent], providers: [{ provide: SubmissionApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(DraftComparisonComponent);
  });

  it('shows score, category, and corrected/remaining/new issue deltas from one read-only request', async () => {
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(api.getDraftComparison).toHaveBeenCalledOnceWith('submission-2', null);
    expect(text).toContain('70 → 82'); expect(text).toContain('Grammar'); expect(text).toContain('Issues corrected'); expect(text).toContain('New issues');
    expect(api.retryCanonicalEvaluation).not.toHaveBeenCalled();
  });

  it('shows a first-draft empty state', async () => {
    api.getDraftComparison.and.resolveTo({ available: false, code: 'FIRST_DRAFT', message: 'No previous assessed draft to compare yet.' });
    fixture.componentRef.setInput('submissionId', 'submission-1'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No previous assessed draft');
  });

  it('switches mobile text tabs locally without another network or assessment request', async () => {
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role="tab"]')];
    buttons[0].click(); fixture.detectChanges();
    expect(fixture.componentInstance.activeText).toBe('previous'); expect(api.getDraftComparison).toHaveBeenCalledTimes(1); expect(api.retryCanonicalEvaluation).not.toHaveBeenCalled();
  });

  it('marks incompatible rubric rows as not comparable instead of fabricating a delta', async () => {
    api.getDraftComparison.and.resolveTo({ ...result, rubricCategories: [{ name: 'Evidence', previousScore: 10, currentScore: 15, delta: null, maxScore: null, available: false, reason: 'Scale changed' }] });
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not comparable');
  });

  it('reloads when assessment completes under the same submission id', async () => {
    fixture.componentRef.setInput('submissionId', 'submission-2');
    fixture.componentRef.setInput('refreshKey', '2:pending');
    fixture.detectChanges(); await fixture.whenStable();
    api.getDraftComparison.and.resolveTo(result);
    fixture.componentRef.setInput('refreshKey', '2:completed-at');
    fixture.detectChanges(); await fixture.whenStable();
    expect(api.getDraftComparison).toHaveBeenCalledTimes(2);
    expect(api.getDraftComparison.calls.allArgs()).toEqual([
      ['submission-2', '2:pending'],
      ['submission-2', '2:completed-at']
    ]);
  });

  it('shows the unchanged-content state for an identical draft', async () => {
    api.getDraftComparison.and.resolveTo({ ...result, identicalContent: true,
      overall: { previousScore: 73, currentScore: 73, delta: 0, status: 'UNCHANGED' } });
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Same content as previous draft');
    expect(fixture.nativeElement.textContent).toContain('73 → 73');
  });

  it('schedules a retry and shows a finalizing state for CURRENT_UNASSESSED', fakeAsync(() => {
    api.getDraftComparison.and.resolveTo(currentUnassessed);
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Finalizing draft comparison');
    tick(1199); expect(api.getDraftComparison).toHaveBeenCalledTimes(1);
    tick(1); flushMicrotasks(); expect(api.getDraftComparison).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));

  it('updates with an available retry response without an input reload', fakeAsync(() => {
    api.getDraftComparison.and.returnValues(Promise.resolve(currentUnassessed), Promise.resolve(result));
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    tick(1200); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.comparison?.available).toBeTrue();
    expect(api.getDraftComparison).toHaveBeenCalledTimes(2);
  }));

  for (const code of ['FIRST_DRAFT', 'PREVIOUS_UNASSESSED', 'MARKS_HIDDEN']) {
    it(`does not retry ${code}`, fakeAsync(() => {
      api.getDraftComparison.and.resolveTo({ available: false, code, message: code });
      fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
      tick(60000); flushMicrotasks();
      expect(api.getDraftComparison).toHaveBeenCalledTimes(1);
    }));
  }

  it('stops pending retries when destroyed', fakeAsync(() => {
    api.getDraftComparison.and.resolveTo(currentUnassessed);
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    fixture.destroy(); tick(60000); flushMicrotasks();
    expect(api.getDraftComparison).toHaveBeenCalledTimes(1);
  }));

  it('cancels the old retry when the submission changes', fakeAsync(() => {
    api.getDraftComparison.and.returnValues(Promise.resolve(currentUnassessed), Promise.resolve(result));
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    fixture.componentRef.setInput('submissionId', 'submission-3'); fixture.detectChanges(); flushMicrotasks();
    tick(60000); flushMicrotasks();
    expect(api.getDraftComparison.calls.allArgs()).toEqual([['submission-2', null], ['submission-3', null]]);
  }));

  it('cancels the old retry when refreshKey changes', fakeAsync(() => {
    api.getDraftComparison.and.returnValues(Promise.resolve(currentUnassessed), Promise.resolve(result));
    fixture.componentRef.setInput('submissionId', 'submission-2');
    fixture.componentRef.setInput('refreshKey', 'pending'); fixture.detectChanges(); flushMicrotasks();
    fixture.componentRef.setInput('refreshKey', 'complete'); fixture.detectChanges(); flushMicrotasks();
    tick(60000); flushMicrotasks();
    expect(api.getDraftComparison.calls.allArgs()).toEqual([['submission-2', 'pending'], ['submission-2', 'complete']]);
  }));

  it('does not let a stale response overwrite a newer input result', fakeAsync(() => {
    let resolveOld!: (value: DraftComparison) => void;
    const oldRequest = new Promise<DraftComparison>((resolve) => { resolveOld = resolve; });
    api.getDraftComparison.and.returnValues(oldRequest, Promise.resolve(result));
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges();
    fixture.componentRef.setInput('submissionId', 'submission-3'); fixture.detectChanges(); flushMicrotasks();
    resolveOld(currentUnassessed); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.comparison?.available).toBeTrue();
  }));

  it('never overlaps comparison requests', fakeAsync(() => {
    let resolveRetry!: (value: DraftComparison) => void;
    api.getDraftComparison.and.returnValues(Promise.resolve(currentUnassessed),
      new Promise<DraftComparison>((resolve) => { resolveRetry = resolve; }));
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    tick(1200); expect(api.getDraftComparison).toHaveBeenCalledTimes(2);
    tick(20000); expect(api.getDraftComparison).toHaveBeenCalledTimes(2);
    resolveRetry(result); flushMicrotasks();
  }));

  it('bounds CURRENT_UNASSESSED retries to thirty seconds', fakeAsync(() => {
    api.getDraftComparison.and.resolveTo(currentUnassessed);
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    tick(60000); flushMicrotasks();
    expect(api.getDraftComparison).toHaveBeenCalledTimes(8);
  }));

  it('stops after an HTTP failure instead of polling indefinitely', fakeAsync(() => {
    api.getDraftComparison.and.rejectWith({ status: 500 });
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); flushMicrotasks();
    tick(60000); flushMicrotasks(); fixture.detectChanges();
    expect(api.getDraftComparison).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('could not be loaded');
  }));
});
