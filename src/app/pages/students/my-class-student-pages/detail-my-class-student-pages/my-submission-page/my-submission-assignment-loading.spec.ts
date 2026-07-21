/* eslint-disable @typescript-eslint/no-explicit-any -- private orchestration is exercised without Angular page setup */
import { MySubmissionPage } from './my-submission-page';

describe('MySubmissionPage assignment metadata loading', () => {
  const assignmentA = '6a5fd9a49e7a38091739722e';
  const assignmentB = '6a5fd9a49e7a38091739722f';

  function subject(getAssignmentById: jasmine.Spy): any {
    const value = Object.create(MySubmissionPage.prototype) as any;
    value.assignmentApi = { getAssignmentById };
    value.loadSeq = 1;
    value.destroyed = false;
    value.assignment = null;
    value.assignmentUnavailable = false;
    value.canonicalResultState = { submissionId: 'submission-1', evaluationStatus: 'completed', score: 85 };
    return value;
  }

  it('uses the assignment id persisted on the current submission', async () => {
    const getAssignment = jasmine.createSpy().and.resolveTo({ _id: assignmentA });
    const component = subject(getAssignment);
    component.submission = { assignment: { _id: assignmentA } };
    await component.loadAssignmentMetadata(component.submission, 1);
    expect(getAssignment).toHaveBeenCalledOnceWith(assignmentA);
    expect(component.assignmentId).toBe(assignmentA);
  });

  it('does not request assignment metadata without a valid persisted id', async () => {
    const getAssignment = jasmine.createSpy();
    const component = subject(getAssignment);
    component.submission = { assignment: undefined };
    await component.loadAssignmentMetadata(component.submission, 1);
    expect(getAssignment).not.toHaveBeenCalled();
  });

  it('ignores a stale assignment failure after the submission changes', async () => {
    let reject!: (error: unknown) => void;
    const getAssignment = jasmine.createSpy().and.returnValue(new Promise((_resolve, rejectValue) => reject = rejectValue));
    const component = subject(getAssignment);
    component.submission = { assignment: assignmentA };
    const pending = component.loadAssignmentMetadata(component.submission, 1);
    component.loadSeq = 2;
    component.submission = { assignment: assignmentB };
    reject({ status: 404 });
    await pending;
    expect(component.assignmentUnavailable).toBeFalse();
  });

  it('keeps completed canonical feedback authoritative when assignment metadata is missing', async () => {
    const getAssignment = jasmine.createSpy().and.rejectWith({ status: 404 });
    const component = subject(getAssignment);
    component.submission = { assignment: assignmentA };
    const canonical = component.canonicalResultState;
    await component.loadAssignmentMetadata(component.submission, 1);
    expect(component.assignmentUnavailable).toBeTrue();
    expect(component.canonicalResultState).toBe(canonical);
    expect(component.canonicalResultState.score).toBe(85);
  });
});
