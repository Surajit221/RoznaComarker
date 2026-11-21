import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { SpeakingAssignmentForm } from './speaking-assignment-form';
import { SpeakingApiService } from '../../../api/speaking-api.service';
import { RubricApiService } from '../../../api/rubric-api.service';
import { AudioConfigService } from '../../../services/audio-config.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AlertService } from '../../../services/alert.service';
import type { BackendAssignment } from '../../../api/assignment-api.service';
import { httpTestingProviders, routedComponentProviders } from '../../../../testing/standalone-test-providers';

describe('SpeakingAssignmentForm', () => {
  let fixture: ComponentFixture<SpeakingAssignmentForm>, component: SpeakingAssignmentForm;
  let api: jasmine.SpyObj<SpeakingApiService>, rubrics: jasmine.SpyObj<RubricApiService>, unsaved: jasmine.SpyObj<UnsavedWorkRegistry>;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function create(assignment: Partial<BackendAssignment> | null = null, maxMinutes = 7) {
    api = jasmine.createSpyObj('SpeakingApiService', ['createSpeakingAssignment', 'updateSpeakingAssignment']);
    rubrics = jasmine.createSpyObj('RubricApiService', ['getSavedRubric', 'listSavedRubrics']);
    unsaved = jasmine.createSpyObj('UnsavedWorkRegistry', ['register', 'clear', 'hasWork', 'confirmLeave']);
    await TestBed.configureTestingModule({ imports: [SpeakingAssignmentForm], providers: [
      { provide: SpeakingApiService, useValue: api }, { provide: RubricApiService, useValue: rubrics },
      { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(maxMinutes), load: () => Promise.resolve() } },
      { provide: UnsavedWorkRegistry, useValue: unsaved },
      { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['showToast', 'showError']) },
      ...routedComponentProviders(), ...httpTestingProviders] }).compileComponents();
    fixture = TestBed.createComponent(SpeakingAssignmentForm); component = fixture.componentInstance;
    component.classId = 'class-1';
    if (assignment) component.assignment = assignment as BackendAssignment;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const fill = () => component.form.patchValue({ title: 'Describe your town', deadline: '2099-08-11', description: 'Speak about your town for two minutes.' });

  it('fields reuse the writing form classes: title, due date, description with the 500 counter, length, marks, rubric', async () => {
    await create();
    expect(dom().querySelector('input.input-text[formControlName="title"]')).not.toBeNull();
    expect(dom().querySelector('input.input-text.date-input[type="date"][formControlName="deadline"]')).not.toBeNull();
    expect(dom().querySelector('textarea.input-text[formControlName="description"]')).not.toBeNull();
    expect(dom().textContent).toContain('/500 characters');
    expect(dom().querySelector('fieldset.assignment-settings input[type="checkbox"][formControlName="showMarksToStudent"]')).not.toBeNull();
    expect(dom().querySelector('button.rubric-action')!.textContent).toContain('Choose from library');
    expect(dom().textContent).toContain('Speaking rubric (default)');
    for (const label of Array.from(dom().querySelectorAll('label.text-sm.font-bold.pl-2'))) expect(label.getAttribute('for')).toBeTruthy();
  });

  it('maximum recording length: a select of whole minutes from 1 up to the policy maximum, 7 by default, sent as seconds', async () => {
    await create();
    const select = dom().querySelector<HTMLSelectElement>('select#speaking-max-minutes')!;
    expect(Array.from(select.options).map(o => o.textContent!.trim())).toEqual(['1 minute', '2 minutes', '3 minutes', '4 minutes', '5 minutes', '6 minutes', '7 minutes']);
    expect(component.form.get('maxMinutes')!.value).toBe(7);
    fill(); component.form.patchValue({ maxMinutes: 3 });
    api.createSpeakingAssignment.and.resolveTo({ _id: 'a1', resourceType: 'speaking' } as BackendAssignment);
    const created: BackendAssignment[] = [];
    component.created.subscribe((value: BackendAssignment) => created.push(value));
    await component.submit();
    expect(api.createSpeakingAssignment).toHaveBeenCalledOnceWith({ classId: 'class-1', title: 'Describe your town', instructions: 'Speak about your town for two minutes.',
      deadline: '2099-08-11', showMarksToStudent: true, maxRecordingSeconds: 180, rubricRef: null });
    expect(created.map(a => a._id)).toEqual(['a1']);
  });

  it('a lower policy maximum limits the choices', async () => {
    await create(null, 3);
    expect(Array.from(dom().querySelectorAll<HTMLOptionElement>('select#speaking-max-minutes option')).length).toBe(3);
    expect(component.form.get('maxMinutes')!.value).toBe(3);
  });

  it('a rubric chosen from the library is sent as the rubric reference; "Use the default rubric" clears it', async () => {
    await create();
    component.onRubricSelected({ _id: 'r7', name: 'Interview rubric' } as never);
    fixture.detectChanges();
    expect(dom().textContent).toContain('Interview rubric');
    fill();
    api.createSpeakingAssignment.and.resolveTo({ _id: 'a1' } as BackendAssignment);
    await component.submit();
    expect(api.createSpeakingAssignment.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ rubricRef: 'r7' }));
    component.useDefaultRubric();
    await component.submit();
    expect(api.createSpeakingAssignment.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ rubricRef: null }));
  });

  it('validation: title, due date and a description of at least 10 characters are required; nothing is sent', async () => {
    await create();
    await component.submit();
    expect(api.createSpeakingAssignment).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(dom().textContent).toContain('Assignment Title is required');
    expect(dom().textContent).toContain('Due date is required');
    expect(dom().textContent).toContain('Description is required');
  });

  it('a refusal shows fixed text, never the server message', async () => {
    await create();
    fill();
    api.createSpeakingAssignment.and.rejectWith(new HttpErrorResponse({ status: 400, error: { code: 'SPEAKING_MAX_RECORDING_INVALID', message: 'RAW SERVER TEXT' } }));
    await component.submit();
    fixture.detectChanges();
    const alert = dom().querySelector('[role="alert"]')!;
    expect(alert.textContent).toMatch(/maximum recording length/i);
    expect(dom().textContent).not.toContain('RAW SERVER TEXT');
  });

  it('edit: fields come from the assignment; PATCH sends seconds; the rubric reference is not changed by the form', async () => {
    rubrics = jasmine.createSpyObj('RubricApiService', ['getSavedRubric']);
    await create({ _id: 'a9', title: 'Town', instructions: 'Speak for two minutes about it.', deadline: '2099-05-04T00:00:00.000Z', resourceType: 'speaking',
      showMarksToStudent: false, speaking: { maxRecordingSeconds: 240, rubricRef: 'r1' } } as never);
    expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({ title: 'Town', deadline: '2099-05-04', maxMinutes: 4, showMarksToStudent: false }));
    api.updateSpeakingAssignment.and.resolveTo({ _id: 'a9' } as BackendAssignment);
    await component.submit();
    expect(api.updateSpeakingAssignment).toHaveBeenCalledOnceWith('a9', { title: 'Town', instructions: 'Speak for two minutes about it.', deadline: '2099-05-04',
      showMarksToStudent: false, maxRecordingSeconds: 240 });
  });

  it('registers unsaved work while the form is changed, and clears it when saved or closed', async () => {
    await create();
    component.form.get('title')!.setValue('Changed');
    component.form.markAsDirty();
    fixture.detectChanges();
    expect(unsaved.register).toHaveBeenCalledWith('speaking-assignment-form', jasmine.any(String));
    component.close();
    expect(unsaved.clear).toHaveBeenCalledWith('speaking-assignment-form');
  });
});
