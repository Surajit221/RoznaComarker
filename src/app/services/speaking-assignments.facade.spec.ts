import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SpeakingAssignmentsFacade, rubricCopyMarker } from './speaking-assignments.facade';
import { AudioConfigService } from './audio-config.service';
import { SpeakingApiService } from '../api/speaking-api.service';
import { RubricApiService, type SavedRubric } from '../api/rubric-api.service';
import { AlertService } from './alert.service';
import type { BackendAssignment } from '../api/assignment-api.service';

describe('SpeakingAssignmentsFacade', () => {
  let facade: SpeakingAssignmentsFacade, enabled: ReturnType<typeof signal<boolean>>;
  let speaking: jasmine.SpyObj<SpeakingApiService>, rubrics: jasmine.SpyObj<RubricApiService>, alert: jasmine.SpyObj<AlertService>;
  const RUBRIC_DATA = { totalPoints: 100, criteria: [{ id: 'speaking-task', name: 'Task and content', weight: 100, levels: [
    { title: 'Good', score: 2, description: 'Answers the task.' }, { title: 'Weak', score: 1, description: 'Misses the task.' }] }] };
  const saved = (id: string, description = 'Default rubric for speaking assignments. You can edit it.'): SavedRubric =>
    ({ _id: id, name: 'Speaking rubric', description, writingType: 'speaking', rubricData: RUBRIC_DATA } as SavedRubric);
  const assignment = (rubricRef: string | null): BackendAssignment => ({ _id: 'a1', title: 'Describe your town', resourceType: 'speaking',
    speaking: { maxRecordingSeconds: null, rubricRef } } as unknown as BackendAssignment);

  beforeEach(() => {
    enabled = signal(false);
    speaking = jasmine.createSpyObj('SpeakingApiService', ['attachRubric']);
    rubrics = jasmine.createSpyObj('RubricApiService', ['getSavedRubric', 'createSavedRubric', 'updateSavedRubric']);
    alert = jasmine.createSpyObj('AlertService', ['showToast', 'showError']);
    TestBed.configureTestingModule({ providers: [{ provide: AudioConfigService, useValue: { enabled, maxMinutes: signal(7), load: () => Promise.resolve() } },
      { provide: SpeakingApiService, useValue: speaking }, { provide: RubricApiService, useValue: rubrics }, { provide: AlertService, useValue: alert }] });
    facade = TestBed.inject(SpeakingAssignmentsFacade);
  });

  describe('the create/edit flow', () => {
    it('feature off: straight to the writing form, and the button and titles are exactly as before', () => {
      facade.startCreate();
      expect(facade.step()).toBe('writing');
      expect(facade.createButtonLabel()).toBe('Create Writing Assignment');
      expect(facade.dialogTitle('Create Writing Assignment')).toBe('Create Writing Assignment');
      expect(facade.hideWritingForm()).toBeFalse();
    });

    it('feature on: the choice first; choosing shows the matching form and title', () => {
      enabled.set(true);
      expect(facade.createButtonLabel()).toBe('Create Assignment');
      facade.startCreate();
      expect(facade.step()).toBe('choice');
      expect(facade.dialogTitle('Create Writing Assignment')).toBe('Create Assignment');
      expect(facade.hideWritingForm()).toBeTrue();
      facade.choose('speaking');
      expect(facade.dialogTitle('Create Writing Assignment')).toBe('Create Speaking Assignment');
      expect(facade.hideWritingForm()).toBeTrue();
      facade.choose('writing');
      expect(facade.dialogTitle('Create Writing Assignment')).toBe('Create Writing Assignment');
      expect(facade.hideWritingForm()).toBeFalse();
    });

    it('edit: a speaking assignment opens the speaking form; any other opens the writing form, as before', () => {
      facade.startEdit(assignment('r1'));
      expect(facade.step()).toBe('speaking');
      expect(facade.dialogTitle('Edit Assignment')).toBe('Edit Speaking Assignment');
      facade.startEdit({ _id: 'e1', resourceType: 'essay' } as BackendAssignment);
      expect(facade.step()).toBe('writing');
      expect(facade.dialogTitle('Edit Assignment')).toBe('Edit Assignment');
      facade.reset();
      expect(facade.step()).toBe('idle');
    });
  });

  describe('Rubric from a speaking card: copy for this assignment', () => {
    it('the shared seeded rubric is never changed: the first save creates a copy marked for this assignment and attaches it', async () => {
      rubrics.getSavedRubric.and.resolveTo(saved('shared'));
      rubrics.createSavedRubric.and.resolveTo(saved('copy-1', rubricCopyMarker('a1')));
      speaking.attachRubric.and.resolveTo({ ...assignment('copy-1') });
      const changed: BackendAssignment[] = [];
      facade.assignmentChanged.subscribe((value: BackendAssignment) => changed.push(value));
      await facade.openRubric(assignment('shared'));
      expect(facade.rubricOpen()).toBeTrue();
      expect(facade.rubricDesigner()!.criteria[0]).toEqual(jasmine.objectContaining({ id: 'speaking-task', title: 'Task and content' }));
      await facade.saveRubric(facade.rubricDesigner()!);
      expect(rubrics.updateSavedRubric).not.toHaveBeenCalled();
      expect(rubrics.createSavedRubric).toHaveBeenCalledOnceWith({ name: 'Describe your town (speaking rubric)', description: 'Speaking rubric for assignment a1',
        writingType: 'speaking', rubricData: jasmine.objectContaining({ criteria: [jasmine.objectContaining({ id: 'speaking-task' })] }) as never });
      expect(speaking.attachRubric).toHaveBeenCalledOnceWith('a1', 'copy-1');
      expect(changed.map(a => (a as never as { speaking: { rubricRef: string } }).speaking.rubricRef)).toEqual(['copy-1']);
      expect(facade.rubricOpen()).toBeFalse();
    });

    it('this assignment\'s own copy is edited in place', async () => {
      rubrics.getSavedRubric.and.resolveTo(saved('copy-1', rubricCopyMarker('a1')));
      rubrics.updateSavedRubric.and.resolveTo(saved('copy-1', rubricCopyMarker('a1')));
      await facade.openRubric(assignment('copy-1'));
      await facade.saveRubric(facade.rubricDesigner()!);
      expect(rubrics.updateSavedRubric).toHaveBeenCalledOnceWith('copy-1', { rubricData: jasmine.any(Object) as never });
      expect(rubrics.createSavedRubric).not.toHaveBeenCalled();
      expect(speaking.attachRubric).not.toHaveBeenCalled();
    });

    it('another assignment\'s copy, or a library rubric chosen at creation, is copied too (never edited from this card)', async () => {
      for (const description of [rubricCopyMarker('other-assignment'), 'My interview rubric']) {
        rubrics.getSavedRubric.and.resolveTo(saved('lib', description));
        rubrics.createSavedRubric.and.resolveTo(saved('copy-x', rubricCopyMarker('a1')));
        speaking.attachRubric.and.resolveTo(assignment('copy-x'));
        await facade.openRubric(assignment('lib'));
        await facade.saveRubric(facade.rubricDesigner()!);
      }
      expect(rubrics.updateSavedRubric).not.toHaveBeenCalled();
      expect(rubrics.createSavedRubric).toHaveBeenCalledTimes(2);
    });

    it('no rubric reference or an unavailable rubric: a fixed message, no editor', async () => {
      await facade.openRubric(assignment(null));
      rubrics.getSavedRubric.and.rejectWith(new HttpErrorResponse({ status: 404, error: { message: 'RAW SERVER TEXT' } }));
      await facade.openRubric(assignment('gone'));
      expect(facade.rubricOpen()).toBeFalse();
      expect(alert.showError).toHaveBeenCalledTimes(2);
      for (const call of alert.showError.calls.allArgs()) expect(call.join(' ')).not.toContain('RAW SERVER TEXT');
    });

    it('a failed save shows fixed text and keeps the editor open', async () => {
      rubrics.getSavedRubric.and.resolveTo(saved('shared'));
      rubrics.createSavedRubric.and.rejectWith(new HttpErrorResponse({ status: 400, error: { message: 'RAW SERVER TEXT' } }));
      await facade.openRubric(assignment('shared'));
      await facade.saveRubric(facade.rubricDesigner()!);
      expect(facade.rubricOpen()).toBeTrue();
      expect(alert.showError.calls.mostRecent().args.join(' ')).not.toContain('RAW SERVER TEXT');
      expect(facade.rubricSaving()).toBeFalse();
    });
  });
});
