import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { WorksheetExtractReviewComponent, type ExtractedStructure } from './worksheet-extract-review';

describe('WorksheetExtractReviewComponent', () => {
  let fixture: ComponentFixture<WorksheetExtractReviewComponent>;
  let component: WorksheetExtractReviewComponent;

  const structure = (answer: string, confidence: 'high' | 'low' = 'high'): ExtractedStructure => ({
    title: 'Spelling', description: '', subject: 'English', sections: [{ instruction: 'Choose.', questions: [{
      id: 'q1', prompt: 'Which spelling is correct?', type: 'multiple_choice',
      options: ['receive', 'believe', 'ceiling', 'science'], correct_answer: answer,
      topic: 'spelling', confidence
    }] }]
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WorksheetExtractReviewComponent] }).compileComponents();
    fixture = TestBed.createComponent(WorksheetExtractReviewComponent);
    component = fixture.componentInstance;
    component.isOpen = true;
  });

  it('allows a structurally valid low-confidence question to confirm', () => {
    component.extractedStructure = structure('believe', 'low');
    const confirmed = spyOn(component.confirmed, 'emit');
    component.confirm();
    expect(confirmed).toHaveBeenCalled();
  });

  it('blocks a missing answer inline without using native alert', fakeAsync(() => {
    component.extractedStructure = structure('', 'low');
    const nativeAlert = spyOn(window, 'alert');
    const confirmed = spyOn(component.confirmed, 'emit');
    fixture.detectChanges();
    component.confirm();
    fixture.detectChanges();
    tick();
    expect(confirmed).not.toHaveBeenCalled();
    expect(nativeAlert).not.toHaveBeenCalled();
    expect(component.validationMessage).toContain('1 question');
    expect(document.activeElement?.classList.contains('wer-edit-btn')).toBeTrue();
  }));

  it('teacher correction clears blocking validation immediately', () => {
    component.extractedStructure = structure('', 'low');
    component.confirm();
    component.editQuestion(0, component.extractedStructure.sections[0].questions[0]);
    component.editingQuestion!.correct_answer = 'believe';
    component.saveQuestion(0, 0);
    expect(component.invalidQuestions.size).toBe(0);
    expect(component.validationMessage).toBe('');
    expect(component.extractedStructure.sections[0].questions[0].confidence).toBe('high');
  });

  it('treats Q9 and Q15 source guidance as valid subjective grading guidance', () => {
    const questions: any[] = [
      { id: 'q9', prompt: 'Explain one spelling rule.', type: 'short_answer', correct_answer: 'Accept any accurate explanation of the doubling rule.', topic: 'spelling', confidence: 'high' },
      { id: 'q15', prompt: "Use 'necessary' in a sentence.", type: 'essay', correct_answer: "Accept any grammatically correct sentence using 'necessary'.", topic: 'spelling', confidence: 'high' }
    ];
    component.extractedStructure = { title: 'Spelling', description: '', subject: 'English', sections: [{ instruction: 'Respond.', questions }] };
    expect(component.validationIssue(questions[0])).toBeNull();
    expect(component.validationIssue(questions[1])).toBeNull();
    component.confirm();
    expect(component.invalidQuestions.size).toBe(0);
  });

  it('uses subjective-specific labels and missing-guidance validation', () => {
    const q: any = { id: 'q9', prompt: 'Explain.', type: 'short_answer', correct_answer: '', topic: 'rules', confidence: 'low' };
    component.extractedStructure = { title: 'Rules', description: '', subject: 'English', sections: [{ instruction: 'Respond.', questions: [q] }] };
    component.expandedSections.add(0);
    component.editQuestion(0, q);
    fixture.detectChanges();
    expect(component.validationIssue(q)).toBe('missingGradingGuidance');
    expect(fixture.nativeElement.textContent).toContain('Model answer / grading guidance');
    expect(fixture.nativeElement.textContent).not.toContain('Correct Answer:');
  });

  it('renders and validates a source-faithful three-option MCQ', () => {
    const q: any = { id: 'q14', prompt: 'Circle the correct spelling:', type: 'multiple_choice',
      options: ['beginning', 'begining', 'beggining'], correct_answer: 'beginning', topic: 'spelling', confidence: 'high' };
    component.extractedStructure = { title: 'Spelling', description: '', subject: 'English', sections: [{ instruction: 'Circle.', questions: [q] }] };
    component.expandedSections.add(0);
    component.editQuestion(0, q);
    fixture.detectChanges();
    const optionInputs = fixture.nativeElement.querySelectorAll('.wer-option-row input');
    const correctOptions = fixture.nativeElement.querySelectorAll('.wer-options-edit select option');
    expect(optionInputs.length).toBe(3);
    expect(correctOptions.length).toBe(4); // placeholder plus three source choices
    expect(component.validationIssue(q)).toBeNull();
  });

  it('keeps one-option and normalized-duplicate MCQs invalid', () => {
    const base: any = { id: 'q', prompt: 'Choose.', type: 'multiple_choice', correct_answer: 'same', topic: 'x', confidence: 'low' };
    expect(component.validationIssue({ ...base, options: ['same'] })).toBe('invalidOptions');
    expect(component.validationIssue({ ...base, options: ['Same!', 'same?'] })).toBe('invalidOptions');
  });
});
