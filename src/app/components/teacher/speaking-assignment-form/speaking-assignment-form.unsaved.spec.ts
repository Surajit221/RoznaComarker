import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SpeakingAssignmentForm } from './speaking-assignment-form';
import { SpeakingApiService } from '../../../api/speaking-api.service';
import { RubricApiService, type SavedRubric } from '../../../api/rubric-api.service';
import { AudioConfigService } from '../../../services/audio-config.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AlertService } from '../../../services/alert.service';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import type { BackendAssignment } from '../../../api/assignment-api.service';
import { httpTestingProviders, routedComponentProviders } from '../../../../testing/standalone-test-providers';

// Unsaved changes of the speaking form, compared with what the form opened with (so changing a field back counts as clean).
// The hosting page asks before discarding; the Cancel button only asks the page to close.
describe('SpeakingAssignmentForm unsaved changes', () => {
  let fixture: ComponentFixture<SpeakingAssignmentForm>, component: SpeakingAssignmentForm, unsaved: UnsavedWorkRegistry;
  const dom = () => fixture.nativeElement as HTMLElement;
  const EDIT = { _id: 'a1', resourceType: 'speaking', title: 'Describe your town', instructions: 'Speak about your town for two minutes.',
    deadline: '2099-08-11T00:00:00.000Z', showMarksToStudent: true, allowGuestSubmission: false, speaking: { maxRecordingSeconds: 180 } } as unknown as BackendAssignment;
  async function create(assignment: BackendAssignment | null = null) {
    await TestBed.configureTestingModule({ imports: [SpeakingAssignmentForm], providers: [
      { provide: SpeakingApiService, useValue: jasmine.createSpyObj('SpeakingApiService', ['createSpeakingAssignment', 'updateSpeakingAssignment']) },
      { provide: RubricApiService, useValue: jasmine.createSpyObj('RubricApiService', ['getSavedRubric', 'listSavedRubrics']) },
      { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), load: () => Promise.resolve() } },
      { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['showToast', 'showError', 'showConfirm']) },
      { provide: GuestSubmissionFeature, useValue: { enabled: () => true, state: () => 'enabled', load: () => Promise.resolve(true), settled: () => Promise.resolve('enabled') } },
      ...routedComponentProviders(), ...httpTestingProviders] }).compileComponents();
    unsaved = TestBed.inject(UnsavedWorkRegistry);
    fixture = TestBed.createComponent(SpeakingAssignmentForm); component = fixture.componentInstance;
    component.classId = 'class-1';
    if (assignment) component.assignment = assignment;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  afterEach(() => fixture?.destroy());
  const typeInto = (selector: string, value: string) => {
    const el = dom().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    el.value = value; el.dispatchEvent(new Event('input')); fixture.detectChanges();
  };
  const library: SavedRubric = { _id: 'r9', name: 'My speaking rubric' } as SavedRubric;

  for (const mode of ['create', 'edit'] as const) {
    it(`${mode}: clean when opened, nothing registered`, async () => {
      await create(mode === 'edit' ? EDIT : null);
      expect(component.hasUnsavedChanges()).toBeFalse();
      expect(unsaved.has('speaking-assignment-form')).toBeFalse();
    });
  }

  const changes: [string, (c: SpeakingAssignmentForm) => void][] = [
    ['title', () => typeInto('#speaking-title', 'A new title')],
    ['description', () => typeInto('#speaking-description', 'Talk about a new place you visited.')],
    ['deadline', () => typeInto('#speaking-deadline', '2099-09-01')],
    ['recording length', c => c.form.controls.maxMinutes.setValue(2)],
    ['show marks', () => { dom().querySelector<HTMLInputElement>('input[formControlName="showMarksToStudent"]')!.click(); fixture.detectChanges(); }],
    ['guest access', () => { dom().querySelector<HTMLInputElement>('input[formControlName="allowGuestSubmission"]')!.click(); fixture.detectChanges(); }],
    ['rubric choice', c => c.onRubricSelected(library)]
  ];
  for (const [name, change] of changes) {
    it(`dirty after changing the ${name}; registered with UnsavedWork`, async () => {
      await create();
      change(component);
      expect(component.hasUnsavedChanges()).toBeTrue();
      expect(unsaved.has('speaking-assignment-form')).toBeTrue();
    });
  }

  it('changing a field back to what the form opened with is clean again, and the UnsavedWork entry is cleared', async () => {
    await create(EDIT);
    typeInto('#speaking-title', 'Describe your city');
    expect(component.hasUnsavedChanges()).toBeTrue();
    typeInto('#speaking-title', 'Describe your town');
    expect(component.hasUnsavedChanges()).toBeFalse();
    expect(unsaved.has('speaking-assignment-form')).toBeFalse();
    component.onRubricSelected(library);
    expect(component.hasUnsavedChanges()).toBeTrue();
    component.useDefaultRubric();
    expect(component.hasUnsavedChanges()).toBeFalse();
    expect(unsaved.has('speaking-assignment-form')).toBeFalse();
  });

  it('touching a field without changing it (focus and blur) is not a change', async () => {
    await create();
    const title = dom().querySelector<HTMLInputElement>('#speaking-title')!;
    title.dispatchEvent(new Event('focus')); title.dispatchEvent(new Event('blur')); fixture.detectChanges();
    expect(component.hasUnsavedChanges()).toBeFalse();
  });

  it('Cancel only asks the page to close: the input is kept and stays registered until the page discards it', async () => {
    await create();
    typeInto('#speaking-title', 'A new title');
    let closed = 0;
    component.closed.subscribe(() => closed++);
    const cancel = Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel')!;
    cancel.click();
    expect(closed).toBe(1);
    expect(component.form.controls.title.value).toBe('A new title');
    expect(unsaved.has('speaking-assignment-form')).toBeTrue();
    component.discardChanges();
    expect(unsaved.has('speaking-assignment-form')).toBeFalse();
  });

  it('a successful save is not an unsaved change (nothing left registered)', async () => {
    await create();
    component.form.patchValue({ title: 'Describe your town', deadline: '2099-08-11', description: 'Speak about your town for two minutes.' });
    component.form.markAsDirty();
    (TestBed.inject(SpeakingApiService) as jasmine.SpyObj<SpeakingApiService>).createSpeakingAssignment.and.resolveTo({ _id: 'a2' } as BackendAssignment);
    await component.submit();
    expect(unsaved.has('speaking-assignment-form')).toBeFalse();
  });
});
