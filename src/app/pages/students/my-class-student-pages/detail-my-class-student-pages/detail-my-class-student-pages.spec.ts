import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassStudentPages } from './detail-my-class-student-pages';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../auth/auth.service';
import { of } from 'rxjs';

describe('DetailMyClassStudentPages', () => {
  let component: DetailMyClassStudentPages;
  let fixture: ComponentFixture<DetailMyClassStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassStudentPages],
      providers: [
        ...routedHttpTestProviders({ classId: 'class-1' }),
        { provide: AuthService, useValue: { getBackendJwt: () => null } },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires confirmation before opening the existing uploader for another draft', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true
    }];
    const alert = (component as any).alert;
    const confirm = spyOn(alert, 'showConfirm').and.resolveTo(false);

    await component.openUpload('assignment-1');
    expect(confirm).toHaveBeenCalledWith(
      'Submit another draft?',
      'Your new draft will replace the current version used for grading and will be processed again.',
      'Submit New Draft',
      'Cancel'
    );
    expect(component.showDialog).toBeFalse();
    expect(component.openSheet).toBeFalse();
  });

  it('does not open the uploader when another draft is disabled', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: false
    }];
    const warning = spyOn((component as any).alert, 'showWarning');

    await component.openUpload('assignment-1');

    expect(warning).toHaveBeenCalled();
    expect(component.selectedAssignmentId).toBeNull();
  });

  it('guides the student to Adaptive Learning while the current practice is incomplete', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true,
      requireAdaptiveBeforeResubmission: true, adaptiveResubmissionSatisfied: false
    }];
    const warning = spyOn((component as any).alert, 'showWarning');
    const navigate = spyOn((component as any).router, 'navigate');

    await component.openUpload('assignment-1');

    expect(warning).toHaveBeenCalledWith(
      'Complete Adaptive Learning first',
      'Complete Adaptive Learning for your current draft before submitting another draft.'
    );
    expect(navigate).toHaveBeenCalled();
  });

  it('hides the resubmit action and shows the adaptive requirement while incomplete', () => {
    component.isLoading = false;
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true,
      requireAdaptiveBeforeResubmission: true, adaptiveResubmissionSatisfied: false
    }];
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Complete Adaptive Learning before another draft.');
    expect(text).not.toContain('Submit Another Draft');
  });

  it('maps current completed and no-weakness adaptive states as eligible', async () => {
    const submissionApi = (component as any).submissionApi;
    const adaptiveApi = (component as any).adaptivePracticeApi;
    spyOn(submissionApi, 'getMySubmissionByAssignmentId').and.resolveTo({ _id: 'submission-1' });
    const session = spyOn(adaptiveApi, 'getSession');
    const assignment = { _id: 'assignment-1', title: 'Essay', allowResubmission: true,
      requireAdaptiveBeforeResubmission: true } as any;

    session.and.returnValue(of({ state: 'ready', session: null, progress: { completed: true } }));
    expect((await (component as any).mapAssignment(assignment)).adaptiveResubmissionSatisfied).toBeTrue();

    session.and.returnValue(of({ state: 'no-weaknesses', session: null }));
    expect((await (component as any).mapAssignment(assignment)).adaptiveResubmissionSatisfied).toBeTrue();
  });
});
