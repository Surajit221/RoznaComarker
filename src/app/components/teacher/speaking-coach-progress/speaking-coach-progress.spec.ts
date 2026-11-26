import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingCoachProgress } from './speaking-coach-progress';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';
import type { TeacherCoachProgress, TeacherCoachTask } from '../../../api/speaking-coach-api.service';

const API = 'http://localhost:5000/api/speaking-coach';
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const taskRow = (over: Partial<TeacherCoachTask> = {}): TeacherCoachTask => ({ taskId: 't1', order: 1, type: 'repeat_improve', area: 'Grammar',
  prompt: 'Answer the task again. This time, focus on your grammar.', status: 'passed', attemptCount: 2, originalLevel: 'Developing', latestLevel: 'Good', passed: true,
  passRule: { rule: 'threshold', minimumPercent: 70 }, passRuleText: 'Passes at 70% or above.', lastAttemptAt: '2026-11-26T10:00:00.000Z', ...over });
const PROGRESS: TeacherCoachProgress = { state: 'in-progress', sourceStatus: 'current', submissionId: 's1', sessionId: 'sess1', settings: { passPercent: 70, attemptCap: 20 },
  summary: { totalTasks: 2, passedTasks: 1, attemptsUsed: 3, attemptCap: 20, lastPracticedAt: '2026-11-26T10:00:00.000Z' },
  tasks: [taskRow(), taskRow({ taskId: 't2', order: 2, type: 'fluency_drill', area: 'Fluency and flow', status: 'active', passed: false, attemptCount: 1,
    originalLevel: 'Weak', latestLevel: 'Weak', passRule: { rule: 'second_highest', minimumPercent: 66.67 },
    passRuleText: 'No level of this criterion falls between 70% and 100%, so the second-highest level (66.67%) and above passes.' })] };

