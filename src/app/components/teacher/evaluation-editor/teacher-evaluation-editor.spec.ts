import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeacherEvaluationApiService } from '../../../api/teacher-evaluation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { MySubmissionPage } from '../../../pages/students/my-class-student-pages/detail-my-class-student-pages/my-submission-page/my-submission-page';
import { GuestSubmissionPage } from '../../../pages/students/guest-submission/guest-submission';
import { TeacherEvaluationEditor } from './teacher-evaluation-editor';
import {
  TeacherEvaluationBody, TeacherEvaluationSnapshot, changedCriteria, describeFailure, gradeFor, historySummary, liveTotals, parseScore, textError, validate,
} from './teacher-evaluation.logic';

const crit = (key: string, max: number, ai: number, teacher: { score: number | null; comment: string | null } = { score: null, comment: null }, aiComment = '') => ({
  key, maxScore: max, ai: { score: ai, comment: aiComment }, teacher,
  final: { score: teacher.score ?? ai, comment: teacher.comment ?? aiComment } });
function snapshot(patch: Partial<TeacherEvaluationSnapshot> = {}): TeacherEvaluationSnapshot {
  return { enabled: true, editable: true, blockedReason: null, revision: 3, draftNumber: 1,
    criteria: [crit('GRAMMAR', 25, 18, undefined, 'Watch verb agreement.'), crit('MECHANICS', 10, 8)],
    overall: { ai: 82, final: 82, max: 100 }, grade: { ai: 'B', final: 'B' }, edited: false, history: [], ...patch };
}
const edited = (): TeacherEvaluationSnapshot => snapshot({ revision: 4, edited: true,
  criteria: [crit('GRAMMAR', 25, 18, { score: 20, comment: 'Better now.' }, 'Watch verb agreement.'), crit('MECHANICS', 10, 8)],
  overall: { ai: 82, final: 84, max: 100 }, grade: { ai: 'B', final: 'B' },
  history: [{ at: '2026-11-06T10:00:00.000Z', actorName: 'Ms Rivera', reason: 'Re-read', reset: false, previousRevision: 3, newRevision: 4,
    before: { criteria: { GRAMMAR: { score: 18, comment: 'Watch verb agreement.' } }, overallScore: 82, grade: 'B' },
    after: { criteria: { GRAMMAR: { score: 20, comment: 'Better now.' } }, overallScore: 84, grade: 'B' } }] });
const httpError = (status: number, code?: string) => new HttpErrorResponse({ status, error: code ? { code } : null });

describe('teacher evaluation logic', () => {
  it('parses scores against the criterion maximum with one decimal', () => {
    expect(parseScore('20', 25)).toEqual({ value: 20, error: null });
    expect(parseScore('12.5', 25).value).toBe(12.5);
    expect(parseScore('12.25', 25).error).toContain('one decimal');
    expect(parseScore('26', 25).error).toContain('0 to 25');
    expect(parseScore('-1', 25).error).toContain('0 to 25');
    expect(parseScore('', 25).error).toContain('Enter a score');
    expect(parseScore('abc', 25).error).toContain('number');
  });
  it('live totals follow the server rule: AI overall plus the teacher changes; a comment-only change keeps the AI overall and grade', () => {
    const s = snapshot();
    expect(liveTotals(s, [{ key: 'GRAMMAR', score: '20', comment: '' }, { key: 'MECHANICS', score: '8', comment: '' }])).toEqual({ overall: 84, grade: 'B' });
    expect(liveTotals(s, [{ key: 'GRAMMAR', score: '10', comment: '' }, { key: 'MECHANICS', score: '8', comment: '' }])).toEqual({ overall: 74, grade: 'C' });
    expect(liveTotals(s, [{ key: 'GRAMMAR', score: '18', comment: 'New' }, { key: 'MECHANICS', score: '8', comment: '' }])).toEqual({ overall: 82, grade: 'B' });
    expect([gradeFor(90), gradeFor(89.9), gradeFor(60), gradeFor(59.9)]).toEqual(['A', 'B', 'D', 'F']);
  });
  it('sends only what changed; refuses HTML and control characters; describes conflicts', () => {
    const s = snapshot();
    expect(changedCriteria(s, [{ key: 'GRAMMAR', score: '18', comment: 'Watch verb agreement.' }, { key: 'MECHANICS', score: '9', comment: 'Good' }]))
      .toEqual({ MECHANICS: { score: 9, comment: 'Good' } });
    expect(textError('Nice <b>work</b>', 1000, 'The comment')).toContain('HTML');
    expect(textError('bell\u0007', 1000, 'The comment')).toContain('cannot be saved');
    expect(Object.keys(validate(s, [{ key: 'GRAMMAR', score: '30', comment: '' }], '').rows)).toEqual(['GRAMMAR']);
    expect(describeFailure(409, 'TEACHER_EVALUATION_REVISION_CONFLICT')).toEqual(jasmine.objectContaining({ reload: true, retry: false }));
    expect(describeFailure(0, undefined).retry).toBeTrue();
    expect(historySummary(edited().history[0])).toBe('Grammar 18 → 20, comment changed; overall 82 → 84 (B).');
  });
});

