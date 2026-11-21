import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpeakingResultView } from './speaking-result-view';
import type { SpeakingResultBlock } from '../../../api/speaking-api.service';

const BLOCK = (over: Partial<SpeakingResultBlock> = {}): SpeakingResultBlock => ({ overallScore: 62.5, maxScore: 100, grade: 'C',
  criteria: [{ criterionId: 'speaking-task', title: 'Task and content', level: 'Good', weightPercent: 25, points: 18.75, comment: 'You answered the question with examples.' },
    { criterionId: 'speaking-fluency', title: 'Fluency', level: 'Developing', weightPercent: 25, points: 12.5, comment: 'Some long pauses broke the flow.' }],
  categories: [], summary: 'A clear answer about your town.', strengths: ['You stayed on the topic.'], improvements: ['Link your ideas with because and so.'],
  actionSteps: [{ priority: 1, action: 'Practise linking words.' }], teacherComments: '', scoreNote: null, assessedAt: null, ...over });
const FLUENCY = { wordsPerMinute: 132.4, fillersPer100Words: 3.1, pausesOverOneSecond: 4, longestPauseSeconds: 2.3, repetitions: 1 };

describe('SpeakingResultView', () => {
  let fixture: ComponentFixture<SpeakingResultView>;
  const root = () => fixture.nativeElement as HTMLElement;
  const render = (inputs: Record<string, unknown>) => {
    fixture = TestBed.createComponent(SpeakingResultView);
    fixture.componentRef.setInput('result', BLOCK());
    fixture.componentRef.setInput('fluency', FLUENCY);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
  };
  beforeEach(() => TestBed.configureTestingModule({ imports: [SpeakingResultView] }));

  it('marks visible: overall score, each criterion with its level, points and comment, the feedback lists and the fluency figures', () => {
    render({ marksVisible: true, audience: 'student' });
    expect(root().textContent).toContain('62.5/100');
    const rows = root().querySelectorAll('[data-criterion]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Task and content');
    expect(rows[0].textContent).toContain('Level: Good');
    expect(rows[0].textContent).toContain('18.75/25');
    expect(rows[0].textContent).toContain('You answered the question with examples.');
    expect(root().textContent).toContain('A clear answer about your town.');
    expect(root().textContent).toContain('You stayed on the topic.');
    expect(root().textContent).toContain('Link your ideas with because and so.');
    expect(root().textContent).toContain('Practise linking words.');
    const figures = root().querySelector('dl.assignment-stats')!;
    expect(figures.textContent).toContain('Words per minute');
    expect(figures.textContent).toContain('132.4');
    expect(figures.textContent).toContain('Pauses over 1 second');
  });

  it('marks hidden by the teacher: no score and no points anywhere, the levels and comments stay', () => {
    render({ marksVisible: false, audience: 'student', result: BLOCK({ overallScore: undefined, grade: undefined,
      criteria: BLOCK().criteria.map(({ points, ...rest }) => (void points, rest)) }) });
    expect(root().textContent).toContain('Marks hidden by teacher');
    expect(root().textContent).not.toMatch(/\d+(\.\d+)?\/(100|25)/);
    expect(root().textContent).toContain('Level: Developing');
  });

  it('marks hidden: no points even if the data carried some (the page never shows them)', () => {
    render({ marksVisible: false, audience: 'student' });
    expect(root().textContent).not.toContain('18.75');
    expect(root().textContent).not.toContain('62.5');
  });

  it('off topic: the fixed note for everyone; the cap and the score before it for the teacher only', () => {
    const note = 'This answer did not address the task, so the score is capped.';
    render({ marksVisible: true, audience: 'student', result: BLOCK({ overallScore: 50, scoreNote: note }), offTopicCap: { cap: 50, uncappedScore: 62.5 } });
    expect(root().querySelector('[data-score-note]')!.textContent).toContain(note);
    expect(root().querySelector('[data-score-note]')!.getAttribute('role')).toBe('note');
    expect(root().querySelector('[data-cap-info]')).toBeNull();
    expect(root().textContent).not.toContain('62.5');
    render({ marksVisible: true, audience: 'teacher', result: BLOCK({ overallScore: 50, scoreNote: note }), offTopicCap: { cap: 50, uncappedScore: 62.5 } });
    expect(root().querySelector('[data-cap-info]')!.textContent).toContain('capped at 50');
    expect(root().querySelector('[data-cap-info]')!.textContent).toContain('62.5');
  });

  it('teacher comments are shown when there are some', () => {
    render({ marksVisible: true, audience: 'student', result: BLOCK({ teacherComments: 'Well done, speak a little slower.' }) });
    expect(root().textContent).toContain('Well done, speak a little slower.');
  });
});
