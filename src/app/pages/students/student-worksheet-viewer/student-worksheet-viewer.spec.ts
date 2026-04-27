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

  it('isLoading should be true on init', () => {
    expect(component.isLoading).toBeTrue();
  });

  it('allAnswered returns false when worksheet is null', () => {
    component.worksheet = null;
    expect(component.allAnswered).toBeFalse();
  });

  it('allAnswered returns true when all questions have answers', () => {
    component.worksheet = {
      _id: 'w1', title: 'Test', questions: [
        { _id: 'q1', text: 'Q1', type: 'open' },
        { _id: 'q2', text: 'Q2', type: 'mcq', options: ['A', 'B'] },
      ],
    };
    component.answers = { q1: 'some answer', q2: 'A' };
    expect(component.allAnswered).toBeTrue();
  });

  it('allAnswered returns false when a question is unanswered', () => {
    component.worksheet = {
      _id: 'w1', title: 'Test', questions: [
        { _id: 'q1', text: 'Q1', type: 'open' },
      ],
    };
    component.answers = {};
    expect(component.allAnswered).toBeFalse();
  });

  it('goBackToClass navigates to /student/my-classes when classId is empty', () => {
    const spy = spyOn((component as any).router, 'navigate');
    component.classId = '';
    component.goBackToClass();
    expect(spy).toHaveBeenCalledWith(['/student/my-classes']);
  });
});