class FakeApi {
  current: TeacherEvaluationSnapshot | null = snapshot(); snapshotCalls = 0; calls: TeacherEvaluationBody[] = [];
  respond: (body: TeacherEvaluationBody) => Promise<{ revision: number; snapshot: TeacherEvaluationSnapshot }> = async () => ({ revision: 4, snapshot: edited() });
  async snapshot() { this.snapshotCalls++; return this.current; }
  save(_id: string, body: TeacherEvaluationBody) { this.calls.push(JSON.parse(JSON.stringify(body))); return this.respond(body); }
}

describe('TeacherEvaluationEditor', () => {
  let fixture: ComponentFixture<TeacherEvaluationEditor>, api: FakeApi, registry: UnsavedWorkRegistry, savedCount: number;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(current: TeacherEvaluationSnapshot | null = snapshot()) {
    api = new FakeApi(); api.current = current;
    await TestBed.configureTestingModule({ imports: [TeacherEvaluationEditor], providers: [{ provide: TeacherEvaluationApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(TeacherEvaluationEditor);
    fixture.componentRef.setInput('submissionId', 's1');
    savedCount = 0; fixture.componentInstance.saved.subscribe(() => savedCount++);
    registry = TestBed.inject(UnsavedWorkRegistry);
    fixture.detectChanges(); await settle();
  }
  const type = (selector: string, value: string) => { const el = dom().querySelector<HTMLInputElement>(selector)!; el.value = value; el.dispatchEvent(new Event('input')); };
  const click = async (selector: string) => { dom().querySelector<HTMLElement>(selector)!.click(); await settle(); };
  afterEach(() => { registry?.clear('teacher-evaluation-editor'); TestBed.resetTestingModule(); });

  it('renders nothing when the backend says the feature is off or not for this teacher (404)', async () => {
    await create(null);
    expect(dom().querySelector('[data-teacher-evaluation]')).toBeNull();
    expect(dom().innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
  });
  it('not editable: says why, Edit does nothing', async () => {
    await create(snapshot({ editable: false, blockedReason: 'CUSTOM_RUBRIC' }));
    expect(dom().querySelector('[data-te-blocked]')!.textContent).toContain('custom rubric');
    expect(dom().querySelector('[data-te-edit]')!.getAttribute('aria-disabled')).toBe('true');
    await click('[data-te-edit]');
    expect(dom().querySelector('form')).toBeNull();
  });
  it('edit: AI suggested shown, focus on the form heading, live overall and grade, dirty registered; Save sends only the change', async () => {
    await create();
    await click('[data-te-edit]');
    expect(document.activeElement).toBe(dom().querySelector('[data-te-heading]'));
    expect(dom().querySelector('[data-te-ai="GRAMMAR"]')!.textContent).toContain('AI suggested: 18 / 25');
    expect(dom().textContent).toContain('AI suggested comment: Watch verb agreement.');
    type('#te-score-GRAMMAR', '20'); await settle();
    expect(dom().querySelector('[data-te-overall]')!.textContent).toBe('84');
    expect(registry.has('teacher-evaluation-editor')).toBeTrue();
    type('#te-reason', 'Re-read'); await settle();
    await click('[data-te-save]');
    expect(api.calls).toEqual([jasmine.objectContaining({ revision: 3, criteria: { GRAMMAR: { score: 20 } }, reason: 'Re-read' })]);
    expect(api.calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/i);
    expect(savedCount).toBe(1);
    expect(dom().querySelector('form')).toBeNull();
    expect(dom().textContent).toContain('Scores saved. Students see the new values.');
    expect(registry.has('teacher-evaluation-editor')).toBeFalse();
    expect(dom().querySelector('[data-te-edited-list]')!.textContent).toContain('AI suggested 18');
    expect(dom().querySelector('[data-te-history]')!.textContent).toContain('Grammar 18 → 20');
  });
  it('a score out of range: inline error, nothing sent, focus on the field', async () => {
    await create();
    await click('[data-te-edit]');
    type('#te-score-GRAMMAR', '26'); await settle();
    await click('[data-te-save]');
    expect(api.calls).toEqual([]);
    expect(dom().querySelector('#te-score-error-GRAMMAR')!.textContent).toContain('0 to 25');
    expect(document.activeElement).toBe(dom().querySelector('#te-score-GRAMMAR'));
  });
  it('409: the reload message, the latest snapshot, and the typed values kept', async () => {
    await create();
    await click('[data-te-edit]');
    type('#te-score-GRAMMAR', '21'); await settle();
    api.respond = async () => { throw httpError(409, 'TEACHER_EVALUATION_REVISION_CONFLICT'); };
    api.current = snapshot({ revision: 9 });
    const loads = api.snapshotCalls;
    await click('[data-te-save]');
    expect(dom().querySelector('[data-te-error]')!.textContent).toContain('Your change was not saved');
    expect(api.snapshotCalls).toBe(loads + 1);
    expect(dom().querySelector<HTMLInputElement>('#te-score-GRAMMAR')!.value).toBe('21');
    api.respond = async () => ({ revision: 10, snapshot: edited() });
    await click('[data-te-save]');
    expect(api.calls[1].revision).toBe(9);
    expect(api.calls[1].requestId).not.toBe(api.calls[0].requestId);
  });
  it('an unconfirmed save is retried with the same request id', async () => {
    await create();
    await click('[data-te-edit]');
    type('#te-score-GRAMMAR', '19'); await settle();
    api.respond = async () => { throw httpError(0); };
    await click('[data-te-save]');
    expect(dom().querySelector('[data-te-error]')!.textContent).toContain('could not confirm');
    api.respond = async () => ({ revision: 4, snapshot: edited() });
    await click('[data-te-save]');
    expect(api.calls[1]).toEqual(api.calls[0]);
  });
  it('Reset asks in the centred dialog first; Escape in the form cancels', async () => {
    await create(edited());
    await click('[data-te-edit]');
    await click('[data-te-reset]');
    const dialog = dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.textContent).toContain('Reset all scores to AI suggested?');
    expect(api.calls).toEqual([]);
    await click('[data-confirm-ok]');
    expect(api.calls).toEqual([jasmine.objectContaining({ revision: 4, reset: true })]);
    await click('[data-te-edit]');
    dom().querySelector('#te-score-GRAMMAR')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
    expect(dom().querySelector('form')).toBeNull();
  });
});

describe('student and guest pages', () => {
  /** The standalone component's compiled dependencies (what its template can render). */
  const dependencies = (component: unknown): unknown[] => {
    const def = (component as { ɵcmp?: { dependencies?: unknown } }).ɵcmp?.dependencies;
    const list = typeof def === 'function' ? (def as () => unknown[])() : (def as unknown[] | undefined) ?? [];
    return list.flat(Infinity as 1);
  };
  it('neither the student submission page nor the guest results page can render the score editor', () => {
    for (const page of [MySubmissionPage, GuestSubmissionPage]) {
      const deps = dependencies(page);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps).not.toContain(TeacherEvaluationEditor);
    }
  });
});
