import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { DeviceService } from '../../../../../services/device.service';
import { DialogViewSubmissions } from './dialog-view-submissions';
import { AssignmentApiService } from '../../../../../api/assignment-api.service';
import { TeacherDashboardStateService } from '../../../../../services/teacher-dashboard-state.service';
import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TeacherUploadApiService, type TeacherUploadItem } from '../../../../../api/teacher-upload-api.service';

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
    removeSubmission: jasmine.createSpy()
  };
  const assignmentApi = {
    getStaleEvaluationSummary: jasmine.createSpy().and.resolveTo({
      assignmentId: 'assignment-a', eligibleCount: 0, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    }),
    retryStaleEvaluations: jasmine.createSpy()
  };
  const teacherUploadApi = {
    list: jasmine.createSpy().and.resolveTo({ items: [], credits: { available: 0 } }),
    send: jasmine.createSpy(),
    retry: jasmine.createSpy()
  };
  const alert = {
    showSuccess: jasmine.createSpy(),
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
    api.removeSubmission.calls.reset();
    api.removeSubmission.and.resolveTo(undefined);
    assignmentApi.getStaleEvaluationSummary.calls.reset();
    assignmentApi.getStaleEvaluationSummary.and.resolveTo({
      assignmentId: 'assignment-a', eligibleCount: 0, skippedOverrideCount: 0,
      skippedProcessingCount: 0, skippedNotReadyCount: 0
    });
    assignmentApi.retryStaleEvaluations.calls.reset();
    alert.showConfirm.calls.reset();
    alert.showConfirm.and.resolveTo(true);
    alert.showToast.calls.reset();
    alert.showError.calls.reset(); alert.showSuccess.calls.reset();
    teacherUploadApi.list.calls.reset(); teacherUploadApi.list.and.resolveTo({ items: [], credits: { available: 0 } });
    teacherUploadApi.send.calls.reset(); teacherUploadApi.retry.calls.reset();
    await TestBed.configureTestingModule({
      imports: [DialogViewSubmissions],
      providers: [
        { provide: SubmissionApiService, useValue: api },
        { provide: AssignmentApiService, useValue: assignmentApi },
        { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: AlertService, useValue: alert },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
        { provide: TeacherDashboardStateService, useValue: dashboardState },
        { provide: TeacherUploadApiService, useValue: teacherUploadApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogViewSubmissions);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('assignmentId', 'assignment-a');
    fixture.detectChanges();
  });

  describe('work uploaded by the teacher', () => {
    const item = (over: Partial<TeacherUploadItem> = {}): TeacherUploadItem => ({ submissionId: 'submission-1', name: 'Sam Lee', email: 'sam@example.com',
      account: 'guest', uploadedByTeacher: true, pages: 2, status: 'marked', emailStatus: 'none', emailSentAt: null, emailFailedAt: null,
      uploadedAt: '2026-11-11T10:00:00.000Z', ...over });
    async function show(upload: TeacherUploadItem) {
      teacherUploadApi.list.and.resolveTo({ items: [upload], credits: { available: 3 } });
      const loading = component.load(true);
      resolveRequest([{ _id: 'submission-1', guest: { displayName: 'Sam Lee' } } as unknown as BackendSubmission,
        { _id: 'submission-2', student: { displayName: 'Mia' } } as BackendSubmission]);
      await loading; await fixture.whenStable(); fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('marks teacher uploads with their marking and email status; other rows are unchanged', async () => {
      const root = await show(item({ status: 'processing', emailStatus: 'queued' }));
      const badges = root.querySelectorAll('[data-teacher-upload]');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('Uploaded by teacher');
      expect(badges[0].textContent).toContain('Marking…');
      expect(badges[0].textContent).toContain('Email queued');
      expect(badges[0].querySelector('button')).toBeNull();
    });

    it('sends the feedback email, and offers Resend after a failure', async () => {
      const root = await show(item({ emailStatus: 'failed' }));
      const resend = root.querySelector('[data-teacher-upload] button') as HTMLButtonElement;
      expect(resend.textContent).toContain('Resend');
      teacherUploadApi.send.and.resolveTo({ alreadyRequested: false, item: item({ emailStatus: 'queued' }) });
      resend.click(); await fixture.whenStable(); fixture.detectChanges();
      expect(teacherUploadApi.send).toHaveBeenCalledOnceWith('assignment-a', 'submission-1');
      expect(root.querySelector('[data-teacher-upload]')!.textContent).toContain('Email queued');
      expect(alert.showSuccess).toHaveBeenCalledWith('Email queued', 'The feedback link will be emailed shortly.');
    });

    it('labels an uncertain delivery next to Resend and explains the risk of a second copy', async () => {
      const root = await show(item({ emailStatus: 'failed', emailDeliveryUncertain: true }));
      const info = root.querySelector('[data-teacher-upload]')!;
      expect(info.textContent).toContain('Delivery uncertain');
      expect(info.textContent).not.toContain('Email failed');
      const note = info.querySelector('[data-delivery-uncertain]') as HTMLElement;
      expect(note.textContent).toContain('Resend could send a second copy.');
      const resend = info.querySelector('button') as HTMLButtonElement;
      expect(resend.textContent).toContain('Resend');
      expect(resend.getAttribute('aria-describedby')).toBe(note.id);
    });

    it('an ordinary failure keeps the plain label and no uncertainty note', async () => {
      const info = (await show(item({ emailStatus: 'failed', emailDeliveryUncertain: false }))).querySelector('[data-teacher-upload]')!;
      expect(info.textContent).toContain('Email failed');
      expect(info.querySelector('[data-delivery-uncertain]')).toBeNull();
      expect(info.querySelector('button')!.getAttribute('aria-describedby')).toBeNull();
    });

    it('marking failed: says the email was not sent, keeps Send disabled, and offers Retry marking', async () => {
      for (const emailStatus of ['none', 'queued', 'held'] as const) {
        const info = (await show(item({ status: 'failed', emailStatus }))).querySelector('[data-teacher-upload]')!;
        expect(info.textContent).toContain('Marking failed');
        expect(info.textContent).toContain('Marking failed, email not sent');
        const buttons = [...info.querySelectorAll('button')];
        const send = buttons.find(b => b.textContent!.trim().startsWith('Send'))!;
        expect(send.disabled).withContext(emailStatus).toBeTrue();
        expect(document.getElementById(send.getAttribute('aria-describedby')!)?.textContent).toContain('Available after marking succeeds.');
        expect(buttons.some(b => b.hasAttribute('data-retry-marking') && !b.disabled)).toBeTrue();
      }
    });

    it('Retry marking restarts marking once and shows the new status', async () => {
      const root = await show(item({ status: 'failed', emailStatus: 'held' }));
      teacherUploadApi.retry.and.resolveTo({ alreadyRequested: false, item: item({ status: 'uploaded', emailStatus: 'queued' }) });
      (root.querySelector('[data-retry-marking]') as HTMLButtonElement).click(); await fixture.whenStable(); fixture.detectChanges();
      expect(teacherUploadApi.retry).toHaveBeenCalledOnceWith('assignment-a', 'submission-1');
      const info = root.querySelector('[data-teacher-upload]')!;
      expect(info.textContent).toContain('Uploaded');
      expect(info.textContent).toContain('Email queued');
      expect(info.querySelector('[data-retry-marking]')).toBeNull();
      expect(alert.showSuccess).toHaveBeenCalledWith('Marking restarted', 'This work is being marked again. Check back in a few minutes.');
    });

    it('Retry marking explains a refusal in plain words (for example no credits left)', async () => {
      const root = await show(item({ status: 'failed' }));
      teacherUploadApi.retry.and.rejectWith(new HttpErrorResponse({ status: 402,
        error: { code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to retry marking.' } }));
      (root.querySelector('[data-retry-marking]') as HTMLButtonElement).click(); await fixture.whenStable();
      expect(alert.showError).toHaveBeenCalledWith('Marking not restarted', 'You have no assessment credits left. Add credits to retry marking.');
    });

    it('shows a plain message when sending fails', async () => {
      const root = await show(item());
      teacherUploadApi.send.and.rejectWith(new HttpErrorResponse({ status: 429, error: { message: 'Too many' } }));
      (root.querySelector('[data-teacher-upload] button') as HTMLButtonElement).click(); await fixture.whenStable();
      expect(alert.showError).toHaveBeenCalledWith('Email not queued', 'Too many requests. Please wait a minute and try again.');
    });

    it('still lists submissions when the upload statuses cannot be loaded', async () => {
      teacherUploadApi.list.and.rejectWith(new Error('offline'));
      const loading = component.load(true);
      resolveRequest([{ _id: 'submission-2', student: { displayName: 'Mia' } } as BackendSubmission]);
      await loading; await fixture.whenStable(); fixture.detectChanges();
      expect(component.modalState).toBe('loaded');
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-teacher-upload]')).toBeNull();
    });
  });

  it('opens in loading state with three skeleton rows', () => {
    expect(component.modalState).toBe('loading');
    expect(fixture.nativeElement.querySelectorAll('.submission-skeleton-row').length).toBe(3);
  });

  it('shows View and an accessible trash button wired to the existing remove handler', async () => {
    resolveRequest([{ _id: 'submission-1', student: { displayName: 'Student' } } as BackendSubmission]);
    await fixture.whenStable();
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.submission-actions') as HTMLElement;
    expect(row.textContent).toContain('View');
    expect(row.textContent).not.toContain('Remove Submission');
    const remove = row.querySelector('.remove-action') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove submission');
    expect(remove.querySelector('.bx-trash')).toBeTruthy();
    const handler = spyOn(component, 'removeSubmission').and.resolveTo();
    remove.click();
    expect(handler).toHaveBeenCalledOnceWith(component.students[0]);
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

  it('confirms removal, calls the teacher endpoint, refreshes the list, and emits the removed id', async () => {
    resolveRequest([{ _id: 'submission-1', student: { displayName: 'Student' } } as BackendSubmission]);
    await fixture.whenStable();
    api.getSubmissionsByAssignment.and.resolveTo([]);
    const removed = jasmine.createSpy();
    component.removed.subscribe(removed);

    await component.removeSubmission({ submissionId: 'submission-1', name: 'Student' });

    expect(alert.showConfirm).toHaveBeenCalledWith(
      'Remove this submission?',
      "This will remove the student's current submission and related current analysis for this assignment. The student will be able to submit again according to the assignment's submission rules.",
      'Remove Submission',
      'Cancel'
    );
    expect(api.removeSubmission).toHaveBeenCalledOnceWith('submission-1');
    expect(alert.showToast).toHaveBeenCalledWith('Submission removed successfully', 'success');
    expect(removed).toHaveBeenCalledOnceWith('submission-1');
    expect(component.modalState).toBe('empty');
  });

  it('does not remove a submission when confirmation is cancelled', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    alert.showConfirm.and.resolveTo(false);
    await component.removeSubmission({ submissionId: 'submission-1', name: 'Student' });
    expect(api.removeSubmission).not.toHaveBeenCalled();
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

  for (const desktop of [true, false]) {
    it('keeps the View button route, IDs, delete action and disabled state on ' + (desktop ? 'desktop' : 'mobile'), async () => {
      spyOn(TestBed.inject(DeviceService), 'isDesktop').and.returnValue(desktop);
      resolveRequest([{ _id: 'submission-1', student: { _id: 'student-1', displayName: 'Student' }, class: 'class-1' } as BackendSubmission]);
      await fixture.whenStable(); fixture.detectChanges();
      const view = fixture.nativeElement.querySelector('.submission-actions .submission-action-button') as HTMLButtonElement;
      expect(view.tagName).toBe('BUTTON'); expect(view.type).toBe('button');
      expect(view.textContent?.trim()).toBe('View'); expect(view.classList.contains('btn-primary-sm')).toBeTrue();
      view.click();
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledOnceWith(['/teacher/my-classes/detail/student-submissions', 'student-1'], {
        queryParams: { classId: 'class-1', assignmentId: 'assignment-a', submissionId: 'submission-1' }
      });
      expect(api.removeSubmission).not.toHaveBeenCalled();
      const remove = fixture.nativeElement.querySelector('.remove-action') as HTMLButtonElement;
      const handler = spyOn(component, 'removeSubmission').and.resolveTo(); remove.click();
      expect(handler).toHaveBeenCalledOnceWith(component.students[0]);
      component.removingSubmissionId = 'submission-1'; fixture.detectChanges();
      expect(remove.disabled).toBeTrue(); expect(remove.getAttribute('aria-label')).toBe('Remove submission');
    });
  }

  it('keeps the embedded selection flow instead of adding navigation', async () => {
    component.navigateOnSelect = false;
    resolveRequest([{ _id: 'submission-1', student: { _id: 'student-1', displayName: 'Student' } } as BackendSubmission]);
    await fixture.whenStable(); fixture.detectChanges();
    const selected = jasmine.createSpy(); component.selected.subscribe(selected);
    (fixture.nativeElement.querySelector('.submission-actions .submission-action-button') as HTMLButtonElement).click();
    expect(selected).toHaveBeenCalledOnceWith('submission-1'); expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it('keeps long student information separate from View and delete at phone, tablet and desktop widths', async () => {
    const desktop = spyOn(TestBed.inject(DeviceService), 'isDesktop');
    resolveRequest([{ _id: 'submission-1', student: { _id: 'student-1', displayName: 'Alexandria'.repeat(10) } } as BackendSubmission]);
    await fixture.whenStable();
    for (const width of [360, 768, 1280]) {
      desktop.and.returnValue(width >= 1024); fixture.nativeElement.style.display = 'block';
      fixture.nativeElement.style.width = (width - 48) + 'px'; fixture.detectChanges();
      const actions = fixture.nativeElement.querySelector('.submission-actions') as HTMLElement;
      const row = actions.parentElement!;
      const view = actions.querySelector('.submission-action-button') as HTMLButtonElement;
      const remove = actions.querySelector('.remove-action') as HTMLButtonElement;
      expect(row.scrollWidth).withContext(width + 'px row overflow').toBeLessThanOrEqual(row.clientWidth + 1);
      expect(view.getBoundingClientRect().right).toBeLessThanOrEqual(remove.getBoundingClientRect().left + 1);
      expect(row.querySelector('p')!.getBoundingClientRect().right).toBeLessThanOrEqual(view.getBoundingClientRect().left + 1);
    }
  });

});
