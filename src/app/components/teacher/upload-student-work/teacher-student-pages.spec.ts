import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { TeacherStudentPages } from './teacher-student-pages';
import { TeacherUploadApiService } from '../../../api/teacher-upload-api.service';
import { ImagePreflightService } from '../../../services/image-preflight.service';
import { UploadEssayForm } from '../../../pages/students/my-class-student-pages/detail-my-class-student-pages/upload-essay-form/upload-essay-form';

describe('TeacherStudentPages', () => {
  let fixture: ComponentFixture<TeacherStudentPages>, component: TeacherStudentPages;
  let api: jasmine.SpyObj<TeacherUploadApiService>, http: HttpTestingController;
  const passed = { success: true, data: { ready: true, checks: [], basicChecksPassed: true, sourceReadRequired: true, sourceReadStatus: 'PASSED' as const, canSubmit: true } };

  beforeEach(async () => {
    api = jasmine.createSpyObj<TeacherUploadApiService>('TeacherUploadApiService', ['preflight']);
    api.preflight.and.returnValue(of(passed));
    await TestBed.configureTestingModule({ imports: [TeacherStudentPages],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: TeacherUploadApiService, useValue: api }] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeacherStudentPages);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('studentId', 'row-1');
    fixture.componentRef.setInput('name', 'Sam Lee');
    fixture.componentRef.setInput('email', 'sam@example.com');
    fixture.detectChanges();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });

  const preflight = () => fixture.debugElement.children[0].injector.get(ImagePreflightService);
  const file = new File(['x'], 'page.png', { type: 'image/png' });

  it('is the student upload screen itself (crop, checks and messages), not a copy', () => {
    expect(fixture.nativeElement.querySelector('app-upload-essay-form')).not.toBeNull();
    expect(component.form).toEqual(jasmine.any(UploadEssayForm));
  });

  it('sends the student screen\'s page check (basic, then handwriting) to the teacher route for this student only', () => {
    const results: unknown[] = [];
    api.preflight.and.callFake((_a: string, _s: { name: string; email: string }, _f: File, phase: string) =>
      of(phase === 'basic' ? { success: true, data: { ...passed.data, sourceReadStatus: 'CHECKING' as const, canSubmit: false } } : passed));
    preflight().check(file, 'a1').subscribe(result => results.push(result));
    expect(api.preflight.calls.allArgs()).toEqual([
      ['a1', { name: 'Sam Lee', email: 'sam@example.com' }, file, 'basic'],
      ['a1', { name: 'Sam Lee', email: 'sam@example.com' }, file, 'source']]);
    expect(results.length).toBe(2);
    http.expectNone(() => true);                      // never the student route (/submissions/image-preflight)
  });

  it('checks every page again for the new student when the email changes', () => {
    const retry = spyOn(component.form!, 'retryQuality');
    const entries = [{ file, name: 'a.png', size: 1 }, { file, name: 'b.png', size: 1 }];
    component.form!.files = entries;
    fixture.componentRef.setInput('email', 'samuel@example.com');
    fixture.detectChanges();
    expect(retry.calls.allArgs()).toEqual([[entries[0]], [entries[1]]]);
    preflight().check(file, 'a1').subscribe();
    expect(api.preflight.calls.mostRecent().args[1]).toEqual({ name: 'Sam Lee', email: 'samuel@example.com' });
  });
});
