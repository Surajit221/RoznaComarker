import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ClassApiService, type BackendClass } from '../../../api/class-api.service';
import { AlertService } from '../../../services/alert.service';
import { DeviceService } from '../../../services/device.service';
import { routedHttpTestProviders } from '../../../testing/routed-http-test.providers';
import { MyClassesPages } from './my-classes-pages';

const klass = (id: string, name: string, status: 'active' | 'archived' = 'active'): BackendClass => ({
  _id: id, name, description: `${name} description`, teacher: 'teacher-1', joinCode: `CODE-${id}`,
  isActive: true, status, archivedAt: status === 'archived' ? '2026-01-01T00:00:00.000Z' : null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('MyClassesPages reactive class list', () => {
  let component: MyClassesPages;
  let fixture: ComponentFixture<MyClassesPages>;
  let updates: Subject<BackendClass>;
  let deletions: Subject<string>;
  let api: jasmine.SpyObj<ClassApiService>;
  let deviceMode: 'desktop' | 'mobile';

  beforeEach(async () => {
    updates = new Subject<BackendClass>();
    deletions = new Subject<string>();
    api = jasmine.createSpyObj<ClassApiService>('ClassApiService', [
      'getMyTeacherClasses', 'getClassSummary', 'invalidateTeacherClassesList',
      'invalidateAllClassSummaries', 'archiveClass', 'unarchiveClass', 'deleteClass',
      'getCopyableClasses', 'getSemesterCopyPreview', 'copySemester',
    ], { classUpdated$: updates.asObservable(), classDeleted$: deletions.asObservable() });
    api.getMyTeacherClasses.and.resolveTo([]);
    api.getClassSummary.and.callFake(async (id: string) => ({ id, name: '', description: '',
      joinCode: '', teacher: { id: 'teacher-1', name: '', email: '' }, studentsCount: 0,
      assignmentsCount: 0, submissionsCount: 0, lastEdited: '' }));
    deviceMode = 'desktop';

    await TestBed.configureTestingModule({
      imports: [MyClassesPages],
      providers: [
        ...routedHttpTestProviders(),
        { provide: ClassApiService, useValue: api },
        { provide: AlertService, useValue: jasmine.createSpyObj('AlertService', ['showError', 'showSuccess']) },
        { provide: DeviceService, useValue: {
          isDesktop: () => deviceMode === 'desktop', isTablet: () => false,
          isMobile: () => deviceMode === 'mobile',
        } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders an authoritative newly-created active class immediately without refetch or reload', async () => {
    let resolveSummary!: (value: any) => void;
    api.getClassSummary.and.returnValue(new Promise((resolve) => { resolveSummary = resolve; }));
    const update = component.onClassCreated(klass('class-1', 'Biology'));
    fixture.detectChanges();
    expect(api.getMyTeacherClasses).toHaveBeenCalledTimes(1);
    expect(component.classes().map((item) => item.title)).toEqual(['Biology']);
    expect(fixture.nativeElement.textContent).toContain('Biology');
    resolveSummary({ studentsCount: 0, assignmentsCount: 0, submissionsCount: 0, lastEdited: '' });
    await update;
  });

  it('keeps new active classes out of the archived tab', async () => {
    await component.onClassCreated(klass('class-1', 'Biology'));
    await component.selectStatus('archived');
    fixture.detectChanges();
    expect(component.classes()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Biology description');
  });

  it('upserts repeated create/update events without duplicate cards', async () => {
    const first = klass('class-1', 'Biology');
    await component.onClassCreated(first);
    updates.next(first);
    await fixture.whenStable();
    await component.onClassCreated(klass('class-2', 'Chemistry'));
    fixture.detectChanges();
    expect(component.classes().map((item) => item.id).sort()).toEqual(['class-1', 'class-2']);
    expect(fixture.nativeElement.querySelectorAll('app-my-classes-card').length).toBe(2);
  });

  it('uses the same signal-backed updated list for desktop and mobile', async () => {
    await component.onClassCreated(klass('class-1', 'Biology'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-my-classes-card').length).toBe(1);
    deviceMode = 'mobile';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-my-classes-card').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Biology');
  });

  it('loads active and archived sources, preserves assignment selection, and guards duplicate submission', async () => {
    api.getCopyableClasses.and.resolveTo([klass('old-active', 'Current'), klass('old-archived', 'Previous', 'archived')]);
    api.getSemesterCopyPreview.and.resolveTo({ sourceClass: { id: 'old-archived', name: 'Previous', status: 'archived', description: 'Details', subjectLevel: '8' },
      assignments: [{ id: 'a1', title: 'Long writing assignment', type: 'essay', hasRubric: true, hasDeadline: true },
        { id: 'a2', title: 'Worksheet', type: 'worksheet', hasRubric: false, hasDeadline: true }] });
    await component.openSemesterCopy(); await component.chooseCopySource('old-archived');
    expect(component.copySources.map((x) => x.status)).toEqual(['active', 'archived']);
    expect(component.allCopyAssignmentsSelected).toBeTrue(); component.toggleCopyAssignment('a2', false);
    let finish!: (value: any) => void; api.copySemester.and.returnValue(new Promise((resolve) => { finish = resolve; }));
    const first = component.submitSemesterCopy(); const second = component.submitSemesterCopy();
    expect(api.copySemester).toHaveBeenCalledTimes(1); expect(api.copySemester.calls.mostRecent().args[1].deadlineMode).toBe('unset');
    expect(api.copySemester.calls.mostRecent().args[1].assignmentIds).toEqual(['a1']);
    finish({ class: klass('new-class', 'Previous - New Semester'), assignments: [], replayed: false }); await Promise.all([first, second]);
    expect(component.classes().map((x) => x.id)).toContain('new-class');
  });

  it('removes normal and copied-semester classes immediately and repeated removal is harmless', async()=>{
    await component.onClassCreated(klass('normal','Normal'));await component.onClassCreated(klass('copied','Copied Semester'));
    api.deleteClass.and.resolveTo({...klass('copied','Copied Semester'),isActive:false});
    component.onDeleteRequested({id:'copied',title:'Copied Semester'});await component.confirmDeleteClass();fixture.detectChanges();
    expect(component.classes().map(x=>x.id)).toEqual(['normal']);expect(api.getMyTeacherClasses).toHaveBeenCalledTimes(1);
    deletions.next('copied');deletions.next('copied');expect(component.classes().map(x=>x.id)).toEqual(['normal']);
  });

  it('moves archive and restore results out of the current status reactively',async()=>{
    await component.onClassCreated(klass('class-1','Biology'));
    api.archiveClass.and.callFake(async()=>{const value=klass('class-1','Biology','archived');updates.next(value);return value});
    component.onArchiveRequested({id:'class-1',title:'Biology'});await component.confirmArchiveClass();expect(component.classes()).toEqual([]);
    api.getMyTeacherClasses.and.resolveTo([klass('class-1','Biology','archived')]);await component.selectStatus('archived');
    api.unarchiveClass.and.callFake(async()=>{const value=klass('class-1','Biology','active');updates.next(value);return value});
    await component.onRestoreRequested({id:'class-1',title:'Biology'});expect(component.classes()).toEqual([]);
  });
});
