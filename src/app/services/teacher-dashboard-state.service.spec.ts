import { TeacherDashboardStateService } from './teacher-dashboard-state.service';

describe('TeacherDashboardStateService', () => {
  it('marks a submission reviewed exactly once without changing the score average', async () => {
    const service = new TeacherDashboardStateService({
      fetchDashboardData: async () => ({
        submissions: [
          { id: 'a', student: {}, class: {}, assignment: {}, score: 80, status: 'submitted', submittedAt: '' },
          { id: 'b', student: {}, class: {}, assignment: {}, score: 70, status: 'submitted', submittedAt: '' }
        ],
        stats: { pendingCount: 2, totalStudents: 2, avgScore: 75, activeClasses: 1 },
        classCards: [],
        needsAttention: []
      })
    } as any);
    let latest: any;
    service.state$.subscribe((state) => latest = state);
    await service.refresh();

    service.markReviewed('a');
    service.markReviewed('a');

    expect(latest.stats.pendingCount).toBe(1);
    expect(latest.stats.avgScore).toBe(75);
    expect(latest.submissions.find((item: any) => item.id === 'a').status).toBe('reviewed');
  });
});
