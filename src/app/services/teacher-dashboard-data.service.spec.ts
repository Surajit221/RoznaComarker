import { TeacherDashboardDataService } from './teacher-dashboard-data.service';

describe('TeacherDashboardDataService', () => {
  async function dashboardForFeedback(feedbackById: Record<string, unknown>) {
    const ids = Object.keys(feedbackById);
    const service = new TeacherDashboardDataService(
      { getClassAssignments: async () => [{ _id: 'assignment-1', title: 'Essay' }] } as any,
      {
        getMyTeacherClasses: async () => [{ _id: 'class-1', name: 'Class One' }],
        getClassSummary: async () => ({ id: 'class-1', studentsCount: ids.length })
      } as any,
      {
        getSubmissionsByAssignment: async () => ids.map((id, index) => ({
          _id: id,
          student: { _id: `student-${index}`, displayName: `Student ${index}` },
          submittedAt: '2026-08-01T00:00:00.000Z'
        }))
      } as any,
      { getSubmissionFeedback: async (id: string) => feedbackById[id] } as any
    );
    return service.fetchDashboardData();
  }

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

  it('averages every completed finite score independently of teacher review', async () => {
    const data = await dashboardForFeedback({
      first: { evaluationStatus: 'completed', overallScore: 80 },
      second: { evaluationStatus: 'completed', overallScore: 70, teacherReviewedAt: '2026-08-02T00:00:00Z' }
    });

    expect(data.stats.avgScore).toBe(75);
    expect(data.stats.pendingCount).toBe(1);
  });

  it('preserves decimals and excludes pending, failed, missing, and non-numeric scores', async () => {
    const data = await dashboardForFeedback({
      scored: { evaluationStatus: 'completed', overallScore: 78.5 },
      pending: { evaluationStatus: 'pending', overallScore: 10 },
      failed: { evaluationStatus: 'failed' },
      missing: { evaluationStatus: 'completed', overallScore: null },
      invalid: { evaluationStatus: 'completed', overallScore: '90' }
    });

    expect(data.stats.avgScore).toBe(78.5);
  });

  it('returns zero when no submission has a completed finite score', async () => {
    const data = await dashboardForFeedback({
      pending: { evaluationStatus: 'pending' },
      failed: { evaluationStatus: 'failed' }
    });

    expect(data.stats.avgScore).toBe(0);
  });
});
