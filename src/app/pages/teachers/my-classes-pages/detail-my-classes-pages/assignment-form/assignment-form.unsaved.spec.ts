import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentForm } from './assignment-form';
import { GuestSubmissionFeature } from '../../../../../services/guest-submission-feature.service';
import { DraftLimitFeature } from '../../../../../services/draft-limit-feature.service';
import { ReferenceFilesApiService } from '../../../../../api/reference-files-api.service';
import type { BackendAssignment } from '../../../../../api/assignment-api.service';
import { UnsavedWorkRegistry } from '../../../../../core/app-update/unsaved-work';
import { ReferenceFilesField } from '../../../../../components/teacher/reference-files-field/reference-files-field';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';

// Unsaved changes of the writing form (the same rule as the speaking form): compared with what the form opened with, plus a reference
// file chosen but not uploaded yet. The form registers with UnsavedWork while it has changes; Cancel only asks the page to close.
describe('AssignmentForm unsaved changes', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let fixture: ComponentFixture<AssignmentForm>, component: AssignmentForm, unsaved: UnsavedWorkRegistry;
  let draftConfig: ReturnType<typeof signal<{ enabled: boolean; min: number; max: number; default: number }>>;
  let releaseDraftLimit: () => void;
  const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
  const dom = () => fixture.nativeElement as HTMLElement;
  const EDIT = { _id: 'a1', title: 'Persuasive essay', writingType: 'Argumentative', deadline: '2099-08-11T12:00:00.000Z',
    instructions: 'Write about school uniforms.', allowGuestSubmission: false, showMarksToStudent: true, allowResubmission: true, maxDrafts: null,
    rubrics: { criteria: [{ id: 'c1', name: 'Ideas', weight: 100, levels: [{ title: 'Good', score: 4, description: 'Clear ideas' }] }] } } as unknown as BackendAssignment;

  async function create(assignment: BackendAssignment | null = null) {
    const refApi = jasmine.createSpyObj<ReferenceFilesApiService>('ReferenceFilesApiService', ['config', 'list']);
    refApi.config.and.resolveTo({ enabled: true, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 });
    refApi.list.and.resolveTo({ files: [], classFiles: [], limits: { maxFiles: 5, maxFileBytes: 1 } } as never);
    draftConfig = signal({ enabled: false, min: 2, max: 10, default: 3 });
    // The draft limit config arrives after the form opened (as in the app); releaseDraftLimit answers it.
    const draftLoaded = new Promise<void>(resolve => { releaseDraftLimit = resolve; });
    await TestBed.configureTestingModule({
      imports: [AssignmentForm],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => true, state: () => 'enabled', load: () => Promise.resolve(true), settled: () => Promise.resolve('enabled') } },
        { provide: DraftLimitFeature, useValue: { config: draftConfig, load: () => draftLoaded.then(() => draftConfig()) } },
        { provide: ReferenceFilesApiService, useValue: refApi }, ...routedComponentProviders(), ...httpTestingProviders]
    }).compileComponents();
    unsaved = TestBed.inject(UnsavedWorkRegistry);
    fixture = TestBed.createComponent(AssignmentForm);
    component = fixture.componentInstance;
    component.classId = 'class-1';
    if (assignment) fixture.componentRef.setInput('assignment', assignment);
    fixture.detectChanges(); await settle(); fixture.detectChanges();
  }
  afterEach(() => fixture?.destroy());
  const typeInto = (selector: string, value: string) => {
    const el = dom().querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
    el.value = value; el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input')); fixture.detectChanges();
  };

  for (const mode of ['create', 'edit'] as const) {
    it(`${mode}: clean when opened, nothing registered`, async () => {
      await create(mode === 'edit' ? EDIT : null);
      expect(component.hasUnsavedChanges()).toBeFalse();
      expect(unsaved.hasWork()).toBeFalse();
    });
  }

  const changes: [string, (c: AssignmentForm) => void][] = [
    ['title', () => typeInto('[formControlName="className"]', 'A new title')],
    ['description', () => typeInto('[formControlName="message"]', 'Write about a place you love.')],
    ['deadline', c => c.classForm.get('startDate')!.setValue('2099-12-01')],
    ['writing type', c => c.classForm.get('writingType')!.setValue('Narrative')],
    ['show marks', c => c.classForm.get('showMarksToStudent')!.setValue(false)],
    ['guest access', c => c.classForm.get('allowGuestSubmission')!.setValue(true)],
    ['another draft', c => c.classForm.get('allowResubmission')!.setValue(true)]
  ];
  for (const [name, change] of changes) {
    it(`dirty after changing the ${name}; registered with UnsavedWork`, async () => {
      await create();
      change(component);
      expect(component.hasUnsavedChanges()).toBeTrue();
      expect(unsaved.hasWork()).toBeTrue();
    });
  }

  it('edit: a rubric changed in the form (not yet saved with Update) is a change', async () => {
    await create(EDIT);
    await component.onRubricDesignerSave({ ...component.rubricDesignerForModal!, title: 'Changed rubric' });
    expect(component.hasUnsavedChanges()).toBeTrue();
    expect(unsaved.hasWork()).toBeTrue();
  });

  it('a reference file chosen but not uploaded yet is a change', async () => {
    await create();
    (component.referenceFiles as ReferenceFilesField).addFiles([new File(['x'], 'notes.pdf', { type: 'application/pdf' })]);
    fixture.detectChanges();
    expect(component.hasUnsavedChanges()).toBeTrue();
  });

  it('changing a field back is clean again, and the UnsavedWork entry is cleared', async () => {
    await create(EDIT);
    typeInto('[formControlName="className"]', 'Another title');
    expect(component.hasUnsavedChanges()).toBeTrue();
    typeInto('[formControlName="className"]', 'Persuasive essay');
    expect(component.hasUnsavedChanges()).toBeFalse();
    expect(unsaved.hasWork()).toBeFalse();
  });

  it('the draft limit config arriving after the form opened does not count as a change', async () => {
    await create(EDIT);
    draftConfig.set({ enabled: true, min: 2, max: 10, default: 3 });
    releaseDraftLimit(); await settle(); fixture.detectChanges();
    expect(component.classForm.get('maxDrafts')!.value).toBe(3);
    expect(component.hasUnsavedChanges()).toBeFalse();
  });

  it('Cancel only asks the page to close: nothing is reset until the page discards', async () => {
    await create();
    typeInto('[formControlName="className"]', 'A new title');
    let closed = 0;
    component.closed.subscribe(() => closed++);
    const cancel = Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel')!;
    cancel.click();
    expect(closed).toBe(1);
    expect(component.classForm.get('className')!.value).toBe('A new title');
    expect(component.hasUnsavedChanges()).toBeTrue();
    component.discardChanges();
    expect(component.classForm.get('className')!.value).toBeFalsy();
    expect(component.hasUnsavedChanges()).toBeFalse();
    expect(unsaved.hasWork()).toBeFalse();
  });

  it('destroying the form clears its UnsavedWork entry', async () => {
    await create();
    typeInto('[formControlName="className"]', 'A new title');
    expect(unsaved.hasWork()).toBeTrue();
    fixture.destroy();
    expect(unsaved.hasWork()).toBeFalse();
  });
});
