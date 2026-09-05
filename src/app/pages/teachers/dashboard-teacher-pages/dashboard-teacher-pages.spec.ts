import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { DashboardTeacherPages } from './dashboard-teacher-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders,
  verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('DashboardTeacherPages', () => {
  afterEach(verifyHttpRequestsAfterEach);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTeacherPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    }).compileComponents();
  });

  async function loadDashboard(presentSummary: boolean): Promise<ComponentFixture<DashboardTeacherPages>> {
    const fixture = TestBed.createComponent(DashboardTeacherPages);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:5000/api/classes/mine?status=active').flush({ success: true, data: [] });
    http.expectOne('http://localhost:5000/api/teacher/activity-summary').flush({ success: true, data: {
      since: null, viewedAt: '2026-09-03T00:00:00.000Z', isFirstVisit: true,
      sinceLastVisit: { newSubmissions: 0, revisedDrafts: 0, adaptiveCompletions: 0 },
      current: { waitingForReview: 0 }, ackToken: 'signed-token'
    } });
    http.expectOne('http://localhost:5000/api/teacher/milestones').flush({ success: true, data: {
      achieved: [{ key: 'FIRST_CLASS', title: 'First class created', description: '', achieved: true,
        achievedAt: '2026-09-03T00:00:00.000Z', rewardGranted: false, current: 1, target: 1, percent: 100 }],
      inProgress: [{ key: 'ASSESSMENTS_10', title: 'Assessment practice established', description: '', achieved: false,
        achievedAt: null, rewardGranted: false, current: 4, target: 10, percent: 40 }],
      nextMilestone: { key: 'ASSESSMENTS_10', title: 'Assessment practice established', description: '', achieved: false,
        achievedAt: null, rewardGranted: false, current: 4, target: 10, percent: 40 }
    } });
    http.expectOne('http://localhost:5000/api/teacher/weekly-summary').flush({ success: true, data: {
      window: { start: '2026-08-27T00:00:00.000Z', end: '2026-09-03T00:00:00.000Z', label: 'Previous 7 days' },
      headline: 'This week: 3 submissions, 1 revised draft, and 2 students improved.',
      activity: { newSubmissions: 3, revisedDrafts: 1, adaptiveCompletions: 2, successfulAssessments: 3 },
      progress: { studentsImproved: 2, improvedRevisions: 2, averageRevisionScoreDelta: null,
        issuesCorrected: 4, strongestImprovedCategory: null },
      current: { waitingForReview: 5, classesWithPendingReview: 1 },
      classes: [{ id: 'class-1', name: 'English 8A', newSubmissions: 3, revisedDrafts: 1,
        adaptiveCompletions: 2, successfulAssessments: 3, waitingForReview: 5, studentsImproved: 2 }]
    } });
    await fixture.whenStable();
    http.expectNone('http://localhost:5000/api/teacher/activity-summary/acknowledge');
    if (presentSummary) {
      fixture.detectChanges();
      http.expectOne('http://localhost:5000/api/teacher/activity-summary/acknowledge')
        .flush({ success: true, data: { viewedAt: '2026-09-03T00:00:00.000Z' } });
      await fixture.whenStable();
    }
    return fixture;
  }

  it('renders the summary and acknowledges it after the presentation lifecycle', async () => {
    const fixture = await loadDashboard(true);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Welcome back');
    expect(fixture.nativeElement.textContent).toContain('baseline is ready');
    expect(fixture.nativeElement.textContent).toContain('3 submissions');
    expect(fixture.nativeElement.textContent).toContain('Waiting for review now');
    expect(fixture.nativeElement.textContent).not.toContain('Average draft change: 0');
  });

  it('renders achieved and in-progress milestone state with authoritative progress', async () => {
    const fixture = await loadDashboard(false);
    spyOn(fixture.componentInstance.device, 'isDesktop').and.returnValue(true);
    fixture.componentInstance.milestones.set({
      achieved: [{ key: 'FIRST_CLASS', title: 'First class created', description: '', achieved: true,
        achievedAt: '2026-09-03T00:00:00.000Z', rewardGranted: false, current: 1, target: 1, percent: 100 }],
      inProgress: [{ key: 'ASSESSMENTS_10', title: 'Assessment practice established', description: '', achieved: false,
        achievedAt: null, rewardGranted: false, current: 4, target: 10, percent: 40 }],
      nextMilestone: { key: 'ASSESSMENTS_10', title: 'Assessment practice established', description: '', achieved: false,
        achievedAt: null, rewardGranted: false, current: 4, target: 10, percent: 40 }
    }); fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('[data-testid="professional-milestones"]');
    expect(section.textContent).toContain('Professional Milestones'); expect(section.textContent).toContain('4 / 10');
    expect(section.textContent).toContain('First class created');
    const request = TestBed.inject(HttpTestingController).match('http://localhost:5000/api/teacher/activity-summary/acknowledge');
    request.forEach((item) => item.flush({ success: true, data: { viewedAt: '2026-09-03T00:00:00.000Z' } }));
  });

  it('does not acknowledge when destroyed before the presentation lifecycle', async () => {
    const fixture = await loadDashboard(false);
    fixture.destroy();
    TestBed.inject(HttpTestingController).expectNone('http://localhost:5000/api/teacher/activity-summary/acknowledge');
  });
});
