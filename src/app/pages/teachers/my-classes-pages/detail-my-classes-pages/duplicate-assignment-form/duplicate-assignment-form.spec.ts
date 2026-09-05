import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentApiService, type BackendAssignment } from '../../../../../api/assignment-api.service';
import { ClassApiService } from '../../../../../api/class-api.service';
import { DuplicateAssignmentForm } from './duplicate-assignment-form';

describe('DuplicateAssignmentForm', () => {
  let fixture: ComponentFixture<DuplicateAssignmentForm>;
  let assignmentApi: jasmine.SpyObj<AssignmentApiService>;
  const source = {
    _id: 'assignment-1', title: 'Argumentative Essay', writingType: 'Argumentative',
    instructions: 'Write a supported argument.', rubrics: { totalPoints: 100, criteria: [] },
    deadline: new Date(Date.now() + 86400000 * 4).toISOString(), class: 'class-1', teacher: 'teacher-1',
    qrToken: 'source-qr', showMarksToStudent: false, allowResubmission: true,
    requireAdaptiveBeforeResubmission: true, isActive: true, createdAt: '', updatedAt: ''
  } as BackendAssignment;

  beforeEach(async () => {
    assignmentApi = jasmine.createSpyObj<AssignmentApiService>('AssignmentApiService', ['duplicateAssignment']);
    await TestBed.configureTestingModule({ imports: [DuplicateAssignmentForm], providers: [
      { provide: AssignmentApiService, useValue: assignmentApi },
      { provide: ClassApiService, useValue: { getMyTeacherClasses: jasmine.createSpy().and.resolveTo([
        { _id: 'class-1', name: 'Current Class', isActive: true, status: 'active' },
        { _id: 'class-2', name: 'Target Class', isActive: true, status: 'active' },
        { _id: 'class-3', name: 'Archived Class', isActive: true, status: 'archived' }
      ]) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(DuplicateAssignmentForm);
    fixture.componentRef.setInput('assignment', source);
    fixture.componentRef.setInput('currentClassId', 'class-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the teacher action form prefilled from the source with active owned classes only', () => {
    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      targetClassId: 'class-1', title: 'Argumentative Essay - Copy',
      deadline: new Date(source.deadline).toISOString().slice(0, 10)
    });
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Duplicate Assignment');
    expect(text).toContain('Rubric');
    expect(text).toContain('Adaptive Learning settings');
    expect(text).not.toContain('Archived Class');
  });

  it('allows class, title, and deadline changes and submits exactly once while a request is pending', async () => {
    let resolve!: (value: BackendAssignment) => void;
    assignmentApi.duplicateAssignment.and.returnValue(new Promise((done) => { resolve = done; }));
    const deadline = new Date(Date.now() + 86400000 * 8).toISOString().slice(0, 10);
    fixture.componentInstance.form.setValue({ targetClassId: 'class-2', title: 'Revised Copy', deadline });
    const emitted = jasmine.createSpy('duplicated'); fixture.componentInstance.duplicated.subscribe(emitted);

    const first = fixture.componentInstance.submit();
    const second = fixture.componentInstance.submit();
    expect(assignmentApi.duplicateAssignment).toHaveBeenCalledTimes(1);
    expect(assignmentApi.duplicateAssignment).toHaveBeenCalledWith('assignment-1', {
      targetClassId: 'class-2', title: 'Revised Copy', deadline: new Date(`${deadline}T23:59:59.999`).toISOString()
    });
    resolve({ ...source, _id: 'assignment-2', title: 'Revised Copy', class: 'class-2', qrToken: 'new-qr' });
    await Promise.all([first, second]);
    expect(emitted).toHaveBeenCalledOnceWith(jasmine.objectContaining({ targetClassId: 'class-2' }));
  });

  it('requires a new deadline when the source deadline has expired', () => {
    fixture.componentRef.setInput('assignment', { ...source, deadline: new Date(Date.now() - 1000).toISOString() });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.deadline.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('source deadline has passed');
  });

  it('describes only capabilities applicable to Flashcard and Worksheet duplicates', () => {
    for(const [resourceType,label] of [['flashcard','Flashcard resource'],['worksheet','Worksheet resource']]){
      fixture.componentRef.setInput('assignment',{...source,resourceType,resourceId:`${resourceType}-1`} as any);fixture.detectChanges();
      const text=fixture.nativeElement.textContent;expect(text).toContain(label);expect(text).toContain('Assignment details');
      expect(text).not.toContain('Resubmission settings');expect(text).not.toContain('Adaptive Learning settings');expect(text).not.toContain('Rubric');
    }
  });

  it('fits supported mobile widths without horizontal overflow', () => {
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 412, 430, 768, 1024]) {
      host.style.width = `${width}px`;
      fixture.detectChanges();
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
    }
  });
});
