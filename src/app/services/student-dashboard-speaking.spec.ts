// Stage 7g: speaking recordings on the student dashboard: not essays (no essay count, average or latest feedback, and no essay feedback request),
// but still a submitted assignment (class progress) and no longer an upcoming deadline.
import { EMPTY } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { StudentDashboardDataService } from './student-dashboard-data.service';
import { StudentDashboardStateService } from './student-dashboard-state.service';

const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
const ASSIGNMENTS = [{ _id: 'essay-1', title: 'Essay', class: { _id: 'c1' }, deadline: future }, { _id: 'talk-1', title: 'Talk', class: { _id: 'c1' }, deadline: future, resourceType: 'speaking' }];
const SUBMISSIONS = [{ _id: 's-essay', status: 'submitted', assignment: { _id: 'essay-1', title: 'Essay' }, class: { _id: 'c1' } },
  { _id: 's-audio', status: 'submitted', sourceKind: 'audio', assignment: { _id: 'talk-1', title: 'Talk' }, class: { _id: 'c1' } }];

function dataService(feedback: jasmine.Spy) {
  return new StudentDashboardDataService(
    { getMeProfile: async () => null } as never,
    { getMyMemberships: async () => [{ class: { _id: 'c1', name: 'Class One', isActive: true } }] } as never,
    { getMyAssignments: async () => ASSIGNMENTS } as never,
    { getMySubmissions: async () => SUBMISSIONS } as never,
    { getSubmissionFeedback: feedback } as never);
}

describe('Student dashboard and speaking recordings (stage 7g)', () => {
  it('asks for essay feedback only for essays (the audio item would answer 404)', async () => {
    const feedback = jasmine.createSpy('getSubmissionFeedback').and.resolveTo({ overallScore: 80 });
    const data = await dataService(feedback).fetchDashboardData();
    expect(feedback.calls.allArgs()).toEqual([['s-essay']]);
    expect(data.feedbackBySubmissionId['s-audio']).toBeNull();
  });

  it('essays done, average and latest feedback leave speaking out; class progress and deadlines count it as submitted', async () => {
    spyOn(window, 'setInterval').and.returnValue(0 as never);
    const feedback = jasmine.createSpy('getSubmissionFeedback').and.callFake(async (id: string) => (id === 's-essay'
      ? { overallScore: 80, createdAt: '2026-11-01T00:00:00Z' } : { overallScore: 10, createdAt: '2026-11-02T00:00:00Z' }));
    const data = dataService(feedback);
    // Even if a score arrived for the recording, it never counts as an essay result.
    spyOn(data, 'fetchDashboardData').and.resolveTo({ me: null, memberships: [{ class: { _id: 'c1', name: 'Class One', isActive: true } }] as never,
      assignments: ASSIGNMENTS as never, submissions: SUBMISSIONS as never,
      feedbackBySubmissionId: { 's-essay': { overallScore: 80, createdAt: '2026-11-01T00:00:00Z' } as never, 's-audio': { overallScore: 10, createdAt: '2026-11-02T00:00:00Z' } as never } });
    const state = new StudentDashboardStateService(data, { notifications$: EMPTY } as never);
    await state.refresh();
    expect(await firstValueFrom(state.stats$)).toEqual(jasmine.objectContaining({ essaysDone: 1, avgScore: 80 }));
    expect((await firstValueFrom(state.latestFeedback$))?.submissionId).toBe('s-essay');
    expect((await firstValueFrom(state.classCards$))[0].progressPct).toBe(100);
    expect((await firstValueFrom(state.upcomingDeadlines$)).length).toBe(0);
  });
});
