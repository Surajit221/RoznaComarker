import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClassApiService } from '../../api/class-api.service';
import { StudentProgressComponent } from './student-progress';

describe('StudentProgressComponent', () => {
  let fixture: ComponentFixture<StudentProgressComponent>;
  let api: jasmine.SpyObj<ClassApiService>;
  beforeEach(async () => {
    api = jasmine.createSpyObj<ClassApiService>('ClassApiService', ['getStudentProgress']);
    api.getStudentProgress.and.resolveTo({ latestAssessedScore: 80, averageRevisionScoreDelta: 7.5,
      latestDraftImprovement: 6, assessedDraftCount: 3, assignmentsWithRevisions: 1, revisionComparisonCount: 2,
      improvedRevisionCount: 2, unchangedRevisionCount: 0, declinedRevisionCount: 0, totalIssuesCorrected: 7,
      strongestImprovedCategory: { name: 'Organization', delta: 8 }, categoriesNeedingAttention: ['Mechanics'],
      lastAssessmentDate: '2026-09-01T00:00:00.000Z', draftHistory: [{ chainId: 'one', assignmentId: 'assignment-1',
        assignmentTitle: 'Narrative Writing', comparisonCount: 1, drafts: [
          { submissionId: 'revision-one', draftNumber: 1, score: 65, assessedAt: '2026-08-01T00:00:00.000Z' },
          { submissionId: 'one', draftNumber: 2, score: 80, assessedAt: '2026-09-01T00:00:00.000Z' }
        ] }] });
    await TestBed.configureTestingModule({ imports: [StudentProgressComponent], providers: [{ provide: ClassApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(StudentProgressComponent);
  });

  it('loads and presents improvement summary, insights, and ordered draft history', async () => {
    fixture.componentRef.setInput('classId', 'class-1'); fixture.componentRef.setInput('studentId', 'student-1');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(api.getStudentProgress).toHaveBeenCalledOnceWith('class-1', 'student-1');
    expect(text).toContain('+7.5'); expect(text).toContain('7'); expect(text).toContain('Organization'); expect(text).toContain('Mechanics');
    expect(text).toContain('Narrative Writing'); expect(text).not.toContain('Total change');
    expect([...fixture.nativeElement.querySelectorAll('li')].map((item: Element) => item.textContent)).toEqual([jasmine.stringContaining('Draft 1'), jasmine.stringContaining('Draft 2')]);
  });
});
