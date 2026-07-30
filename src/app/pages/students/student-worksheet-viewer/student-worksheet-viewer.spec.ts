import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudentWorksheetViewer } from './student-worksheet-viewer';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('StudentWorksheetViewer', () => {
  let component: StudentWorksheetViewer;
  let fixture: ComponentFixture<StudentWorksheetViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentWorksheetViewer],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture   = TestBed.createComponent(StudentWorksheetViewer);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts without a worksheet id before route initialization', () => {
    expect(component.worksheetId).toBe('');
  });

  it('goBack navigates to /student/my-classes when classId is empty', () => {
    const spy = spyOn((component as any).router, 'navigate');
    component.classId = null;
    component.goBack();
    expect(spy).toHaveBeenCalledWith(['/student/my-classes']);
  });

  it('goBack navigates to the current classroom when classId exists', () => {
    const spy = spyOn((component as any).router, 'navigate');
    component.classId = 'class-1';
    component.goBack();
    expect(spy).toHaveBeenCalledWith(['/student/classroom', 'class-1']);
  });
});
