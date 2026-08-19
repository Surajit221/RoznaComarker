import { TeacherDashboardDataService } from './teacher-dashboard-data.service';

describe('TeacherDashboardDataService', () => {
  it('matches class summaries by id or _id when building class cards', async () => {
    const classApi = {
      getMyTeacherClasses: async () => [{ _id: 'class-1', name: 'Class One' }],
      getClassSummary: async () => ({ id: 'class-1', studentsCount: 1 })
    };
    const assignmentApi = {
      getClassAssignments: async () => []
    };
    const submissionApi = {
      getSubmissionsByAssignment: async () => []
    };
    const feedbackApi = {
      getSubmissionFeedback: async () => ({})
    };

    const service = new TeacherDashboardDataService(
      assignmentApi as any,
      classApi as any,
      submissionApi as any,
      feedbackApi as any
    );

    const data = await service.fetchDashboardData();

    expect(data.stats.totalStudents).toBe(1);
    expect(data.classCards).toEqual([
      jasmine.objectContaining({
        id: 'class-1',
        studentsCount: 1
      })
    ]);
  });
});
