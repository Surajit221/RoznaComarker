import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { DeviceService } from '../../../../../services/device.service';
import { DialogViewSubmissions } from './dialog-view-submissions';
import { AssignmentApiService } from '../../../../../api/assignment-api.service';
import { TeacherDashboardStateService } from '../../../../../services/teacher-dashboard-state.service';
import { Subject } from 'rxjs';

describe('DialogViewSubmissions loading states', () => {
  let component: DialogViewSubmissions;
  let fixture: ComponentFixture<DialogViewSubmissions>;
  let resolveRequest: (value: BackendSubmission[]) => void;
  let rejectRequest: () => void;
  const api = {
    getSubmissionsByAssignment: jasmine.createSpy().and.callFake(() => new Promise<BackendSubmission[]>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    })),
  };
  const assignmentApi = {
    getStaleEvaluationSummary: jasmine.createSpy().and.resolveTo({
      assignmentId: 'assignment-a', eligibleCount: 0, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    }),
    retryStaleEvaluations: jasmine.createSpy()
  };
  const alert = {
    showError: jasmine.createSpy(),
    showConfirm: jasmine.createSpy().and.resolveTo(true),
    showToast: jasmine.createSpy()
  };
  const freshnessInvalidated = new Subject<string>();
  const dashboardState = {
    evaluationFreshnessInvalidated$: freshnessInvalidated.asObservable(),
    invalidateEvaluationFreshness: (assignmentId: string) => freshnessInvalidated.next(assignmentId)
  };

  beforeEach(async () => {
    api.getSubmissionsByAssignment.calls.reset();
    api.getSubmissionsByAssignment.and.callFake(() => new Promise<BackendSubmission[]>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    }));
    assignmentApi.getStaleEvaluationSummary.calls.reset();
    assignmentApi.getStaleEvaluationSummary.and.resolveTo({
      assignmentId: 'assignment-a', eligibleCount: 0, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    });
    assignmentApi.retryStaleEvaluations.calls.reset();
    alert.showConfirm.calls.reset();
    alert.showConfirm.and.resolveTo(true);
    alert.showToast.calls.reset();
    await TestBed.configureTestingModule({
      imports: [DialogViewSubmissions],
      providers: [
        { provide: SubmissionApiService, useValue: api },
        { provide: AssignmentApiService, useValue: assignmentApi },
        { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: AlertService, useValue: alert },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
        { provide: TeacherDashboardStateService, useValue: dashboardState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogViewSubmissions);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('assignmentId', 'assignment-a');
    fixture.detectChanges();
  });

  it('opens in loading state with three skeleton rows', () => {
    expect(component.modalState).toBe('loading');
    expect(fixture.nativeElement.querySelectorAll('.submission-skeleton-row').length).toBe(3);
  });

  it('shows the empty state only after a successful empty response', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.modalState).toBe('empty');
    expect(fixture.nativeElement.textContent).toContain('No submissions have been received yet.');
  });

  it('replaces a failed request with a contained retry state', async () => {
    rejectRequest();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.modalState).toBe('error');
    expect(fixture.nativeElement.querySelector('.modal-state--error button')).toBeTruthy();
  });

  it('does not start duplicate requests for the same assignment while loading', () => {
    void component.load();
    expect(api.getSubmissionsByAssignment).toHaveBeenCalledTimes(1);
  });

  it('displays the outdated count and confirms before starting one bulk request', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    component.submissions = [{ _id: 'submission-1', evaluationStatus: 'stale' } as BackendSubmission];
    component.students = [{ submissionId: 'submission-1', name: 'Student', image: '', lastActivity: '' }];
    component.modalState = 'loaded';
    component.staleEvaluationSummary = {
      assignmentId: 'assignment-a', eligibleCount: 12, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    };
    assignmentApi.retryStaleEvaluations.and.resolveTo({
      ...component.staleEvaluationSummary, startedCount: 10,
      skippedOverrideCount: 1, skippedProcessingCount: 1, submissionIds: ['submission-1']
    });
    api.getSubmissionsByAssignment.and.resolveTo([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('12 submissions require re-evaluation');
    const action = fixture.nativeElement.querySelector('.view-action') as HTMLButtonElement;
    expect(action.textContent).toContain('Re-evaluate outdated submissions');
    await component.startBulkReEvaluation();

    expect(alert.showConfirm).toHaveBeenCalledOnceWith(
      'Re-evaluate outdated submissions',
      'Re-evaluate 12 submissions using the current rubric and grading settings? This may use AI processing credits.',
      'Re-evaluate submissions',
      'Cancel'
    );
    expect(assignmentApi.retryStaleEvaluations).toHaveBeenCalledOnceWith('assignment-a');
    expect(alert.showToast).toHaveBeenCalledWith('10 submissions queued', 'success');
  });

  it('does not call the bulk endpoint when confirmation is cancelled', async () => {
    alert.showConfirm.and.resolveTo(false);
    component.modalState = 'loaded';
    component.staleEvaluationSummary = {
      assignmentId: 'assignment-a', eligibleCount: 2, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    };

    await component.startBulkReEvaluation();

    expect(assignmentApi.retryStaleEvaluations).not.toHaveBeenCalled();
  });

  it('uses singular wording and hides the notice when the canonical count reaches zero', async () => {
    resolveRequest([{ _id: 'submission-1', student: { displayName: 'Student' } } as BackendSubmission]);
    await fixture.whenStable();
    component.staleEvaluationSummary = {
      assignmentId: 'assignment-a', eligibleCount: 1, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 submission requires re-evaluation');

    component.staleEvaluationSummary = {
      ...component.staleEvaluationSummary,
      eligibleCount: 0
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('requires re-evaluation');
    expect(fixture.nativeElement.textContent).not.toContain('Re-evaluate outdated submissions');
  });

  it('refetches the canonical count whenever the same modal is reopened', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    api.getSubmissionsByAssignment.and.resolveTo([]);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.getSubmissionsByAssignment).toHaveBeenCalledTimes(2);
    expect(assignmentApi.getStaleEvaluationSummary).toHaveBeenCalledTimes(2);
  });

  it('refreshes the count after an individual evaluation invalidates assignment freshness', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    api.getSubmissionsByAssignment.and.resolveTo([]);

    dashboardState.invalidateEvaluationFreshness('assignment-a');
    await fixture.whenStable();

    expect(assignmentApi.getStaleEvaluationSummary).toHaveBeenCalledTimes(2);
  });
});
