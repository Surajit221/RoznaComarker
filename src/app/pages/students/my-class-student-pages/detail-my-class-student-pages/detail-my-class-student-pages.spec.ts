import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassStudentPages } from './detail-my-class-student-pages';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../auth/auth.service';

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
});
