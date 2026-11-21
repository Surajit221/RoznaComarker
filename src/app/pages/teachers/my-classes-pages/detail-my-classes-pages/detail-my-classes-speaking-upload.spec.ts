// Stage 9: "Upload work" on a speaking card (the same label as on an essay card; its accessible name says it uploads a student's recording), opening the speaking upload dialog; the
// submissions dialog of a speaking assignment reads the speaking uploads. Essay cards unchanged.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DetailMyClassesPages } from './detail-my-classes-pages';
import { GuestSubmissionFeature } from '../../../../services/guest-submission-feature.service';
import { AudioConfigService } from '../../../../services/audio-config.service';
import { SpeakingTeacherUploadDialog } from '../../../../components/teacher/speaking-teacher-upload-dialog/speaking-teacher-upload-dialog';
import { UploadStudentWorkDialog } from '../../../../components/teacher/upload-student-work/upload-student-work-dialog';
import { authenticatedUserProviders, httpTestingProviders, referenceFilesOffProviders, routedComponentProviders } from '../../../../../testing/standalone-test-providers';

describe('DetailMyClassesPages: teacher-uploaded recordings (stage 9)', () => {
  let fixture: ComponentFixture<DetailMyClassesPages>;
  let component: DetailMyClassesPages;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailMyClassesPages],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
        { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), maxFileBytes: signal(41943040), load: () => Promise.resolve() } },
        ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')] }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  const item = (id: string, resourceType: 'essay' | 'speaking') =>
    ({ id, title: `Assignment ${id}`, dueDate: 'Tomorrow', submitted: 0, total: 0, status: 'pending' as const, resourceType, instructions: `Task ${id}` });
  const byId = (records: Record<string, unknown>) => { (component as unknown as { assignmentsById: Record<string, unknown> }).assignmentsById = records; };
  const host = () => fixture.nativeElement as HTMLElement;
  const find = <T>(type: new (...args: never[]) => T) => fixture.debugElement.query(el => el.componentInstance instanceof type)?.componentInstance as T;

  for (const desktop of [true, false]) {
    it(`a speaking card offers "Upload work" (the essay card's label and button style; the accessible name says a student's recording); it opens the speaking dialog (desktop=${desktop})`, () => {
      spyOn(component.device, 'isDesktop').and.returnValue(desktop);
      spyOn(component.device, 'isMobile').and.returnValue(!desktop);
      byId({ s1: { _id: 's1', title: 'Assignment s1', resourceType: 'speaking', speaking: { maxRecordingSeconds: 180 } } });
      component.assignments = [item('s1', 'speaking'), item('e1', 'essay')];
      fixture.detectChanges();
      const button = host().querySelector<HTMLButtonElement>('[data-speaking-upload]')!;
      expect(button.textContent!.replace(/\s+/g, ' ').trim()).toBe('Upload work');
      expect(button.classList).toContain('assignment-utility--upload');
      expect(button.getAttribute('aria-label')).toBe("Upload a student's recording for Assignment s1");
      expect(host().querySelectorAll('[data-speaking-upload]').length).toBe(1);
      button.click();
      fixture.detectChanges();
      const dialog = find(SpeakingTeacherUploadDialog);
      expect(dialog.open).toBeTrue();
      expect(dialog.assignmentId).toBe('s1');
      expect(dialog.limits).toEqual({ maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 });
      expect(find(UploadStudentWorkDialog).open).toBeFalse();
    });
  }

  it('closing after a save refreshes that assignment\'s submission count (as for essays)', () => {
    const refresh = spyOn(component as unknown as { refreshAssignmentSubmissionCount(id: string): Promise<void> }, 'refreshAssignmentSubmissionCount').and.resolveTo();
    component.openSpeakingUpload('s1');
    component.onSpeakingUploadClosed({ saved: 2 });
    expect(refresh).toHaveBeenCalledWith('s1');
    expect(component.speakingUploadAssignmentId).toBeNull();
  });

  it('the submissions dialog of a speaking assignment is told it is speaking', () => {
    byId({ s1: { _id: 's1', resourceType: 'speaking' }, e1: { _id: 'e1', resourceType: 'essay' } });
    component.selectedAssignmentId = 's1';
    expect(component.selectedIsSpeaking).toBeTrue();
    component.selectedAssignmentId = 'e1';
    expect(component.selectedIsSpeaking).toBeFalse();
  });
});
