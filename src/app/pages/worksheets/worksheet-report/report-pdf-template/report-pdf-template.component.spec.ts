import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorksheetReportData } from '../../../../services/worksheet-report-pdf.service';
import { ReportPdfTemplateComponent } from './report-pdf-template.component';

describe('ReportPdfTemplateComponent', () => {
  let fixture: ComponentFixture<ReportPdfTemplateComponent>;

  const reportData: WorksheetReportData = {
    worksheetTitle: 'A deliberately long worksheet title that must wrap safely in the report',
    subject: 'English',
    cefrLevel: 'B1',
    gradeLevel: '7',
    difficulty: 'Mixed',
    theme: 'Default',
    activities: 6,
    stats: {
      totalAssigned: 1, submitted: 1, pending: 0, late: 0, completionRate: 100,
      avgScore: 29, medianScore: 29, passRate: 0, avgTime: 47,
    },
    scoreDistribution: { '90-100': 0, '80-89': 0, '70-79': 0, below70: 1 },
    teacherInsights: [
      'Review the lowest-performing sections.',
      'Most students struggled with Drag & Drop (0% average).',
    ],
    sections: [
      {
        id: 'activity3', title: 'Multiple Choice', type: 'Multiple Choice', score: 0,
        completion: 100, avgTime: 0, questionCount: 4, correct: 0, incorrect: 4,
        skipped: 0, mostMissed: ['q4', 'q5', 'a_very_long_question_identifier_that_wraps'],
      },
      {
        id: 'activity4', title: 'Fill in Blanks', type: 'Fill in Blanks', score: 100,
        completion: 100, avgTime: 12, questionCount: 3, correct: 3, incorrect: 0,
        skipped: 0, mostMissed: [],
      },
      {
        id: 'activity1', title: 'Drag & Drop', type: 'Ordering', score: 0,
        completion: 0, avgTime: 0, questionCount: 0, correct: 0, incorrect: 0,
        skipped: 0, mostMissed: [],
      },
    ],
    students: [{
      name: 'student.with.a.very.long.email.address@example-school.edu', score: 29, time: 47, date: 'Aug 28, 2026',
      status: 'On Time', dragDropScore: 0, classificationScore: 0,
      multipleChoiceScore: 0, fillBlanksScore: 100, matchingScore: 14,
    }],
    hardestQuestions: [
      { name: 'q4', correctPct: 0 },
      { name: 'long_question_identifier_that_must_wrap_without_clipping', correctPct: 0 },
    ],
    easiestQuestions: [{ name: 'q1_b0', correctPct: 100 }],
    weakSections: [{ name: 'Multiple Choice', score: 0 }, { name: 'Drag & Drop', score: 0 }],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReportPdfTemplateComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReportPdfTemplateComponent);
    fixture.componentInstance.reportData = reportData;
    fixture.detectChanges();
  });

  it('renders three deliberate PDF pages without interactive activity badges', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pdf-page').length).toBe(3);
    expect(element.textContent).not.toContain('ACTIVITY');
  });

  it('omits zero-question section cards while preserving populated section values', () => {
    const element = fixture.nativeElement as HTMLElement;
    const cards = Array.from(element.querySelectorAll<HTMLElement>('.section-card'));
    expect(cards.length).toBe(2);
    expect(cards.some((card) => card.textContent?.includes('Drag & Drop'))).toBeFalse();
    expect(cards[0].textContent).toContain('Correct0');
    expect(cards[0].textContent).toContain('Incorrect4');
    expect(cards[0].textContent).toContain('Skipped0');
  });

  it('keeps question and weak-section percentages in the same aligned row', () => {
    const element = fixture.nativeElement as HTMLElement;
    const questionRow = element.querySelector('.insight-row');
    const weakRow = element.querySelector('.weak-section-row');
    expect(questionRow?.querySelector('.insight-q-name')?.textContent).toContain('q4');
    expect(questionRow?.querySelector('.insight-q-value')?.textContent).toContain('0%');
    expect(weakRow?.querySelector('.weak-section-name')?.textContent).toContain('Multiple Choice');
    expect(weakRow?.querySelector('.weak-section-score')?.textContent).toContain('0%');
  });

  it('renders each class-level statistic and score distribution once', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect((text.match(/AVERAGE SCORE/g) || []).length).toBe(1);
    expect((text.match(/MEDIAN SCORE/g) || []).length).toBe(1);
    expect((text.match(/PASS RATE/g) || []).length).toBe(1);
    expect((text.match(/Score Distribution/g) || []).length).toBe(1);
  });

  it('merges unique highest, lowest, late and below-threshold metrics into class overview', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    for (const label of ['HIGHEST', 'LOWEST', 'LATE', 'BELOW THRESHOLD']) {
      expect((text.match(new RegExp(label, 'g')) || []).length).toBe(1);
    }
    expect(text).not.toContain('Detailed Student Analysis');
  });

  it('excludes zero-question sections from weak sections and teacher insights', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.weak-sections-box')?.textContent).not.toContain('Drag & Drop');
    expect(element.querySelector('.insights-box')?.textContent).not.toContain('Drag & Drop');
    expect(element.querySelector('.insights-box')?.textContent).toContain('Review the lowest-performing sections.');
  });

  it('includes only active activity columns and preserves canonical student scores', () => {
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector('.results-header')?.textContent || '';
    const row = element.querySelector('.results-row')?.textContent || '';
    expect(header).toContain('MCQ');
    expect(header).toContain('Fill Blanks');
    expect(header).not.toContain('Drag & Drop');
    expect(header).not.toContain('Classification');
    expect(row).toContain('29%');
    expect(row).toContain('100%');
  });

  it('renders a long student email in a non-clipped table cell', () => {
    const studentCell = fixture.nativeElement.querySelector('.results-row span:first-child') as HTMLElement;
    expect(studentCell.textContent).toContain('@example-school.edu');
    expect(getComputedStyle(studentCell).overflowWrap).toBe('anywhere');
  });

  it('uses compact three-page report sections without forced nested page breaks', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pdf-page').length).toBe(3);
    expect(element.querySelectorAll('.summary-row').length).toBe(0);
    expect(element.querySelectorAll('.passfail-section').length).toBe(0);
  });
});
