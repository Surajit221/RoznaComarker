import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentForm } from './assignment-form';
import { GuestSubmissionFeature } from '../../../../../services/guest-submission-feature.service';
import { DraftLimitFeature } from '../../../../../services/draft-limit-feature.service';
import { ReferenceFilesApiService, type ReferenceFileView } from '../../../../../api/reference-files-api.service';
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { ReferenceFilesField } from '../../../../../components/teacher/reference-files-field/reference-files-field';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';

// Reference files in the assignment form: create and edit. The field itself is tested in reference-files-field.spec.ts; here its
// methods are spied on to check what the form does with them, and when.
describe('AssignmentForm reference files', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let fixture: ComponentFixture<AssignmentForm>, component: AssignmentForm;
  let refApi: jasmine.SpyObj<ReferenceFilesApiService>;
  const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

  beforeEach(async () => {
    refApi = jasmine.createSpyObj<ReferenceFilesApiService>('ReferenceFilesApiService', ['config', 'list']);
    refApi.config.and.resolveTo({ enabled: true, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 });
    refApi.list.and.resolveTo({ files: [], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
    await TestBed.configureTestingModule({
      imports: [AssignmentForm],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => true, state: () => 'enabled', load: () => Promise.resolve(true), settled: () => Promise.resolve('enabled') } },
        { provide: DraftLimitFeature, useValue: { config: signal({ enabled: false, min: 2, max: 10, default: 3 }), load: () => Promise.resolve({ enabled: false, min: 2, max: 10, default: 3 }) } },
        { provide: ReferenceFilesApiService, useValue: refApi }, ...routedComponentProviders(), ...httpTestingProviders]
    }).compileComponents();
    fixture = TestBed.createComponent(AssignmentForm);
    component = fixture.componentInstance;
    component.classId = 'class-1';
    fixture.detectChanges(); await settle(); fixture.detectChanges();
  });

  const field = () => component.referenceFiles as ReferenceFilesField;
  const api = () => TestBed.inject(AssignmentApiService);
  const alert = () => TestBed.inject(AlertService);
  // The form's private steps, called as the existing assignment-form specs do.
  const form = () => component as unknown as { handleSubmit(): Promise<void>; applyAssignmentToForm(): void };
  const uploadedFile = { id: 'f1' } as ReferenceFileView;
  const assignment = (value: object) => value as BackendAssignment;
  const sentRubrics = (args: unknown[]) => (args[1] as { rubrics?: { criteria: { name: string }[] } }).rubrics;
  function fill() {
    component.classForm.patchValue({ className: 'River essay', writingType: 'Argumentative', startDate: '2099-08-11', message: 'Argue for or against the bridge.' });
  }

  it('is busy (the hosting dialog ignores its backdrop) while saving, uploading, waiting for files to be read, or saving a reviewed rubric', () => {
    expect(component.busy()).toBeFalse();
    component.isSubmitting = true; expect(component.busy()).toBeTrue(); component.isSubmitting = false;
    field().pending.set([{ key: 'k', file: new File(['x'], 'a.pdf'), name: 'a.pdf', sizeBytes: 1, markedAsRubric: false, state: 'uploading', progress: 1,
      error: null, requestId: 'request-0001' }]);
    expect(component.busy()).toBeTrue(); field().pending.set([]);
    field().waiting.set(true); expect(component.busy()).toBeTrue(); field().waiting.set(false);
    field().reviewSaving.set(true); expect(component.busy()).toBeTrue(); field().reviewSaving.set(false);
    expect(component.busy()).toBeFalse();
  });

  it('shows the field for writing assignments (create), scoped to the assignment, before the rubric section', () => {
    const element = fixture.nativeElement.querySelector('app-reference-files-field');
    expect(element).not.toBeNull();
    expect(field().scope).toBe('assignment');
    expect(field().targetId).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Reference files for AI marking');
  });

  it('is not offered for worksheet or flashcard assignments', async () => {
    component.assignment = assignment({ _id: 'a9', title: 'Sheet', resourceType: 'worksheet' });
    form().applyAssignmentToForm(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-reference-files-field')).toBeNull();
  });

  it('create: the files upload to the new assignment, are read, get the rubric step, and only then is the assignment handed over', async () => {
    fill();
    const order: string[] = [];
    spyOn(api(), 'createAssignment').and.callFake(async () => { order.push('create'); return assignment({ _id: 'new-1', title: 'River essay' }); });
    spyOn(field(), 'hasStaged').and.returnValue(true);
    spyOn(field(), 'uploadStaged').and.callFake(async (id: string) => { order.push(`upload:${id}`); return { uploaded: [uploadedFile], failed: [] }; });
    spyOn(field(), 'waitUntilRead').and.callFake(async () => { order.push('wait'); });
    spyOn(field(), 'runRubricStep').and.callFake(async () => { order.push('rubric'); });
    const toast = spyOn(alert(), 'showToast');
    component.created.subscribe(() => order.push('created'));
    await form().handleSubmit();
    expect(order).toEqual(['create', 'upload:new-1', 'wait', 'rubric', 'created']);
    expect(toast).toHaveBeenCalledWith('Assignment created successfully', 'success');
  });

  it('create with a rubric applied from a file: the parent gets the assignment with that rubric, and no second success popup', async () => {
    fill();
    spyOn(api(), 'createAssignment').and.resolveTo(assignment({ _id: 'new-1', title: 'River essay' }));
    const withRubric = assignment({ _id: 'new-1', title: 'River essay', rubrics: { totalPoints: 100, criteria: [{ name: 'Thesis' }] } });
    const fetch = spyOn(api(), 'getAssignmentByIdForTeacher').and.resolveTo(withRubric);
    spyOn(field(), 'hasStaged').and.returnValue(true);
    spyOn(field(), 'uploadStaged').and.resolveTo({ uploaded: [uploadedFile], failed: [] });
    spyOn(field(), 'waitUntilRead').and.resolveTo();
    spyOn(field(), 'runRubricStep').and.callFake(() => component.onReferenceRubricApplied());
    const toast = spyOn(alert(), 'showToast');
    const created = jasmine.createSpy('created');
    component.created.subscribe(created);
    await form().handleSubmit();
    expect(fetch).toHaveBeenCalledWith('new-1');
    expect(created).toHaveBeenCalledOnceWith(withRubric);
    expect(toast).not.toHaveBeenCalled();
  });

  it('create: files the server refused are reported in one warning; the assignment is still handed over', async () => {
    fill();
    spyOn(api(), 'createAssignment').and.resolveTo(assignment({ _id: 'new-1', title: 'River essay' }));
    spyOn(field(), 'hasStaged').and.returnValue(true);
    spyOn(field(), 'uploadStaged').and.resolveTo({ uploaded: [], failed: [{ name: 'plan.docm', message: 'Files with macros are not accepted.' }] });
    const wait = spyOn(field(), 'waitUntilRead');
    const warning = spyOn(alert(), 'showWarning'); const toast = spyOn(alert(), 'showToast');
    const created = jasmine.createSpy('created');
    component.created.subscribe(created);
    await form().handleSubmit();
    expect(wait).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnceWith('Assignment created, but some files were not added',
      'plan.docm: Files with macros are not accepted. You can add files again from Edit assignment.');
    expect(toast).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('create without files behaves exactly as before', async () => {
    fill();
    spyOn(api(), 'createAssignment').and.resolveTo(assignment({ _id: 'new-1', title: 'River essay' }));
    const upload = spyOn(field(), 'uploadStaged');
    spyOn(alert(), 'showToast');
    const created = jasmine.createSpy('created');
    component.created.subscribe(created);
    await form().handleSubmit();
    expect(upload).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledOnceWith(assignment({ _id: 'new-1', title: 'River essay' }));
  });

  describe('edit', () => {
    const rubrics = (name: string) => ({ totalPoints: 100, criteria: [{ id: 'c1', name, weight: 100,
      levels: [{ title: 'Low', score: 1, description: 'Weak' }, { title: 'High', score: 2, description: 'Strong' }] }] });
    beforeEach(() => {
      component.assignment = assignment({ _id: 'a1', title: 'River essay', writingType: 'Argumentative', deadline: '2099-08-11', instructions: 'Argue for or against the bridge.',
        rubrics: rubrics('Old criterion') });
      form().applyAssignmentToForm(); fixture.detectChanges();
    });

    it('the field is bound to the saved assignment', () => {
      expect(field().targetId).toBe('a1');
    });

    it('after a rubric is applied from a file, the form reloads its rubric, so Update never sends the old one back', async () => {
      spyOn(api(), 'getAssignmentByIdForTeacher').and.resolveTo(assignment({ ...component.assignment, rubrics: rubrics('From the file') }));
      await component.onReferenceRubricApplied();
      expect(component.rubricDesignerForModal?.criteria[0].title).toBe('From the file');
      const update = spyOn(api(), 'updateAssignment').and.resolveTo(component.assignment as BackendAssignment);
      spyOn(alert(), 'showToast');
      await form().handleSubmit();
      expect(sentRubrics(update.calls.mostRecent().args)?.criteria[0].name).toBe('From the file');
    });

    it('if that reload fails, Update sends no rubric at all (the server keeps the applied one)', async () => {
      spyOn(api(), 'getAssignmentByIdForTeacher').and.rejectWith(new Error('offline'));
      await component.onReferenceRubricApplied();
      expect(component.rubricDesignerForModal).toBeNull();
      const update = spyOn(api(), 'updateAssignment').and.resolveTo(component.assignment as BackendAssignment);
      spyOn(alert(), 'showToast');
      await form().handleSubmit();
      expect(sentRubrics(update.calls.mostRecent().args)).toBeUndefined();
    });

    it('Update uploads files still waiting in the field', async () => {
      spyOn(api(), 'updateAssignment').and.resolveTo(component.assignment as BackendAssignment);
      spyOn(field(), 'hasStaged').and.returnValue(true);
      const upload = spyOn(field(), 'uploadStaged').and.resolveTo({ uploaded: [], failed: [] });
      spyOn(alert(), 'showToast');
      await form().handleSubmit();
      expect(upload).toHaveBeenCalledOnceWith('a1');
    });

    it('Cancel cannot interrupt a save in progress', () => {
      component.isSubmitting = true; fixture.detectChanges();
      const cancel = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => b.textContent?.trim() === 'Cancel')!;
      expect(cancel.disabled).toBeTrue();
    });
  });
});
