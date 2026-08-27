import { TestBed } from '@angular/core/testing';
import { WorksheetPdfTemplateComponent } from './worksheet-pdf-template';

describe('WorksheetPdfTemplateComponent', () => {
  it('renders matching and true/false questions with student and correct answers', async () => {
    await TestBed.configureTestingModule({ imports: [WorksheetPdfTemplateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(WorksheetPdfTemplateComponent);
    fixture.componentRef.setInput('data', {
      worksheet: {
        title: 'Complete worksheet', subject: 'Science',
        activity5: { title: 'Matching Pairs', instructions: 'Match each pair', pairs: [
          { id: 'pair-1', leftItem: { text: 'Final left item' }, rightItem: { text: 'Final right item' } }
        ] },
        activity6: { title: 'True or False', instructions: 'Choose an answer', questions: [
          { id: 'tf-1', text: 'Final true false question', correctAnswer: true }
        ] }
      },
      studentName: 'Student', date: '2026-08-27', a3Answers: {}, a4Blanks: {},
      a5Matches: { 'pair-1': 'Final right item' }, a6Answers: { 'tf-1': true },
      totalPointsEarned: 2, totalPointsPossible: 2, percentage: 100
    } as any);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Final left item');
    expect(text).toContain('Your match: Final right item');
    expect(text).toContain('Final true false question');
    expect(text).toContain('Correct answer: True');
    expect(text).not.toMatch(/Ã|ðŸ|â€”/);
  });
});
