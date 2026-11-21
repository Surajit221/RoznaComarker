// Stage 7g: the Reports page is about essays: speaking assignments are left out of its numbers and their submissions are never loaded.
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { FeedbackApiService } from '../../../api/feedback-api.service';
import { SubmissionApiService } from '../../../api/submission-api.service';
import { ReportPages } from './report-pages';

describe('ReportPages and speaking assignments (stage 7g)', () => {
  it('counts only the essay; the speaking assignment is never loaded', async () => {
    const submissions = jasmine.createSpy('getSubmissionsByAssignment').and.callFake(async (id: string) => [{ _id: `sub-${id}`,
      student: { _id: 'u1', displayName: 'Ana' }, assignment: { _id: id, title: id }, submittedAt: '2026-11-01T00:00:00Z' }]);
    const feedback = jasmine.createSpy('getSubmissionFeedback').and.resolveTo({ overallScore: 90, correctionStats: { grammar: 1, mechanics: 0, organization: 0, content: 0, vocabulary: 0 } });
    await TestBed.configureTestingModule({ imports: [ReportPages], providers: [
      { provide: ClassApiService, useValue: { getMyTeacherClasses: async () => [{ _id: 'c1', name: 'Class One' }] } },
      { provide: AssignmentApiService, useValue: { getClassAssignments: async () => [{ _id: 'essay-1' }, { _id: 'talk-1', resourceType: 'speaking' }] } },
      { provide: SubmissionApiService, useValue: { getSubmissionsByAssignment: submissions } },
      { provide: FeedbackApiService, useValue: { getSubmissionFeedback: feedback } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } }] }).compileComponents();
    const fixture = TestBed.createComponent(ReportPages);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submissions.calls.allArgs().map(a => a[0])).toEqual(['essay-1']);
    expect(feedback.calls.allArgs()).toEqual([['sub-essay-1']]);
    expect(fixture.componentInstance.totalEssays).toBe(1);
  });
});
