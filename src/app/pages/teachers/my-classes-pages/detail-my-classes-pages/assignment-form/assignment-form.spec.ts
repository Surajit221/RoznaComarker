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

  it('does not expose a rubric action while creating a writing assignment', () => {
    component.assignment = null;
    (component as any).applyAssignmentToForm();
    fixture.detectChanges();
    const formText = (fixture.nativeElement.querySelector('form') as HTMLElement).textContent || '';
    expect(formText).not.toContain('Add Rubric');
    expect(formText).not.toContain('Edit Rubric');
    expect(fixture.nativeElement.querySelector('app-rubric-designer-modal')).toBeNull();
  });

  it('keeps one rubric entry point when editing a persisted writing assignment', () => {
    component.assignment = { _id: 'writing', title: 'Essay', resourceType: 'essay' } as any;
    (component as any).applyAssignmentToForm();
    fixture.detectChanges();
    const formText = (fixture.nativeElement.querySelector('form') as HTMLElement).textContent || '';
    expect(formText).toContain('Add Rubric');
    expect(formText).not.toContain('Create Rubric');
    expect(formText).not.toContain('Use Existing');

    component.openRubricDesignerDialog();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Use Existing');
    expect(fixture.nativeElement.textContent).toContain('Save to Library');
  });

  it('generates an unsaved assignment rubric once and applies it to the editor', async () => {
    const generated: any = { title: 'AI Rubric', totalPoints: 100,
      levels: [{ title: 'Strong', maxPoints: 100 }, { title: 'Good', maxPoints: 70 }, { title: 'Basic', maxPoints: 40 }],
      criteria: [{ title: 'A', weight: 34, cells: ['a', 'b', 'c'] },
        { title: 'B', weight: 33, cells: ['a', 'b', 'c'] }, { title: 'C', weight: 33, cells: ['a', 'b', 'c'] }] };
    const api = (component as any).assignmentApi;
    const call = spyOn(api, 'generateDraftRubricDesignerFromPrompt').and.resolveTo(generated);
    component.classForm.patchValue({ className: 'Essay', writingType: 'Argumentative', message: 'Write an argument.' });

    await Promise.all([component.onRubricGenerateAi('Assess evidence'), component.onRubricGenerateAi('Assess evidence')]);

    expect(call).toHaveBeenCalledTimes(1);
    expect(component.rubricDesignerForModal?.title).toBe('AI Rubric');
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

  it('updates a resource assignment deadline through the Assignment API without requiring writing fields', async () => {
    component.assignment = { _id: 'copied-flashcard', title: 'Solar System', resourceType: 'flashcard',
      resourceId: 'set-1', deadline: null } as any;
    (component as any).applyAssignmentToForm();
    component.classForm.patchValue({ className: 'Solar System', startDate: '2099-09-18', message: '' });
    const api = (component as any).assignmentApi;
    spyOn(api, 'updateAssignment').and.resolveTo({ ...component.assignment, deadline: '2099-09-18T23:59:59.999Z' });
    spyOn((component as any).alert, 'showToast');

    await (component as any).handleSubmit();

    expect(api.updateAssignment).toHaveBeenCalledOnceWith('copied-flashcard', jasmine.objectContaining({
      deadline: new Date('2099-09-18T23:59:59.999').toISOString()
    }));
    expect(api.updateAssignment.calls.mostRecent().args[1].resourceId).toBeUndefined();
    expect(api.updateAssignment.calls.mostRecent().args[1].writingType).toBeUndefined();
    expect(api.updateAssignment.calls.mostRecent().args[1].allowResubmission).toBeUndefined();
  });

  it('renders writing-only controls only for writing assignments', () => {
    component.assignment={_id:'writing',title:'Essay',resourceType:'essay',deadline:'2099-01-01'} as any;(component as any).applyAssignmentToForm();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Allow another draft');
    component.classForm.patchValue({allowResubmission:true});fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Require Adaptive Learning first');
    for(const resourceType of ['flashcard','worksheet']){component.assignment={_id:resourceType,title:'Resource',resourceType,deadline:null} as any;(component as any).applyAssignmentToForm();fixture.detectChanges();const text=fixture.nativeElement.textContent;expect(text).not.toContain('Allow another draft');expect(text).not.toContain('Adaptive Learning');expect(text).not.toContain('Rubric');expect(text).toContain('Deadline');}
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
    const create = spyOn(api, 'createAssignment').and.resolveTo({ _id: 'assignment-2', title: 'Essay' });
    const toast = spyOn(alert, 'showToast');

    await (component as any).handleSubmit();

    expect(toast).toHaveBeenCalledOnceWith('Assignment created successfully', 'success');
    expect((create.calls.mostRecent().args[0] as any).rubrics).toBeUndefined();
  });

  it('copies a selected saved rubric into the assignment without retaining nested references', async () => {
    const saved: any = { _id: 'saved-1', name: 'Argument Rubric', rubricData: { totalPoints: 100, criteria: [
      { name: 'Evidence', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'Strong evidence' }, { title: 'Developing', score: 2, description: 'Developing evidence' }] },
      { name: 'Organization', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'Strong organization' }, { title: 'Developing', score: 2, description: 'Developing organization' }] },
      { name: 'Language', weight: 34, levels: [{ title: 'Strong', score: 4, description: 'Strong language' }, { title: 'Developing', score: 2, description: 'Developing language' }] }
    ] } };

    await component.useExistingRubric(saved);
    component.rubricDesignerForModal!.criteria[0].cells[0] = 'Assignment-only edit';

    expect(saved.rubricData.criteria[0].levels[0].description).toBe('Strong evidence');
    expect(component.isRubricSelectorOpen).toBeFalse();
  });

  it('requires confirmation before replacing an assignment rubric', async () => {
    component.rubricDesignerForModal = { title: 'Current', totalPoints: 100, levels: [], criteria: [] };
    const confirm = spyOn((component as any).alert, 'showConfirm').and.resolveTo(false);
    const saved: any = { _id: 'saved-1', name: 'Replacement', rubricData: { totalPoints: 100, criteria: [] } };

    await component.useExistingRubric(saved);

    expect(confirm).toHaveBeenCalled();
    expect(component.rubricDesignerForModal.title).toBe('Current');
  });

  it('saves an unsaved assignment rubric through the reusable library endpoint once', async () => {
    component.assignment = null;
    component.classForm.patchValue({ writingType: 'Argumentative' });
    component.libraryName = 'Reusable';
    component.rubricDesignerForModal = { title: 'Rubric', totalPoints: 100,
      levels: [{ title: 'Strong', maxPoints: 4 }, { title: 'Developing', maxPoints: 2 }],
      criteria: ['Evidence', 'Organization', 'Language'].map((title, i) => ({ title, weight: i === 2 ? 34 : 33, cells: ['Strong', 'Developing'] })) };
    const api = (component as any).rubricApi;
    const create = spyOn(api, 'createSavedRubric').and.resolveTo({ _id: 'saved-1', name: 'Reusable', rubricData: {} });

    await component.saveCurrentRubricToLibrary();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Reusable', writingType: 'Argumentative' }));
  });

  it('saves the current Rubric B editor state for an existing assignment while persisted Rubric A remains unchanged', async () => {
    const persistedRubricA: any = { totalPoints: 100, criteria: [
      { name: 'Persisted A', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'Persisted A strong' }, { title: 'Developing', score: 2, description: 'Persisted A developing' }] },
      { name: 'Organization A', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'A' }, { title: 'Developing', score: 2, description: 'A' }] },
      { name: 'Language A', weight: 34, levels: [{ title: 'Strong', score: 4, description: 'A' }, { title: 'Developing', score: 2, description: 'A' }] }
    ] };
    component.assignment = { _id: 'assignment-1', title: 'Existing', writingType: 'Argumentative', rubrics: persistedRubricA } as any;
    component.libraryName = 'Current editor copy';
    component.rubricDesignerForModal = { title: 'Rubric B', totalPoints: 100,
      levels: [{ title: 'Excellent B', maxPoints: 5 }, { title: 'Developing B', maxPoints: 2 }],
      criteria: [
        { title: 'Current B', weight: 33, cells: ['Current B strong', 'Current B developing'] },
        { title: 'Organization B', weight: 33, cells: ['B', 'B'] },
        { title: 'Language B', weight: 34, cells: ['B', 'B'] }
      ] };
    const api = (component as any).rubricApi;
    const create = spyOn(api, 'createSavedRubric').and.callFake(async (payload: any) => ({ _id: 'saved-b', name: payload.name, rubricData: payload.rubricData }));
    const fromAssignment = spyOn(api, 'saveFromAssignment');

    await component.saveCurrentRubricToLibrary();

    const libraryPayload: any = create.calls.mostRecent().args[0];
    expect(create).toHaveBeenCalledTimes(1);
    expect(fromAssignment).not.toHaveBeenCalled();
    expect(libraryPayload.rubricData.criteria[0]).toEqual(jasmine.objectContaining({ name: 'Current B' }));
    expect(libraryPayload.rubricData.criteria[0].levels[0]).toEqual(jasmine.objectContaining({ title: 'Excellent B', description: 'Current B strong' }));
    expect((component.assignment as any).rubrics).toBe(persistedRubricA);
    expect((component.assignment as any).rubrics.criteria[0].name).toBe('Persisted A');

    component.rubricDesignerForModal.criteria[0].cells[0] = 'Later editor mutation';
    expect(libraryPayload.rubricData.criteria[0].levels[0].description).toBe('Current B strong');
  });

  it('saves a selected rubric after editor modifications rather than the original saved template', async () => {
    const selected: any = { _id: 'saved-a', name: 'Saved A', rubricData: { totalPoints: 100, criteria: [
      { name: 'Selected A', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'Original selected text' }, { title: 'Developing', score: 2, description: 'Original' }] },
      { name: 'Organization', weight: 33, levels: [{ title: 'Strong', score: 4, description: 'Original' }, { title: 'Developing', score: 2, description: 'Original' }] },
      { name: 'Language', weight: 34, levels: [{ title: 'Strong', score: 4, description: 'Original' }, { title: 'Developing', score: 2, description: 'Original' }] }
    ] } };
    await component.useExistingRubric(selected);
    component.rubricDesignerForModal!.criteria[0].title = 'Modified selected B';
    component.rubricDesignerForModal!.criteria[0].cells[0] = 'Modified editor text';
    component.libraryName = 'Modified copy';
    const api = (component as any).rubricApi;
    const create = spyOn(api, 'createSavedRubric').and.callFake(async (payload: any) => ({ _id: 'saved-b', name: payload.name, rubricData: payload.rubricData }));

    await component.saveCurrentRubricToLibrary();

    const payload: any = create.calls.mostRecent().args[0];
    expect(payload.rubricData.criteria[0].name).toBe('Modified selected B');
    expect(payload.rubricData.criteria[0].levels[0].description).toBe('Modified editor text');
    expect(selected.rubricData.criteria[0].name).toBe('Selected A');
    expect(selected.rubricData.criteria[0].levels[0].description).toBe('Original selected text');
  });
});
