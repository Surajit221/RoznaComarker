import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignmentForm } from './assignment-form';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';

describe('AssignmentForm', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: AssignmentForm;
  let fixture: ComponentFixture<AssignmentForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignmentForm], providers: [...routedComponentProviders(), ...httpTestingProviders]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignmentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses safe defaults for new and historical assignments', () => {
    expect(component.classForm.value.showMarksToStudent).toBeTrue();
    expect(component.classForm.value.allowResubmission).toBeFalse();
    expect(component.classForm.value.requireAdaptiveBeforeResubmission).toBeFalse();

    component.assignment = { _id: 'assignment-1', title: 'Historical assignment' } as any;
    (component as any).applyAssignmentToForm();

    expect(component.classForm.value.showMarksToStudent).toBeTrue();
    expect(component.classForm.value.allowResubmission).toBeFalse();
    expect(component.classForm.value.requireAdaptiveBeforeResubmission).toBeFalse();
  });

  it('normalizes the dependent adaptive requirement when another draft is disabled', () => {
    component.classForm.patchValue({ allowResubmission: true, requireAdaptiveBeforeResubmission: true });
    component.classForm.patchValue({ allowResubmission: false });
    component.onAllowResubmissionChange();
    fixture.detectChanges();

    expect(component.classForm.value.requireAdaptiveBeforeResubmission).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Require Adaptive Learning first');
  });

  it('persists the adaptive requirement only when another draft is enabled', async () => {
    component.assignment = { _id: 'assignment-1', title: 'Essay' } as any;
    component.classForm.patchValue({ className: 'Essay', writingType: 'essay', startDate: '2099-08-11',
      message: 'Write clearly.', allowResubmission: true, requireAdaptiveBeforeResubmission: true });
    const api = (component as any).assignmentApi;
    spyOn(api, 'updateAssignment').and.resolveTo({ _id: 'assignment-1', title: 'Essay' });
    spyOn((component as any).alert, 'showToast');

    await (component as any).handleSubmit();

    expect(api.updateAssignment).toHaveBeenCalledWith('assignment-1', jasmine.objectContaining({
      allowResubmission: true, requireAdaptiveBeforeResubmission: true
    }));
  });

  it('shows update success only after the API resolves successfully', async () => {
    component.assignment = { _id: 'assignment-1', title: 'Essay' } as any;
    component.classForm.patchValue({ className: 'Essay', writingType: 'essay',
      startDate: '2099-08-11', message: 'Write clearly.' });
    const api = (component as any).assignmentApi;
    const alert = (component as any).alert;
    spyOn(api, 'updateAssignment').and.resolveTo({ _id: 'assignment-1', title: 'Essay' });
    const toast = spyOn(alert, 'showToast');

    await (component as any).handleSubmit();

    expect(api.updateAssignment).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledOnceWith('Assignment updated successfully', 'success');
  });

  it('does not show create success when the API rejects', async () => {
    component.classId = 'class-1';
    component.assignment = null;
    component.classForm.patchValue({ className: 'Essay', writingType: 'essay',
      startDate: '2099-08-11', message: 'Write clearly.' });
    const api = (component as any).assignmentApi;
    const alert = (component as any).alert;
    spyOn(api, 'createAssignment').and.rejectWith(new Error('Save failed'));
    const toast = spyOn(alert, 'showToast');
    spyOn(alert, 'showError');

    await (component as any).handleSubmit();

    expect(toast).not.toHaveBeenCalled();
  });

  it('shows create success after the API resolves successfully', async () => {
    component.classId = 'class-1';
    component.assignment = null;
    component.classForm.patchValue({ className: 'Essay', writingType: 'essay',
      startDate: '2099-08-11', message: 'Write clearly.' });
    const api = (component as any).assignmentApi;
    const alert = (component as any).alert;
    spyOn(api, 'createAssignment').and.resolveTo({ _id: 'assignment-2', title: 'Essay' });
    const toast = spyOn(alert, 'showToast');

    await (component as any).handleSubmit();

    expect(toast).toHaveBeenCalledOnceWith('Assignment created successfully', 'success');
  });
});
