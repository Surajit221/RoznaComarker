import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RubricDesignerModal } from './rubric-designer-modal';

const validRubric = {
  title: 'Writing Rubric', totalPoints: 100,
  levels: [
    { title: 'Excellent', maxPoints: 100 },
    { title: 'Good', maxPoints: 80 },
    { title: 'Satisfactory', maxPoints: 60 }
  ],
  criteria: [
    { title: 'Content', weight: 40, cells: ['a', 'b', 'c'] },
    { title: 'Organization', weight: 35, cells: ['a', 'b', 'c'] },
    { title: 'Language', weight: 25, cells: ['a', 'b', 'c'] }
  ]
};

describe('RubricDesignerModal', () => {
  it('renders a responsive multiline prompt and submits its multiline value unchanged', async () => {
    await TestBed.configureTestingModule({ imports: [RubricDesignerModal] }).compileComponents();
    const fixture = TestBed.createComponent(RubricDesignerModal);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('textarea[aria-label="Rubric generation prompt"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.rows).toBe(6);
    expect(textarea.classList.contains('w-full')).toBeTrue();
    expect(textarea.classList.contains('min-h-[160px]')).toBeTrue();
    expect(textarea.classList.contains('resize-y')).toBeTrue();
    expect(textarea.classList.contains('overflow-x-hidden')).toBeTrue();

    const prompt = 'Assess the central argument.\nCheck supporting evidence.\nReward clear organization.';
    const emitted: string[] = [];
    fixture.componentInstance.generateAi.subscribe((value) => emitted.push(value));
    textarea.value = prompt;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.componentInstance.onGenerateRubricAi();

    expect(fixture.componentInstance.rubricPromptControl.value).toBe(prompt);
    expect(emitted).toEqual([prompt]);
  });

  it('clears the prompt only after a valid generated rubric is applied', () => {
    const component = new RubricDesignerModal();
    component.rubricPromptControl.setValue('Generate a rubric');
    const emitted: string[] = [];
    component.generateAi.subscribe((value) => emitted.push(value));
    component.onGenerateRubricAi();
    expect(emitted).toEqual(['Generate a rubric']);
    expect(component.rubricPromptControl.value).toBe('Generate a rubric');

    component.rubricDesigner = validRubric;
    component.ngOnChanges({ rubricDesigner: new SimpleChange(null, validRubric, false) });
    expect(component.rubricPromptControl.value).toBe('');
  });

  it('retains the prompt after failure and blocks save until weights total 100', () => {
    const component = new RubricDesignerModal();
    component.rubricPromptControl.setValue('Retry me');
    component.onGenerateRubricAi();
    component.ngOnChanges({ isGenerating: new SimpleChange(true, false, false) });
    expect(component.rubricPromptControl.value).toBe('Retry me');

    component.rubricDesigner = { ...validRubric, criteria: validRubric.criteria.map((row, index) => ({ ...row, weight: row.weight + (index === 0 ? 1 : 0) })) };
    component.ngOnChanges({ rubricDesigner: new SimpleChange(null, component.rubricDesigner, false) });
    const saves: unknown[] = [];
    component.save.subscribe((value) => saves.push(value));
    component.onSaveRubric();
    expect(component.totalCriterionWeight).toBe(101);
    expect(saves).toEqual([]);
  });
});
