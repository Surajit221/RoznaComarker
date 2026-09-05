import { Subject } from 'rxjs';
import { TeacherActivityStateService } from './teacher-activity-state.service';

describe('TeacherActivityStateService', () => {
  const summary = (ackToken = 'token', newSubmissions = 2) => ({
    since: '2026-09-02T00:00:00.000Z', viewedAt: '2026-09-03T00:00:00.000Z', isFirstVisit: false,
    sinceLastVisit: { newSubmissions, revisedDrafts: 1, adaptiveCompletions: 0 },
    current: { waitingForReview: 3 }, ackToken
  });

  function setup(apiOverrides: any = {}) {
    const notifications = new Subject<any>(); const events = new Subject<any>();
    const api = { getSummary: jasmine.createSpy().and.resolveTo(summary()),
      acknowledge: jasmine.createSpy().and.resolveTo(undefined), ...apiOverrides };
    const service = new TeacherActivityStateService(api as any, {
      notifications$: notifications.asObservable(), events$: events.asObservable()
    } as any);
    return { service, api, notifications, events };
  }

  it('loads authoritative data without acknowledging it', async () => {
    const { service, api } = setup();
    let state: any; service.state$.subscribe((value) => state = value);
    await service.refresh();
    expect(api.acknowledge).not.toHaveBeenCalled();
    expect(state.data.sinceLastVisit.newSubmissions).toBe(2);
    expect(state.error).toBeFalse();
  });

  it('acknowledges a displayed token at most once across repeated lifecycle calls', async () => {
    const { service, api } = setup();
    await service.refresh();
    const [one, two] = await Promise.all([
      service.acknowledgeDisplayedSummary(), service.acknowledgeDisplayedSummary()
    ]);
    expect(one).toBeTrue(); expect(two).toBeTrue();
    await service.acknowledgeDisplayedSummary();
    expect(api.acknowledge).toHaveBeenCalledOnceWith('token');
  });

  it('retains displayed activity after ACK failure and can safely retry', async () => {
    const acknowledge = jasmine.createSpy().and.rejectWith(new Error('offline'));
    const { service } = setup({ acknowledge });
    let state: any; service.state$.subscribe((value) => state = value);
    await service.refresh();
    expect(await service.acknowledgeDisplayedSummary()).toBeFalse();
    expect(state.data.sinceLastVisit.newSubmissions).toBe(2);
    acknowledge.and.resolveTo(undefined);
    expect(await service.acknowledgeDisplayedSummary()).toBeTrue();
    expect(acknowledge).toHaveBeenCalledTimes(2);
  });

  it('does not fabricate zeroes when loading fails', async () => {
    const { service } = setup({ getSummary: jasmine.createSpy().and.rejectWith(new Error('offline')) });
    let state: any; service.state$.subscribe((value) => state = value);
    await service.refresh();
    expect(state.data).toBeNull(); expect(state.error).toBeTrue();
  });

  it('deduplicates submissions, reviews, and Adaptive completions by stable identifiers', async () => {
    const { service, notifications, events } = setup();
    let state: any; service.state$.subscribe((value) => state = value);
    await service.refresh();
    const notification = { _id: 'n1', type: 'assignment_submitted', data: { draftNumber: 2, waitingReviewAdded: true } };
    notifications.next(notification); notifications.next(notification);
    const adaptiveOne = { type: 'teacher_activity_invalidated', data: { type: 'adaptive_completion', sessionId: 'session-1' } };
    events.next(adaptiveOne); events.next(adaptiveOne);
    events.next({ type: 'teacher_activity_invalidated', data: { type: 'adaptive_completion', sessionId: 'session-2' } });
    const review = { type: 'teacher_activity_invalidated', data: { type: 'review_completed', submissionId: 'submission-2' } };
    events.next(review); events.next(review);
    expect(state.data.sinceLastVisit).toEqual({ newSubmissions: 2, revisedDrafts: 2, adaptiveCompletions: 2 });
    expect(state.data.current.waitingForReview).toBe(3);
  });

  it('replaces optimistic realtime counts with the next authoritative response', async () => {
    const getSummary = jasmine.createSpy().and.returnValues(
      Promise.resolve(summary('token-1', 2)), Promise.resolve(summary('token-2', 7))
    );
    const { service, notifications } = setup({ getSummary });
    let state: any; service.state$.subscribe((value) => state = value);
    await service.refresh();
    notifications.next({ _id: 'n1', type: 'assignment_submitted', data: { draftNumber: 1 } });
    expect(state.data.sinceLastVisit.newSubmissions).toBe(3);
    await service.refresh();
    expect(state.data.sinceLastVisit.newSubmissions).toBe(7);
  });
});
