import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassesPages } from './detail-my-classes-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../testing/standalone-test-providers';
import { Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';

describe('DetailMyClassesPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: DetailMyClassesPages;
  let fixture: ComponentFixture<DetailMyClassesPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders class link and code display inputs without requiring an NgControl provider', () => {
    component.classSummary = { name: 'English', joinCode: 'ABC123' } as any;
    fixture.detectChanges();

    const displayInputs = Array.from(
      fixture.nativeElement.querySelectorAll('input[readonly]') as NodeListOf<HTMLInputElement>
    ).filter(input => input.value.includes('ABC123') || input.value.includes('/join/'));
    expect(displayInputs.length).toBeGreaterThan(0);
    expect(displayInputs.every(input => !input.hasAttribute('formControlName'))).toBeTrue();
  });

  it('shows the teacher Duplicate action and opens review without creating immediately', () => {
    const source: any = { _id: 'assignment-1', title: 'Essay', deadline: new Date(Date.now() + 86400000).toISOString(),
      class: 'class-1', qrToken: 'qr-1', isActive: true, resourceType: 'essay' };
    component.classId = 'class-1';
    component.assignments = [{ id: 'assignment-1', title: 'Essay', dueDate: 'Tomorrow', submitted: 0, total: 0,
      status: 'pending', resourceType: 'essay' }];
    (component as any).assignmentsById = { 'assignment-1': source };
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Duplicate');
    component.openDuplicateAssignment('assignment-1');
    expect(component.showDuplicateDialog).toBeTrue();
    expect(component.selectedAssignmentForDuplicate).toBe(source);
  });

  it('adds a same-class duplicate reactively and navigates for a cross-class duplicate', async () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const toast = spyOn(TestBed.inject(AlertService), 'showToast');
    component.classId = 'class-1';
    const duplicate: any = { _id: 'assignment-2', title: 'Essay - Copy', deadline: new Date(Date.now() + 86400000).toISOString(),
      class: 'class-1', qrToken: 'qr-2', isActive: true, resourceType: 'essay' };
    await component.onAssignmentDuplicated({ assignment: duplicate, targetClassId: 'class-1' });
    expect(component.assignments[0].id).toBe('assignment-2');
    expect(navigate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Assignment duplicated successfully.', 'success');

    await component.onAssignmentDuplicated({ assignment: { ...duplicate, _id: 'assignment-3' }, targetClassId: 'class-2' });
    expect(navigate).toHaveBeenCalledWith(['/teacher/my-classes/detail', 'class-2']);
  });

  it('opens the Assignment edit flow for Flashcard and Worksheet assignments', () => {
    const router=TestBed.inject(Router);const navigate=spyOn(router,'navigate');
    const flash:any={_id:'flash-assignment',title:'Solar System',resourceType:'flashcard',resourceId:'set-1',isActive:true};
    const worksheet:any={_id:'worksheet-assignment',title:'Practice',resourceType:'worksheet',resourceId:'sheet-1',isActive:true};
    (component as any).assignmentsById={[flash._id]:flash,[worksheet._id]:worksheet};
    component.onEditAssignment(flash._id);expect(component.selectedAssignmentForEdit).toBe(flash);expect(component.showDialog).toBeTrue();
    component.showDialog=false;component.onEditAssignment(worksheet._id);expect(component.selectedAssignmentForEdit).toBe(worksheet);expect(component.showDialog).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the top-level rubric editor automatically for the persisted writing assignment', async () => {
    const created: any = { _id: 'writing-2', title: 'New Essay', resourceType: 'essay' };
    spyOn(component as any, 'loadAssignments').and.resolveTo();
    const open = spyOn(component as any, 'openRubricForAssignment').and.callFake(async (id: string) => {
      component.selectedRubricAssignmentId = id;
      component.showRubricDialog = true;
    });

    await component.onAssignmentCreated(created);

    expect(open).toHaveBeenCalledOnceWith('writing-2');
    expect(component.selectedRubricAssignmentId).toBe('writing-2');
    expect(component.showRubricDialog).toBeTrue();
    expect(component.showDialog).toBeFalse();
  });

  it('opens Use Existing above the editor and deep-copies the selected saved rubric', async () => {
    component.showRubricDialog = true;
    component.openExistingRubricSelector();
    expect(component.isRubricSelectorOpen).toBeTrue();
    const saved: any = { _id: 'saved-1', name: 'Evidence', rubricData: { totalPoints: 100, criteria: [
      { name: 'Evidence', weight: 100, levels: [{ title: 'Strong', score: 4, description: 'Original' }] }
    ] } };

    await component.useExistingRubric(saved);
    component.selectedRubricDesigner!.criteria[0].cells[0] = 'Assignment copy';

    expect(component.isRubricSelectorOpen).toBeFalse();
    expect(component.showRubricDialog).toBeTrue();
    expect(saved.rubricData.criteria[0].levels[0].description).toBe('Original');
  });

  it('attaches a rubric through one update to the same persisted assignment', async () => {
    component.selectedRubricAssignmentId = 'writing-2';
    const api = (component as any).assignmentApi;
    const update = spyOn(api, 'updateAssignment').and.resolveTo({ _id: 'writing-2', title: 'New Essay' });
    spyOn(component as any, 'loadAssignments').and.resolveTo();
    const designer: any = { title: 'Rubric', totalPoints: 100,
      levels: [{ title: 'Strong', maxPoints: 4 }],
      criteria: [{ title: 'Evidence', weight: 100, cells: ['Strong evidence'] }] };

    await component.onSaveAssignmentRubric(designer);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.calls.mostRecent().args[0]).toBe('writing-2');
    expect(component.selectedRubricAssignmentId).toBeNull();
  });
});
