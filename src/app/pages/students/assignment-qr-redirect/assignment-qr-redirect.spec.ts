import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
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
      ],
    })
      // The component provides AssignmentApiService itself, so stub it at component level.
      .overrideComponent(AssignmentQrRedirect, {
        set: { providers: [{ provide: AssignmentApiService, useValue: { getAssignmentByQrToken } }] },
      })
      .compileComponents();
  });

  async function fail(error: unknown): Promise<string> {
    spyOn(console, 'error');
    getAssignmentByQrToken.and.rejectWith(error);
    const fixture = TestBed.createComponent(AssignmentQrRedirect);
    await fixture.componentInstance.ngOnInit();
    expect(console.error).toHaveBeenCalledWith('Assignment QR access failed', error);
    expect(navigate).not.toHaveBeenCalled();
    return fixture.componentInstance.errorMessage;
  }

  it('explains a 403 as missing class membership', async () => {
    expect(await fail(new HttpErrorResponse({ status: 403, error: { message: 'Forbidden' } })))
      .toBe("You're not a member of this class. Join with your class code.");
  });

  it('explains a 404 as an unavailable assignment', async () => {
    expect(await fail(new HttpErrorResponse({ status: 404, error: { message: 'Assignment not found' } })))
      .toBe('This assignment is no longer available.');
  });

  it('explains a status 0 network or CORS failure as a connection problem', async () => {
    expect(await fail(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') })))
      .toBe("Couldn't reach the server. Please check your connection and retry.");
  });

  it('does not disguise a thrown client error as an access denial', async () => {
    expect(await fail(new TypeError('getAssignmentByQrToken is not a function')))
      .toBe("Couldn't reach the server. Please check your connection and retry.");
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