describe('SpeakingCoachProgress (teacher)', () => {
  let fixture: ComponentFixture<SpeakingCoachProgress>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent?.replace(/\s+/g, ' ') || '';
  async function load(answer: (url: string) => void) {
    TestBed.configureTestingModule({ imports: [SpeakingCoachProgress], providers: [...httpTestingProviders] });
    fixture = TestBed.createComponent(SpeakingCoachProgress);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('submissionId', 's1');
    fixture.detectChanges();
    answer(`${API}/teacher/submissions/s1/progress`);
    await settle(); fixture.detectChanges();
  }
  afterEach(() => { http.verify(); fixture.destroy(); });

  it('the coach switched off (404): the card is not shown at all', async () => {
    await load(url => http.expectOne(url).flush({ success: false }, { status: 404, statusText: 'Not Found' }));
    expect(root().querySelector('section')).toBeNull();
  });

  it('not started yet', async () => {
    await load(url => http.expectOne(url).flush({ success: true, data: { ...PROGRESS, state: 'not-started', sessionId: null, settings: null, tasks: [],
      summary: { totalTasks: 0, passedTasks: 0, attemptsUsed: 0, attemptCap: null, lastPracticedAt: null } } }));
    expect(text()).toContain('Speaking Practice Progress');
    expect(text()).toContain('Practice only — does not affect the assignment grade');
    expect(text()).toContain('The student has not started practice yet.');
  });

  describe('always shown (empty states and the areas)', () => {
    const EMPTY = { ...PROGRESS, sessionId: null, settings: null, tasks: [], summary: { totalTasks: 0, passedTasks: 0, attemptsUsed: 0, attemptCap: null, lastPracticedAt: null } };
    const AREAS = [{ criterionId: 'speaking-task', title: 'Task and content', levelTitle: 'Excellent', needsPractice: false },
      { criterionId: 'speaking-grammar', title: 'Grammar', levelTitle: 'Developing', needsPractice: true },
      { criterionId: 'speaking-fluency', title: 'Fluency', levelTitle: null, needsPractice: false }];
    const rows = () => [...root().querySelectorAll('.area')].map(row => row.textContent!.replace(/\s+/g, ' ').trim());

    it('the 96% case: "No practice needed", with every area and its level marked Strong', async () => {
      const strong = AREAS.map(area => ({ ...area, levelTitle: area.levelTitle ?? 'Good', needsPractice: false }));
      await load(url => http.expectOne(url).flush({ success: true, data: { ...EMPTY, state: 'no-practice-needed', areas: strong } }));
      expect(text()).toContain('No practice needed: every area of this result is strong.');
      expect(text()).not.toContain('has not started');
      expect(rows()).toEqual(['Task and content Excellent ✓ Strong', 'Grammar Developing ✓ Strong', 'Fluency Good ✓ Strong']);
    });

    it('not started: "Student has not started practice yet", the areas that need practice marked in words', async () => {
      await load(url => http.expectOne(url).flush({ success: true, data: { ...EMPTY, state: 'not-started', areas: AREAS } }));
      expect(text()).toContain('The student has not started practice yet.');
      expect(rows()).toEqual(['Task and content Excellent ✓ Strong', 'Grammar Developing ● Needs practice', 'Fluency Not assessed']);
      expect(root().querySelector('.areas')!.getAttribute('aria-label')).toBe('Areas of this result');
    });

    it('result not ready, and a result without rubric scores: the card says so', async () => {
      await load(url => http.expectOne(url).flush({ success: true, data: { ...EMPTY, state: 'result-not-ready', areas: [] } }));
      expect(text()).toContain('Practice opens when this result is ready.');
      expect(root().querySelector('.areas')).toBeNull();
      http.verify(); fixture.destroy(); TestBed.resetTestingModule();
      await load(url => http.expectOne(url).flush({ success: true, data: { ...EMPTY, state: 'no-rubric-scores', areas: [] } }));
      expect(text()).toContain('Practice is not available for this result: it has no rubric scores.');
    });

    it('in progress: the areas are listed too (with the progress)', async () => {
      await load(url => http.expectOne(url).flush({ success: true, data: { ...PROGRESS, areas: AREAS } }));
      expect(text()).toContain('Tasks passed: 1 of 2');
      expect(rows().length).toBe(3);
    });
  });

  it('in progress: tasks passed, recordings used, each task with its level, pass or not in words, and the pass rule', async () => {
    await load(url => http.expectOne(url).flush({ success: true, data: PROGRESS }));
    expect(text()).toContain('Tasks passed: 1 of 2');
    expect(text()).toContain('Recordings used: 3 of 20');
    expect(root().querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    const cards = [...root().querySelectorAll('.task-card')].map(card => card.textContent?.replace(/\s+/g, ' ') || '');
    expect(cards[0]).toContain('Task 1: Grammar');
    expect(cards[0]).toContain('Repeat and improve');
    expect(cards[0]).toContain('Passed');
    expect(cards[0]).toContain('Developing');
    expect(cards[0]).toContain('Good');
    expect(cards[0]).toContain('Passes at 70% or above.');
    expect(cards[1]).toContain('Keep practising');
    expect(cards[1]).toContain('Fluency drill');
    expect(cards[1]).toContain('the second-highest level (66.67%) and above passes');
  });

  it('completed, capped and an earlier result: their own lines', async () => {
    await load(url => http.expectOne(url).flush({ success: true, data: { ...PROGRESS, state: 'capped', sourceStatus: 'outdated' } }));
    expect(text()).toContain('The student used all practice recordings.');
    expect(text()).toContain('This practice was started from an earlier version of the result.');
  });

  it('attempt history: the answer the student gave (as text), the level, pass or not, the feedback; more on request', async () => {
    await load(url => http.expectOne(url).flush({ success: true, data: PROGRESS }));
    const toggle = [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => /View attempts/.test(b.textContent || ''))!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click(); fixture.detectChanges();
    const req = http.expectOne(`${API}/teacher/sessions/sess1/tasks/t1/attempts?page=1&limit=10`);
    req.flush({ success: true, data: { sessionId: 'sess1', taskId: 't1', attempts: [{ id: 'a2', attemptNumber: 2, state: 'ready', levelTitle: 'Good', passed: true, onTask: true,
      notAssessableReason: null, failure: null, feedback: { improved: ['Clearer verbs.'], stillWeak: [], nextTip: 'Add an example.' }, vocab: null, fluencyChange: null,
      answerText: '<b>My town</b> is small and peaceful.', attemptedAt: '2026-11-26T10:00:00.000Z' }],
    pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasMore: true } } });
    await settle(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(text()).toContain('Attempt 2');
    expect(text()).toContain('<b>My town</b> is small and peaceful.');   // shown as text, never as markup
    expect(root().querySelector('.attempt b')).toBeNull();
    expect(text()).toContain('Clearer verbs.');
    const more = [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => /Load more/.test(b.textContent || ''))!;
    more.click(); fixture.detectChanges();
    http.expectOne(`${API}/teacher/sessions/sess1/tasks/t1/attempts?page=2&limit=10`).flush({ success: true, data: { sessionId: 'sess1', taskId: 't1',
      attempts: [{ id: 'a1', attemptNumber: 1, state: 'not_assessable', levelTitle: null, passed: null, onTask: null, notAssessableReason: 'not_enough_speech', failure: null,
        feedback: null, vocab: null, fluencyChange: null, answerText: 'My town.', attemptedAt: '2026-11-26T09:00:00.000Z' }],
      pagination: { page: 2, limit: 10, total: 2, totalPages: 1, hasMore: false } } });
    await settle(); fixture.detectChanges();
    expect(text()).toContain('Not enough speech to check');
  });

  it('an error loading: a fixed message', async () => {
    await load(url => http.expectOne(url).flush({ success: false }, { status: 503, statusText: 'Unavailable' }));
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Speaking practice progress could not be loaded.');
  });
});
