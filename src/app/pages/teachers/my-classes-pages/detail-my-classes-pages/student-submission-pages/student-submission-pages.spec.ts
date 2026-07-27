import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentSubmissionPages } from './student-submission-pages';

describe('StudentSubmissionPages', () => {
  let component: StudentSubmissionPages;
  let fixture: ComponentFixture<StudentSubmissionPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resets every asynchronous section to loading for a newly selected submission', () => {
    (component as any).resetSectionLoadStates(true);

    expect(component.transcriptState).toBe('loading');
    expect(component.correctionsState).toBe('loading');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
    expect(component.teacherCommentState).toBe('loading');
    expect(component.scoreState).toBe('loading');
  });

  it('keeps section loading states independent', () => {
    component.transcriptState = 'loaded';
    component.correctionsState = 'loaded';
    component.feedbackState = 'loading';
    component.aiFeedbackState = 'loading';

    expect(component.transcriptState).toBe('loaded');
    expect(component.correctionsState).toBe('loaded');
    expect(component.feedbackState).toBe('loading');
    expect(component.aiFeedbackState).toBe('loading');
  });

  it('preserves a valid zero correction count after loading', () => {
    component.correctionsState = 'loaded';
    component.currentFeedback = {
      correctionStatistics: { content: 0, grammar: 0, organization: 0, vocabulary: 0, mechanics: 0 }
    } as any;

    expect(component.contentIssuesCount).toBe(0);
    expect(component.grammarIssuesCount).toBe(0);
  });

  it('uses an explicit error state instead of leaving a section loading', () => {
    component.correctionsState = 'error';
    component.feedbackState = 'loaded';

    expect(component.correctionsState).toBe('error');
    expect(component.feedbackState).toBe('loaded');
  });

  it('renders exactly one editable Teacher Comments section in the mobile branch', () => {
    (component.device as any).width.set(390);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.teacher-comments-editor textarea[formControlName="message"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor button')?.textContent).toContain('Submit');
  });

  it('keeps the mobile Teacher Comments editor available when evaluation fails', () => {
    (component.device as any).width.set(320);
    component.aiFeedbackState = 'error';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.section-load-error')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.teacher-comments-editor textarea')).toBeTruthy();
  });
});
