// Stage 7g: speaking assignments stay out of the teacher dashboard's essay numbers (pending, average, needs attention, recent submissions) and
// their essay feedback is never requested; their deadlines still count.
import { TeacherDashboardDataService } from './teacher-dashboard-data.service';

describe('TeacherDashboardDataService and speaking assignments (stage 7g)', () => {
  it('loads submissions and feedback for essays only; deadlines today still include speaking', async () => {
    const today = new Date(); today.setHours(23, 0, 0, 0);
    const submissionsFor = jasmine.createSpy('getSubmissionsByAssignment').and.callFake(async (id: string) => [{
      _id: `sub-${id}`, student: { _id: 'u1', displayName: 'Ana' }, submittedAt: '2026-11-01T00:00:00Z' }]);
    const feedback = jasmine.createSpy('getSubmissionFeedback').and.resolveTo({ overallScore: 40, evaluationStatus: 'completed', teacherReviewedAt: '2026-11-02T00:00:00Z' });
    const service = new TeacherDashboardDataService(
      { getClassAssignments: async () => [{ _id: 'essay-1', title: 'Essay', deadline: today.toISOString() },
        { _id: 'talk-1', title: 'Talk', resourceType: 'speaking', deadline: today.toISOString() }] } as never,
      { getMyTeacherClasses: async () => [{ _id: 'c1', name: 'Class One' }], getClassSummary: async () => ({ id: 'c1', studentsCount: 1 }) } as never,
      { getSubmissionsByAssignment: submissionsFor } as never,
      { getSubmissionFeedback: feedback } as never);
    const data = await service.fetchDashboardData();
    expect(submissionsFor.calls.allArgs().map(a => a[0])).toEqual(['essay-1']);
    expect(feedback.calls.allArgs()).toEqual([['sub-essay-1']]);
    expect(data.submissions.map(s => s.assignment.id)).toEqual(['essay-1']);
    expect(data.classCards[0].deadlinesTodayCount).toBe(2);
  });
});
