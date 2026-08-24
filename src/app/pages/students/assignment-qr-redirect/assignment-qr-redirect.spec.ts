import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AssignmentApiService, type BackendAssignment } from '../../../api/assignment-api.service';
import { AssignmentQrRedirect } from './assignment-qr-redirect';

describe('AssignmentQrRedirect', () => {
  const navigate = jasmine.createSpy('navigate').and.resolveTo(true);
  const getAssignmentByQrToken = jasmine.createSpy('getAssignmentByQrToken');

  beforeEach(async () => {
    navigate.calls.reset();
    getAssignmentByQrToken.calls.reset();
    await TestBed.configureTestingModule({
      imports: [AssignmentQrRedirect],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'token-1' } } } },
        { provide: Router, useValue: { navigate } },
        { provide: AssignmentApiService, useValue: { getAssignmentByQrToken } },
      ],
    }).compileComponents();
  });

  async function resolve(resourceType?: 'essay' | 'flashcard' | 'worksheet', resourceId?: string) {
    getAssignmentByQrToken.and.resolveTo({
      _id: 'assignment-1', title: 'Assigned work', resourceType, resourceId,
      class: { _id: 'class-1' },
    } as BackendAssignment);
    const fixture = TestBed.createComponent(AssignmentQrRedirect);
    await fixture.componentInstance.ngOnInit();
  }

  it('opens flashcards in assignment context', async () => {
    await resolve('flashcard', 'set-1');
    expect(navigate).toHaveBeenCalledOnceWith(['/student/flashcard-player', 'set-1'], {
      queryParams: { assignmentId: 'assignment-1', classId: 'class-1' },
    });
  });

  it('opens worksheets in assignment context', async () => {
    await resolve('worksheet', 'worksheet-1');
    expect(navigate).toHaveBeenCalledOnceWith(['/student/worksheet', 'worksheet-1'], {
      queryParams: { assignmentId: 'assignment-1', classId: 'class-1' },
    });
  });

  it('opens essay and legacy assignments in the class assignment flow', async () => {
    await resolve();
    expect(navigate).toHaveBeenCalledOnceWith(['/student/my-classes/detail', 'class-1'], {
      queryParams: { assignmentId: 'assignment-1' },
    });
  });
});
