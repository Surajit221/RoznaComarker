// Stage 10b: "Allow submission without login" on the speaking form, the writing form's setting (same label, wording and class) and the same
// rule for sending it: only when guest submission is confirmed on; switched off is always sent; unknown availability leaves it as it is.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SpeakingAssignmentForm } from './speaking-assignment-form';
import { SpeakingApiService } from '../../../api/speaking-api.service';
import { RubricApiService } from '../../../api/rubric-api.service';
import { AudioConfigService } from '../../../services/audio-config.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AlertService } from '../../../services/alert.service';
import { GuestSubmissionFeature, type GuestFeatureState } from '../../../services/guest-submission-feature.service';
import type { BackendAssignment } from '../../../api/assignment-api.service';
import { httpTestingProviders, routedComponentProviders } from '../../../../testing/standalone-test-providers';

describe('SpeakingAssignmentForm: guests (stage 10b)', () => {
  let fixture: ComponentFixture<SpeakingAssignmentForm>, component: SpeakingAssignmentForm;
  let api: jasmine.SpyObj<SpeakingApiService>, alert: jasmine.SpyObj<AlertService>;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function create(state: GuestFeatureState, assignment: Partial<BackendAssignment> | null = null) {
    api = jasmine.createSpyObj('SpeakingApiService', ['createSpeakingAssignment', 'updateSpeakingAssignment']);
    api.createSpeakingAssignment.and.resolveTo({ _id: 'n1' } as BackendAssignment);
    api.updateSpeakingAssignment.and.resolveTo({ _id: 'a1' } as BackendAssignment);
    alert = jasmine.createSpyObj('AlertService', ['showToast', 'showError', 'showWarning']);
    await TestBed.configureTestingModule({ imports: [SpeakingAssignmentForm], providers: [
      { provide: SpeakingApiService, useValue: api }, { provide: RubricApiService, useValue: jasmine.createSpyObj('RubricApiService', ['getSavedRubric', 'listSavedRubrics']) },
      { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), load: () => Promise.resolve() } },
      { provide: UnsavedWorkRegistry, useValue: jasmine.createSpyObj('UnsavedWorkRegistry', ['register', 'clear', 'hasWork', 'confirmLeave']) },
      { provide: AlertService, useValue: alert },
      { provide: GuestSubmissionFeature, useValue: { enabled: () => state === 'enabled', state: () => state, load: () => Promise.resolve(state === 'enabled'),
        settled: () => Promise.resolve(state) } },
      ...routedComponentProviders(), ...httpTestingProviders] }).compileComponents();
    fixture = TestBed.createComponent(SpeakingAssignmentForm); component = fixture.componentInstance;
    component.classId = 'class-1';
    if (assignment) component.assignment = assignment as BackendAssignment;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const fill = () => component.form.patchValue({ title: 'Describe your town', deadline: '2099-08-11', description: 'Speak about your town for two minutes.' });
  const guestBox = () => dom().querySelector<HTMLInputElement>('fieldset.assignment-settings label.assignment-setting input[formControlName="allowGuestSubmission"]');

  it('guest submission on: the writing form\'s setting (label and wording), off by default; ticked, it is sent on create', async () => {
    await create('enabled');
    const label = guestBox()!.closest('label')!;
    expect(label.textContent).toContain('Allow submission without login');
    expect(label.textContent).toContain('Students with the assignment link or QR code can submit using their name and email without creating an account.');
    expect(guestBox()!.checked).toBeFalse();
    guestBox()!.click(); fixture.detectChanges();
    fill();
    await component.submit();
    expect(api.createSpeakingAssignment).toHaveBeenCalledWith(jasmine.objectContaining({ allowGuestSubmission: true }));
  });

  it('edit: the stored value is shown, and switching it off is sent', async () => {
    await create('enabled', { _id: 'a1', title: 'Talk', instructions: 'Speak about your town for two minutes.', deadline: '2099-08-11', allowGuestSubmission: true });
    expect(guestBox()!.checked).toBeTrue();
    guestBox()!.click(); fixture.detectChanges();
    await component.submit();
    expect(api.updateSpeakingAssignment).toHaveBeenCalledWith('a1', jasmine.objectContaining({ allowGuestSubmission: false }));
  });

  it('availability unknown: no checkbox, the writing form\'s note, and the field is left as it is (not sent)', async () => {
    await create('unavailable', { _id: 'a1', title: 'Talk', instructions: 'Speak about your town for two minutes.', deadline: '2099-08-11', allowGuestSubmission: true });
    expect(guestBox()).toBeNull();
    expect(dom().textContent).toContain("Couldn't load the 'submission without login' setting. It will be left as it is.");
    await component.submit();
    expect(api.updateSpeakingAssignment.calls.mostRecent().args[1]).not.toEqual(jasmine.objectContaining({ allowGuestSubmission: jasmine.anything() }));
  });

  it('guest submission switched off on the server: no checkbox; a create sends nothing for it (the server stores no guests)', async () => {
    await create('disabled');
    expect(guestBox()).toBeNull();
    fill();
    await component.submit();
    expect(api.createSpeakingAssignment.calls.mostRecent().args[0]).not.toEqual(jasmine.objectContaining({ allowGuestSubmission: jasmine.anything() }));
  });
});
