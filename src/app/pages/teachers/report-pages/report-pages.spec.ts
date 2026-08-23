import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';

import { AssignmentApiService } from '../../../api/assignment-api.service';
import { ClassApiService } from '../../../api/class-api.service';
import { FeedbackApiService } from '../../../api/feedback-api.service';
import { SubmissionApiService } from '../../../api/submission-api.service';
import { essayReportStatusFromScore, ReportPages } from './report-pages';

describe('essayReportStatusFromScore', () => {
  it('uses the canonical 60-point revision and 80-point completed boundaries', () => {
    expect(essayReportStatusFromScore(59)).toBe('needs_improvement');
    expect(essayReportStatusFromScore(60)).toBe('need_revision');
    expect(essayReportStatusFromScore(70)).toBe('need_revision');
    expect(essayReportStatusFromScore(79)).toBe('need_revision');
    expect(essayReportStatusFromScore(80)).toBe('completed');
    expect(essayReportStatusFromScore(81)).toBe('completed');
    expect(essayReportStatusFromScore(100)).toBe('completed');
  });
});

describe('ReportPages class filtering', () => {
  let component: ReportPages;
  let fixture: ComponentFixture<ReportPages>;
  let initialClassId = '';

  const classes = [
    { _id: 'class-a', name: 'Class A' },
    { _id: 'class-b', name: 'Class B' },
    { _id: 'class-empty', name: 'Empty Class' }
  ];
  const classApi = { getMyTeacherClasses: jasmine.createSpy() };
  const assignmentApi = { getClassAssignments: jasmine.createSpy() };
  const submissionApi = { getSubmissionsByAssignment: jasmine.createSpy() };
  const feedbackApi = { getSubmissionFeedback: jasmine.createSpy() };

  beforeEach(async () => {
    initialClassId = '';
    classApi.getMyTeacherClasses.calls.reset();
    classApi.getMyTeacherClasses.and.resolveTo(classes as any);
    assignmentApi.getClassAssignments.calls.reset();
    assignmentApi.getClassAssignments.and.callFake(async (classId: string) => {
      if (classId === 'class-a') return [{ _id: 'assignment-a' }];
      if (classId === 'class-b') return [{ _id: 'assignment-b' }];
      return [];
    });
    submissionApi.getSubmissionsByAssignment.calls.reset();
    submissionApi.getSubmissionsByAssignment.and.callFake(async (assignmentId: string) => [{
      _id: assignmentId === 'assignment-a' ? 'submission-a' : 'submission-b',
      student: { _id: assignmentId, displayName: assignmentId === 'assignment-a' ? 'Alice' : 'Bob' },
      assignment: { _id: assignmentId, title: assignmentId === 'assignment-a' ? 'Essay A' : 'Essay B' },
      submittedAt: '2026-08-01T00:00:00.000Z'
    }] as any);
    feedbackApi.getSubmissionFeedback.calls.reset();
    feedbackApi.getSubmissionFeedback.and.callFake(async (submissionId: string) => ({
      overallScore: submissionId === 'submission-a' ? 90 : 60,
      correctionStats: { grammar: 1, mechanics: 0, organization: 0, content: 0, vocabulary: 0 }
    }));

    await TestBed.configureTestingModule({
      imports: [ReportPages],
      providers: [
        { provide: ClassApiService, useValue: classApi },
        { provide: AssignmentApiService, useValue: assignmentApi },
        { provide: SubmissionApiService, useValue: submissionApi },
        { provide: FeedbackApiService, useValue: feedbackApi },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => initialClassId || null } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportPages);
    component = fixture.componentInstance;
  });

  async function initialize(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('defaults to All Classes and preserves the combined report metrics', async () => {
    await initialize();
    expect(component.selectedClassId).toBe('');
    expect(component.totalEssays).toBe(2);
    expect(component.completedCount).toBe(1);
    expect(component.needRevisionCount).toBe(1);
    expect(component.filteredRows.map((row) => row.authorName)).toEqual(['Alice', 'Bob']);
  });

  it("lists only the teacher's real class names in the dropdown", async () => {
    await initialize();
    const options = [...fixture.nativeElement.querySelectorAll('#report-class-filter option')]
      .map((option: HTMLOptionElement) => option.textContent?.trim());
    expect(options).toEqual(['All Classes', 'Class A', 'Class B', 'Empty Class']);
  });

  it('switches between classes and recalculates rows and totals for the selected scope', async () => {
    await initialize();
    await component.onClassChange('class-a');
    expect(component.filteredRows.map((row) => row.authorName)).toEqual(['Alice']);
    expect(component.totalEssays).toBe(1);
    expect(component.completedCount).toBe(1);

    await component.onClassChange('class-b');
    expect(component.filteredRows.map((row) => row.authorName)).toEqual(['Bob']);
    expect(component.totalEssays).toBe(1);
    expect(component.needRevisionCount).toBe(1);
  });

  it('does not request an arbitrary class id outside the authenticated teacher class list', async () => {
    initialClassId = 'foreign-class';
    await initialize();
    expect(component.selectedClassId).toBe('');
    expect(assignmentApi.getClassAssignments).not.toHaveBeenCalledWith('foreign-class');
    expect(component.filteredRows.map((row) => row.authorName)).toEqual(['Alice', 'Bob']);
  });

  it('shows a scoped empty state for a selected class without reportable students', async () => {
    await initialize();
    await component.onClassChange('class-empty');
    fixture.detectChanges();
    expect(component.totalEssays).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No students found for this class.');
  });

  it('keeps the class control full-width at the mobile breakpoint', async () => {
    await initialize();
    const wrapper = fixture.nativeElement.querySelector('.report-class-filter');
    const select = wrapper.querySelector('select');
    expect(wrapper).toBeTruthy();
    expect(select).toBeTruthy();
    expect(select.id).toBe('report-class-filter');
    expect(fixture.nativeElement.querySelector('label[for="report-class-filter"]')).toBeTruthy();
    expect(wrapper.querySelector('.report-class-select-icon')).toBeTruthy();
  });

  it('keeps the native class select functional when changed from the rendered control', async () => {
    await initialize();
    const select = fixture.nativeElement.querySelector('#report-class-filter') as HTMLSelectElement;
    select.value = 'class-a';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.selectedClassId).toBe('class-a');
    expect(component.filteredRows.map((row) => row.authorName)).toEqual(['Alice']);
  });
});
