import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { DetailMyClassesPages } from './detail-my-classes-pages';
import { GuestSubmissionFeature } from '../../../../services/guest-submission-feature.service';
import { AudioConfigService } from '../../../../services/audio-config.service';
import { SpeakingAssignmentsFacade } from '../../../../services/speaking-assignments.facade';
import { authenticatedUserProviders, httpTestingProviders, referenceFilesOffProviders, routedComponentProviders } from '../../../../../testing/standalone-test-providers';

// Speaking (audio + speech-to-text) on the class page: small @if branches only. With the feature off, the page is exactly as before.
describe('DetailMyClassesPages speaking branches', () => {
  let fixture: ComponentFixture<DetailMyClassesPages>;
  let component: DetailMyClassesPages;
  let enabled: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    enabled = signal(false);
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
        { provide: AudioConfigService, useValue: { enabled, maxMinutes: signal(7), load: () => Promise.resolve() } },
        ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')]
    }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const item = (id: string, resourceType?: 'essay' | 'speaking') =>
    ({ id, title: `Assignment ${id}`, dueDate: 'Tomorrow', submitted: 0, total: 0, status: 'pending' as const, resourceType, instructions: `Task ${id}` });
  const host = () => fixture.nativeElement as HTMLElement;
  const cards = () => Array.from(host().querySelectorAll<HTMLElement>('.teacher-assignment-card'));
  const buttons = (card: HTMLElement) => Array.from(card.querySelectorAll('button')).map(b => b.textContent!.replace(/\s+/g, ' ').trim());

  for (const desktop of [true, false]) {
    it(`feature off: the create button and the essay card are unchanged (desktop=${desktop})`, () => {
      spyOn(component.device, 'isDesktop').and.returnValue(desktop);
      spyOn(component.device, 'isMobile').and.returnValue(!desktop);
      component.assignments = [item('e1', 'essay')];
      fixture.detectChanges();
      if (desktop) expect(host().textContent).toContain('Create Writing Assignment');
      else expect(host().textContent).toContain('+ Assignment');
      expect(host().querySelector('app-assignment-type-choice')).toBeNull();
    });

    it(`a speaking card: navy "Speaking" pill, description, View Submissions, Edit, Duplicate, Rubric, Upload work, Delete; no Report or QR; only its own upload button (desktop=${desktop})`, () => {
      spyOn(component.device, 'isDesktop').and.returnValue(desktop);
      spyOn(component.device, 'isMobile').and.returnValue(!desktop);
      component.assignments = [item('s1', 'speaking'), item('e1', 'essay')];
      fixture.detectChanges();
      const [speaking, essay] = cards();
      const pill = speaking.querySelector('[data-speaking-pill]') as HTMLElement;
      expect(pill.textContent!.trim()).toBe('Speaking');
      expect(pill.className).toContain('bg-[#203864]');
      expect(pill.className).toContain('text-white');
      expect(speaking.textContent).toContain('Task s1');
      const labels = buttons(speaking).join(' | ');
      for (const expected of ['View Submissions', 'Edit', 'Duplicate', 'Rubric', 'Delete']) expect(labels).toContain(expected);
      for (const absent of ['Report', 'QR Code']) expect(labels).not.toContain(absent);
      // One upload button, the speaking one (it uploads a recording, never an essay), with the same label as the essay card's.
      const uploads = Array.from(speaking.querySelectorAll<HTMLButtonElement>('.assignment-utility--upload'));
      expect(uploads.length).toBe(1);
      expect(uploads[0].hasAttribute('data-speaking-upload')).toBeTrue();
      expect(uploads[0].textContent!.replace(/\s+/g, ' ').trim()).toBe('Upload work');
      expect(uploads[0].getAttribute('aria-label')).toBe("Upload a student's recording for Assignment s1");
      // The essay card keeps every action it had.
      const essayLabels = buttons(essay).join(' | ');
      for (const expected of ['View Submissions', 'Report', 'QR Code', 'Edit', 'Duplicate', 'Rubric', 'Upload work', 'Delete']) expect(essayLabels).toContain(expected);
      expect(essay.querySelector('[data-speaking-pill]')).toBeNull();
      const essayUpload = essay.querySelector<HTMLButtonElement>('.assignment-utility--upload')!;
      expect(essayUpload.hasAttribute('data-speaking-upload')).toBeFalse();
      expect(essayUpload.textContent!.replace(/\s+/g, ' ').trim()).toBe('Upload work');
      expect(essayUpload.getAttribute('aria-label')).toBe('Upload student work for Assignment e1');
    });
  }

  it('feature on: "Create Assignment" opens the choice; Writing shows the existing form, Speaking the speaking form', () => {
    spyOn(component.device, 'isDesktop').and.returnValue(true);
    enabled.set(true);
    fixture.detectChanges();
    const create = Array.from(host().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Create Assignment')!;
    expect(create.className).toContain('btn-primary');
    create.click();
    fixture.detectChanges();
    expect(host().querySelector('app-assignment-type-choice')).not.toBeNull();
    expect(host().textContent).toContain('Create Assignment');
    const facade = TestBed.inject(SpeakingAssignmentsFacade);
    facade.choose('speaking');
    fixture.detectChanges();
    expect(host().querySelector('app-speaking-assignment-form')).not.toBeNull();
    expect(host().textContent).toContain('Create Speaking Assignment');
    facade.choose('writing');
    fixture.detectChanges();
    expect(host().querySelector('app-speaking-assignment-form')).toBeNull();
    const writing = host().querySelector('app-assignment-form') as HTMLElement;
    expect(writing.classList.contains('hidden')).toBeFalse();
  });

  it('Rubric on a speaking card goes to the copy-on-edit rubric flow, not the essay rubric editor', () => {
    spyOn(component.device, 'isDesktop').and.returnValue(true);
    const facade = TestBed.inject(SpeakingAssignmentsFacade);
    const open = spyOn(facade, 'openRubric').and.resolveTo();
    const essayRubric = spyOn(component, 'onOpenRubric');
    component.assignments = [item('s1', 'speaking')];
    (component as unknown as { assignmentsById: Record<string, unknown> }).assignmentsById = { s1: { _id: 's1', title: 'Assignment s1', resourceType: 'speaking' } };
    fixture.detectChanges();
    const rubric = Array.from(cards()[0].querySelectorAll('button')).find(b => b.textContent!.includes('Rubric'))!;
    rubric.click();
    expect(open).toHaveBeenCalledOnceWith(jasmine.objectContaining({ _id: 's1' }));
    expect(essayRubric).not.toHaveBeenCalled();
  });
});
