// Stage 7e: a speaking (audio) submission opens the teacher speaking page; essay submissions keep the existing page.
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DialogViewSubmissions } from './dialog-view-submissions';
import { routedHttpTestProviders } from '../../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../../auth/auth.service';

describe('DialogViewSubmissions: speaking rows (stage 7e)', () => {
  let dialog: DialogViewSubmissions;
  let navigate: jasmine.Spy;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DialogViewSubmissions],
      providers: [...routedHttpTestProviders(), { provide: AuthService, useValue: { getBackendJwt: () => null } }] }).compileComponents();
    dialog = TestBed.createComponent(DialogViewSubmissions).componentInstance;
    dialog.assignmentId = 'a1';
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  it('an audio submission goes to the speaking page with its class and assignment', () => {
    (dialog as unknown as { submissions: unknown[] }).submissions = [{ _id: 's1', sourceKind: 'audio', class: 'c1', student: { _id: 'u1' } }];
    dialog.toStudentSubmission({ submissionId: 's1' });
    expect(navigate).toHaveBeenCalledWith(['/teacher/my-classes/detail/speaking-submission', 's1'], { queryParams: { classId: 'c1', assignmentId: 'a1' } });
  });

  it('an essay submission is unchanged', () => {
    (dialog as unknown as { submissions: unknown[] }).submissions = [{ _id: 's2', class: 'c1', student: { _id: 'u2' } }];
    dialog.toStudentSubmission({ submissionId: 's2' });
    expect(navigate).toHaveBeenCalledWith(['/teacher/my-classes/detail/student-submissions', 'u2'],
      { queryParams: { classId: 'c1', assignmentId: 'a1', submissionId: 's2' } });
  });
});
