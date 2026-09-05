import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  beforeEach(async () => {
    api = jasmine.createSpyObj<SubmissionApiService>('SubmissionApiService', ['getDraftComparison', 'retryCanonicalEvaluation']);
    api.getDraftComparison.and.resolveTo(result);
    await TestBed.configureTestingModule({ imports: [DraftComparisonComponent], providers: [{ provide: SubmissionApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(DraftComparisonComponent);
  });

  it('shows score, category, and corrected/remaining/new issue deltas from one read-only request', async () => {
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(api.getDraftComparison).toHaveBeenCalledOnceWith('submission-2');
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
    expect(api.getDraftComparison.calls.allArgs()).toEqual([['submission-2'], ['submission-2']]);
  });

  it('shows the unchanged-content state for an identical draft', async () => {
    api.getDraftComparison.and.resolveTo({ ...result, identicalContent: true,
      overall: { previousScore: 73, currentScore: 73, delta: 0, status: 'UNCHANGED' } });
    fixture.componentRef.setInput('submissionId', 'submission-2'); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Same content as previous draft');
    expect(fixture.nativeElement.textContent).toContain('73 â†’ 73');
  });
});
