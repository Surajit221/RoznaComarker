import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentForm } from './assignment-form';
import { GuestSubmissionFeature } from '../../../../../services/guest-submission-feature.service';
import { DraftLimitConfig, DraftLimitFeature } from '../../../../../services/draft-limit-feature.service';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';
import type { BackendAssignment } from '../../../../../api/assignment-api.service';

/** The form's private collaborators, as these tests drive them. */
interface FormInternals {
  assignmentApi: { createAssignment: (...args: unknown[]) => Promise<unknown>; updateAssignment: (...args: unknown[]) => Promise<unknown> };
  alert: { showToast: (...args: unknown[]) => void };
  handleSubmit(): Promise<void>;
}

describe('AssignmentForm: Maximum drafts (draft limit)', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let fixture: ComponentFixture<AssignmentForm>, component: AssignmentForm;
  const dom = () => fixture.nativeElement as HTMLElement;
  const internals = () => component as unknown as FormInternals;
  async function create(config: DraftLimitConfig, assignment: Partial<BackendAssignment> | null = null) {
    await TestBed.configureTestingModule({ imports: [AssignmentForm], providers: [
      { provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
      { provide: DraftLimitFeature, useValue: { config: signal(config), load: () => Promise.resolve(config) } },
      ...routedComponentProviders(), ...httpTestingProviders] }).compileComponents();
    fixture = TestBed.createComponent(AssignmentForm); component = fixture.componentInstance;
    if (assignment) component.assignment = assignment as BackendAssignment;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const ON: DraftLimitConfig = { enabled: true, min: 2, max: 10, default: 3 };
  const check = async (on: boolean) => {
    const box = dom().querySelector<HTMLInputElement>('[formControlName="allowResubmission"]')!;
    if (box.checked !== on) box.click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  };
  const fill = (base: Record<string, unknown> = {}) => component.classForm.patchValue({ className: 'Essay three', writingType: 'Narrative', startDate: '2099-08-11', message: 'Write clearly please.', ...base });

  it('flag off: no field, and nothing is sent', async () => {
    await create({ ...ON, enabled: false });
    await check(true);
    expect(dom().querySelector('[data-max-drafts]')).toBeNull();
    component.classId = 'class-1'; fill({ allowResubmission: true });
    const createApi = spyOn(internals().assignmentApi, 'createAssignment').and.resolveTo({ _id: 'x', title: 'Essay three' });
    spyOn(internals().alert, 'showToast');
    await internals().handleSubmit();
    expect(createApi.calls.mostRecent().args[0]).not.toEqual(jasmine.objectContaining({ maxDrafts: jasmine.anything() }));
  });
  it('flag on: shown only when another draft is allowed, labelled "including the first draft", default 3', async () => {
    await create(ON);
    expect(dom().querySelector('[data-max-drafts]')).toBeNull();
    await check(true);
    const field = dom().querySelector('[data-max-drafts]')!;
    expect(field.textContent).toContain('Maximum drafts');
    expect(field.textContent).toContain('Including the first draft');
    expect(component.classForm.get('maxDrafts')!.value).toBe(3);
    await check(false);
    expect(dom().querySelector('[data-max-drafts]')).toBeNull();
    expect(component.classForm.get('maxDrafts')!.valid).toBeTrue();
  });
  it('validation: 2..10 whole numbers; an invalid value blocks saving and says why', async () => {
    await create(ON);
    await check(true);
    const control = component.classForm.get('maxDrafts')!;
    for (const bad of [1, 11, 2.5, null]) { control.setValue(bad); expect(control.valid).withContext(String(bad)).toBeFalse(); }
    for (const good of [2, 10]) { control.setValue(good); expect(control.valid).toBeTrue(); }
    control.setValue(11); control.markAsTouched(); fixture.detectChanges();
    expect(dom().querySelector('#assignment-max-drafts-error')!.textContent).toContain('from 2 to 10');
    component.classId = 'class-1'; fill({ allowResubmission: true, maxDrafts: 11 });
    const createApi = spyOn(internals().assignmentApi, 'createAssignment').and.resolveTo({ _id: 'x', title: 'Essay three' });
    await internals().handleSubmit();
    expect(createApi).not.toHaveBeenCalled();
  });
  it('an existing assignment shows its saved value and sends the edited one', async () => {
    await create(ON, { _id: 'a1', title: 'Essay', writingType: 'Narrative', instructions: 'Write clearly please.', deadline: '2099-08-11T00:00:00.000Z',
      allowResubmission: true, maxDrafts: 5, resourceType: 'essay' });
    expect(component.classForm.get('maxDrafts')!.value).toBe(5);
    component.classForm.get('maxDrafts')!.setValue(4);
    const update = spyOn(internals().assignmentApi, 'updateAssignment').and.resolveTo({ _id: 'a1', title: 'Essay' });
    spyOn(internals().alert, 'showToast');
    await internals().handleSubmit();
    expect(update.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ allowResubmission: true, maxDrafts: 4 }));
  });
});
