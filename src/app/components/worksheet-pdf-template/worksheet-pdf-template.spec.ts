import { TestBed } from '@angular/core/testing';
import { WorksheetPdfTemplateComponent } from './worksheet-pdf-template';
import { normalizeViewerPdfInput } from './worksheet-pdf-render.service';

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
    expect(text).toContain('Final right item');
    expect(text).toContain('Final true false question');
    expect(text).toContain('Correct answer: True');
    expect(text).not.toMatch(/Ã|ðŸ|â€”/);
  });

  it('preserves worksheet-style structures for all 17 Potato Life Cycle questions', async () => {
    await TestBed.configureTestingModule({ imports: [WorksheetPdfTemplateComponent] }).compileComponents();
    const fixture = TestBed.createComponent(WorksheetPdfTemplateComponent);
    const mcq = Array.from({ length: 4 }, (_, i) => ({ id: `mcq-${i}`, text: `Long multiple choice question ${i}`, options: ['Option A', 'Option B with longer wrapping text', 'Option C', 'Option D'], correctAnswer: 'Option B with longer wrapping text' }));
    const sentences = Array.from({ length: 3 }, (_, i) => ({ id: `sentence-${i}`, parts: [{ type: 'text', value: `Potato sentence ${i} ` }, { type: 'blank', blankId: `blank-${i}`, correctAnswer: `answer-${i}` }] }));
    const pairs = Array.from({ length: 7 }, (_, i) => ({ id: `pair-${i}`, leftItem: { text: `Left item ${i}` }, rightItem: { text: `Correct matching answer ${i}` } }));
    const trueFalse = Array.from({ length: 3 }, (_, i) => ({ id: `tf-${i}`, text: `True false statement ${i}`, correctAnswer: i % 2 === 0 }));
    fixture.componentRef.setInput('data', {
      worksheet: {
        title: 'Potato Life Cycle 101', subject: 'Science',
        activity3: { title: 'Multiple Choice', instructions: 'Choose one', questions: mcq },
        activity4: { title: 'Fill in the Blanks', instructions: 'Complete each sentence', wordBank: ['answer-0', 'answer-1', 'answer-2'], sentences },
        activity5: { title: 'Matching Pairs', instructions: 'Match each pair', pairs },
        activity6: { title: 'True or False', instructions: 'Choose true or false', questions: trueFalse },
      },
      studentName: 'Student With A Very Long Email Address', date: '2026-08-28',
      a3Answers: Object.fromEntries(mcq.map((q, i) => [q.id, i === 0 ? q.correctAnswer : 'Option A'])),
      a4Blanks: Object.fromEntries(sentences.map((_, i) => [`blank-${i}`, `answer-${i}`])), a4Checked: true,
      a5Matches: Object.fromEntries(pairs.map((p, i) => [p.id, i === 0 ? p.rightItem.text : 'A deliberately long incorrect matching response that must wrap cleanly'])),
      a6Answers: Object.fromEntries(trueFalse.map((q) => [q.id, !q.correctAnswer])),
      totalPointsEarned: 5, totalPointsPossible: 17, percentage: 29,
    } as any);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.wv-mcq-question')).toHaveSize(4);
    expect(root.querySelectorAll('.wv-mcq-btn')).toHaveSize(16);
    expect(root.querySelectorAll('.wv-mcq-btn.correct').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.wv-mcq-btn.wrong').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.wv-sentence')).toHaveSize(3);
    expect(root.querySelectorAll('.wv-word-chip')).toHaveSize(3);
    expect(root.querySelectorAll('.wv-pdf-match-row')).toHaveSize(7);
    expect(root.querySelectorAll('.wv-pdf-match-arrow')).toHaveSize(7);
    expect(root.querySelectorAll('.wv-pdf-tf-card')).toHaveSize(3);
    expect(root.querySelectorAll('.wv-pdf-tf-options')).toHaveSize(3);
    expect(root.querySelectorAll('.wv-pdf-avoid-break')).toHaveSize(17);
    expect(root.textContent).toContain('Wrong - correct answer:');
    expect(root.textContent).toContain('Correct answer:');
    expect((root.textContent || '').indexOf('FINAL SCORE')).toBeLessThan((root.textContent || '').indexOf('Multiple Choice'));
  });

  it('normalizes activities[].data and dynamic answer section ids before rendering', () => {
    const mcq = Array.from({ length: 4 }, (_, i) => ({ id: `mcq-${i}`, text: `Question ${i}`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'B' }));
    const sentences = Array.from({ length: 3 }, (_, i) => ({ id: `sentence-${i}`, parts: [{ type: 'text', value: 'Complete ' }, { type: 'blank', blankId: `blank-${i}`, correctAnswer: `word-${i}` }] }));
    const pairs = Array.from({ length: 7 }, (_, i) => ({ id: `pair-${i}`, leftItem: { text: `Left ${i}` }, rightItem: { text: `Right ${i}` } }));
    const trueFalse = Array.from({ length: 3 }, (_, i) => ({ id: `tf-${i}`, text: `Statement ${i}`, correctAnswer: i % 2 === 0 }));
    const sections = [
      { type: 'multipleChoice', title: 'Multiple Choice', data: { questions: mcq } },
      { type: 'fillBlanks', title: 'Fill in the Blanks', data: { sentences, wordBank: ['word-0', 'word-1', 'word-2'] } },
      { type: 'matching', title: 'Matching Pairs', data: { pairs } },
      { type: 'trueFalse', title: 'True or False', data: { questions: trueFalse } },
    ];
    const submittedAnswers = [
      ...mcq.map((q) => ({ sectionId: 'activity_0', questionId: q.id, studentAnswer: 'A' })),
      ...sentences.map((_, i) => ({ sectionId: 'activity_1', questionId: `blank-${i}`, studentAnswer: `word-${i}` })),
      ...pairs.map((pair) => ({ sectionId: 'activity_2', questionId: pair.id, studentAnswer: pair.rightItem.text })),
      ...trueFalse.map((question) => ({ sectionId: 'activity_3', questionId: question.id, studentAnswer: String(question.correctAnswer) })),
    ];
    const normalized = normalizeViewerPdfInput({ worksheet: { title: 'Potato Life Cycle 101', activities: sections } as any, worksheetId: 'worksheet-id', studentName: 'Student', date: '2026-08-28', submittedAnswers, totalPointsEarned: 13, totalPointsPossible: 17, percentage: 76 });
    expect(normalized.worksheet.activity3?.questions).toHaveSize(4);
    expect(normalized.worksheet.activity4?.sentences).toHaveSize(3);
    expect(normalized.worksheet.activity5?.pairs).toHaveSize(7);
    expect(normalized.worksheet.activity6?.questions).toHaveSize(3);
    expect(Object.keys(normalized.a3Answers)).toHaveSize(4);
    expect(Object.keys(normalized.a4Blanks)).toHaveSize(3);
    expect(Object.keys(normalized.a5Matches || {})).toHaveSize(7);
    expect(Object.keys(normalized.a6Answers || {})).toHaveSize(3);
  });
});
