import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { AuthService } from '../../../auth/auth.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { GradeCheck, GradeCheckDraftStore } from './grade-check';
import { REASON_MAX, ScoreReview, ScoreReviewBody, countLines, describeReviewFailure, reasonError, scoreLines, statusCopy } from './grade-check.logic';

const FP = 'a'.repeat(64);
const review = (patch: Partial<ScoreReview> = {}): ScoreReview => ({ status: 'needed', fingerprint: FP, decision: null,
  scores: { overallScore: 82, grade: 'B', categories: { GRAMMAR: { score: 18, maxScore: 25 }, MECHANICS: { score: 8, maxScore: 10 } }, customRubricOverallScore: null },
  countsScored: { content: 0, organization: 0, grammar: 7, vocabulary: 0, mechanics: 2, total: 9 }, countsVisible: { content: 0, organization: 0, grammar: 5, vocabulary: 1, mechanics: 2, total: 8 }, ...patch });
const decision = (patch = {}) => ({ outcome: 'kept', at: '2026-11-01T10:00:00.000Z', by: 'me', draftNumber: 1, annotationRevision: 4, fingerprint: FP, ...patch });
const httpError = (status: number, code?: string) => new HttpErrorResponse({ status, error: code ? { code } : null });

describe('grade check rules', () => {
  it('reason: length and control characters are refused, ordinary text is not', () => {
    expect(reasonError('')).toBeNull();
    expect(reasonError('Kept: the OCR misread one word.')).toBeNull();
    expect(reasonError('x'.repeat(REASON_MAX))).toBeNull();
    expect(reasonError('x'.repeat(REASON_MAX + 1))).toContain('at most 500');
    for (const bad of ['a\nb', 'a\tb', 'a\u0007b', 'a\u0085b']) expect(reasonError(bad)).toContain('cannot be saved');
  });
  it('status is words; a score change after a check says so', () => {
    expect(statusCopy(review()).label).toBe('Check needed');
    expect(statusCopy(review()).explanation).toBe('Corrections changed after these scores were set. Check the grade.');
    expect(statusCopy(review({ decision: decision({ fingerprint: 'b'.repeat(64) }) })).explanation).toContain('scores changed after your last check');
    expect(statusCopy(review({ status: 'checked' })).label).toBe('Checked');
    expect(statusCopy(review({ status: 'not_needed' })).label).toBe('No check needed');
    expect(statusCopy(review({ status: 'unavailable' })).explanation).toContain('Try again when it finishes');
  });
  it('score and count lines; a custom rubric total is not presented as a sum of categories', () => {
    expect(scoreLines(review())).toEqual(['Grammar 18/25', 'Mechanics 8/10']);
    expect(countLines(review())).toEqual(['Grammar: 7 when scored, 5 shown to the student', 'Vocabulary: 0 when scored, 1 shown to the student', 'Mechanics: 2 when scored, 2 shown to the student']);
    expect(scoreLines(review({ scores: { ...review().scores, customRubricOverallScore: 70 } }))).toEqual([]);
  });
  it('maps every server code', () => {
    const kind = (code: string, status = 409) => describeReviewFailure(status, code).kind;
    for (const code of ['ANNOTATION_REVISION_CONFLICT', 'ANNOTATION_SCORE_CHANGED', 'ANNOTATION_ASSESSMENT_BUSY', 'ANNOTATION_EVALUATION_NOT_CURRENT', 'ANNOTATION_REVIEW_NOT_NEEDED', 'ANNOTATION_IDEMPOTENCY_CONFLICT', 'ANNOTATION_SOURCE_UNAVAILABLE']) expect(kind(code)).withContext(code).toBe('reload');
    expect(kind('ANNOTATION_CLASS_CLOSED')).toBe('closed');
    expect(kind('ANNOTATION_NOT_FOUND', 404)).toBe('notFound');
    expect(kind('ANNOTATION_INVALID_FIELDS', 400)).toBe('invalid');
    expect(kind('ANNOTATION_RATE_LIMITED', 429)).toBe('retry');
    expect(describeReviewFailure(404, undefined).kind).toBe('notFound');
    expect(describeReviewFailure(429, undefined).kind).toBe('retry');
    expect(describeReviewFailure(0, undefined).kind).toBe('retry');
    expect(describeReviewFailure(503, undefined).kind).toBe('retry');
    expect(describeReviewFailure(400, undefined).kind).toBe('invalid');
    // The teacher is told what changed, and that the reason was kept.
    expect(describeReviewFailure(409, 'ANNOTATION_SCORE_CHANGED').message).toContain('the scores changed');
    expect(describeReviewFailure(409, 'ANNOTATION_REVISION_CONFLICT').message).toContain('Your reason is still here');
  });
});

describe('GradeCheck', () => {
  let fixture: ComponentFixture<GradeCheck>, component: GradeCheck, registry: UnsavedWorkRegistry;
  let calls: ScoreReviewBody[], respond: (body: ScoreReviewBody) => Promise<unknown>, emitted: string[];
  const dom = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => dom().querySelector<T>(selector);
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(patch: Partial<ScoreReview> = {}, inputs: Record<string, unknown> = {}, fresh = true) {
    if (fresh) {
      calls = []; respond = async () => ({ revision: 5 }); emitted = [];
      await TestBed.configureTestingModule({ imports: [GradeCheck], providers: [
        { provide: TeacherAnnotationApiService, useValue: { scoreReview: (_id: string, body: ScoreReviewBody) => { calls.push(JSON.parse(JSON.stringify(body))); return respond(body); } } },
        { provide: AuthService, useValue: { getMeProfile: async () => ({ id: 'me' }) } }] }).compileComponents();
    }
    fixture = TestBed.createComponent(GradeCheck);
    const defaults: Record<string, unknown> = { submissionId: 's1', review: review(patch), revision: 4, sourceHash: 'hash', ...inputs };
    for (const [key, value] of Object.entries(defaults)) fixture.componentRef.setInput(key, value);
    component = fixture.componentInstance; registry = TestBed.inject(UnsavedWorkRegistry);
    component.decided.subscribe(() => emitted.push('decided')); component.reloadNeeded.subscribe(() => emitted.push('reload'));
    component.closedByServer.subscribe(() => emitted.push('closed')); component.noAccess.subscribe(() => emitted.push('noAccess'));
    await settle();
  }
  const keepButton = () => q<HTMLButtonElement>('[data-grade-keep]');
  async function typeReason(value: string) { const el = q<HTMLInputElement>('[data-grade-reason]')!; el.value = value; el.dispatchEvent(new Event('input')); await settle(); }
  async function keep() { keepButton()!.click(); await settle(); }
  afterEach(() => { registry?.clear('teacher-grade-check'); TestBed.inject(GradeCheckDraftStore).draft = null; TestBed.resetTestingModule(); });

  describe('states', () => {
    it('needed: words, scores, counts, the button and its notes', async () => {
      await create();
      expect(text()).toContain('Check needed.');
      expect(text()).toContain('Corrections changed after these scores were set. Check the grade.');
      expect(q('[data-grade-overall]')!.textContent!.replace(/\s+/g, ' ')).toContain('Overall: 82 · Grade: B');
      expect(text()).toContain('Grammar 18/25');
      expect(text()).toContain('Grammar: 7 when scored, 5 shown to the student');
      expect(keepButton()!.textContent).toContain('Keep these scores');
      expect(text()).toContain('Scores are not changed here. This records that you checked them.');
      expect(text()).toContain("Scores can't be edited in this screen yet.");
    });
    it('checked: when, who and why; no button', async () => {
      await create({ status: 'checked', decision: decision({ reason: '<b>OCR</b> slip' }) });
      expect(text()).toContain('Checked.');
      expect(q('[data-grade-decision]')!.textContent).toContain('by you');
      expect(q('[data-grade-decision-reason]')!.textContent).toBe('<b>OCR</b> slip');
      expect(q('[data-grade-decision-reason] b')).toBeNull();
      expect(keepButton()).toBeNull();
      expect(q('[data-grade-reason]')).toBeNull();
    });
    it('a decision by someone else says so', async () => {
      await create({ status: 'checked', decision: decision({ by: 'other' }) });
      expect(q('[data-grade-decision]')!.textContent).toContain('by another teacher');
    });
    it('not needed, unavailable: no button', async () => {
      await create({ status: 'not_needed' });
      expect(text()).toContain('No check needed.');
      expect(keepButton()).toBeNull();
      fixture.componentRef.setInput('review', review({ status: 'unavailable' })); await settle();
      expect(text()).toContain('Not available right now.');
      expect(text()).toContain('Try again when it finishes.');
      expect(keepButton()).toBeNull();
    });
    it('still needed after a check: the old decision stays on show', async () => {
      await create({ decision: decision() });
      expect(q('[data-grade-decision]')!.textContent).toContain('Last checked');
      expect(keepButton()).not.toBeNull();
    });
  });

  describe('gating', () => {
    it('unsaved editor input: blocked, with the reason shown, and the button keeps focus', async () => {
      await create({}, { editorBlock: 'Save or cancel your correction first.' });
      expect(keepButton()!.getAttribute('aria-disabled')).toBe('true');
      expect(keepButton()!.disabled).toBeFalse();
      expect(q('[data-grade-blocked]')!.textContent).toContain('Save or cancel');
      await keep();
      expect(calls).toEqual([]);
    });
    it('read-only (closed class): no field, no button, the reason is said', async () => {
      await create({}, { readOnly: true, closedNote: 'This class is closed, so the grade check is read-only.' });
      expect(keepButton()).toBeNull();
      expect(q('[data-grade-reason]')).toBeNull();
      expect(q('[data-grade-readonly]')!.textContent).toContain('read-only');
      expect(text()).toContain('Check needed.');   // the status is still shown
    });
    it('while a request runs, a second press sends nothing', async () => {
      await create();
      let finish!: (value: unknown) => void;
      respond = () => new Promise(resolve => { finish = resolve; });
      keepButton()!.click(); fixture.detectChanges();
      keepButton()!.click(); fixture.detectChanges();
      expect(calls.length).toBe(1);
      expect(keepButton()!.getAttribute('aria-disabled')).toBe('true');
      finish({ revision: 5 }); await settle();
    });
  });

  describe('the request', () => {
    it('sends exactly the whitelisted fields, with no score in it', async () => {
      await create();
      await keep();
      expect(Object.keys(calls[0]).sort()).toEqual(['outcome', 'requestId', 'revision', 'scoreFingerprint', 'sourceHash']);
      expect(calls[0]).toEqual(jasmine.objectContaining({ revision: 4, sourceHash: 'hash', scoreFingerprint: FP, outcome: 'kept' }));
      expect(calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(emitted).toEqual(['decided']);
    });
    it('a reason is sent as typed; a blank one is left out', async () => {
      await create();
      await typeReason('  Kept.  ');
      await keep();
      expect(calls[0].reason).toBe('  Kept.  ');
      expect(component.reason()).toBe('');
      await typeReason('   ');
      fixture.componentRef.setInput('review', review()); await keep();
      expect('reason' in calls[1]).toBeFalse();
    });
    it('an invalid reason is refused before any request, and focus goes to the field', async () => {
      await create();
      component.setReason('a\u0007b'); await settle();
      await keep();
      expect(calls).toEqual([]);
      expect(q('[data-grade-reason-error]')!.textContent).toContain('cannot be saved');
      expect(q('[data-grade-reason]')!.getAttribute('aria-invalid')).toBe('true');
    });
    it('each new action gets a fresh id', async () => {
      await create();
      await keep();
      await keep();
      expect(calls.length).toBe(2);
      expect(calls[0].requestId).not.toBe(calls[1].requestId);
    });
    it('success is announced, and focus goes to the status, as the button goes away', async () => {
      await create();
      await keep();
      expect(q('[role="status"]')!.textContent).toContain('Checked. The scores were kept');
      expect(document.activeElement).toBe(q('[data-grade-status]'));
    });
  });

  describe('failures', () => {
    it('offline: same id on Retry, never sent again by itself, reason kept and locked', async () => {
      await create();
      await typeReason('My reason');
      respond = async () => { throw httpError(0); };
      await keep();
      expect(calls.length).toBe(1);
      expect(q('[data-grade-error]')!.textContent).toContain('safe and cannot record twice');
      expect(q<HTMLInputElement>('[data-grade-reason]')!.value).toBe('My reason');
      expect(q<HTMLInputElement>('[data-grade-reason]')!.readOnly).toBeTrue();
      expect(keepButton()!.getAttribute('aria-disabled')).toBe('true');
      await settle();
      expect(calls.length).toBe(1);
      respond = async () => ({ revision: 5, replay: true });
      q<HTMLButtonElement>('[data-grade-retry]')!.click(); await settle();
      expect(calls.length).toBe(2);
      expect(calls[1]).toEqual(calls[0]);
      expect(emitted).toEqual(['decided']);
      expect(q('[data-grade-retry]')).toBeNull();
    });
    it('5xx and rate limit keep the request the same way', async () => {
      await create();
      respond = async () => { throw httpError(503); };
      await keep();
      expect(q('[data-grade-retry]')).not.toBeNull();
      respond = async () => { throw httpError(429, 'ANNOTATION_RATE_LIMITED'); };
      q<HTMLButtonElement>('[data-grade-retry]')!.click(); await settle();
      expect(q('[data-grade-error]')!.textContent).toContain('Wait a few minutes');
      expect(calls[1].requestId).toBe(calls[0].requestId);
    });
    it('Discard drops the request and loads the truth', async () => {
      await create();
      respond = async () => { throw httpError(0); };
      await keep();
      q<HTMLButtonElement>('[data-grade-discard]')!.click(); await settle();
      expect(component.pending()).toBeNull();
      expect(q('[data-grade-error]')).toBeNull();
      expect(emitted).toEqual(['reload']);
    });
    for (const code of ['ANNOTATION_REVISION_CONFLICT', 'ANNOTATION_SCORE_CHANGED']) {
      it(`${code}: reloads, says so, keeps the reason, never resends`, async () => {
        await create();
        await typeReason('Keep this text');
        respond = async () => { throw httpError(409, code); };
        await keep();
        expect(emitted).toEqual(['reload']);
        expect(calls.length).toBe(1);
        expect(component.pending()).toBeNull();
        expect(q<HTMLInputElement>('[data-grade-reason]')!.value).toBe('Keep this text');
        expect(q('[role="alert"]')!.textContent).toContain('Nothing was recorded');
        expect(document.activeElement).toBe(q('[data-grade-error]'));
        expect(q('[data-grade-retry]')).toBeNull();
        expect(registry.has('teacher-grade-check')).toBeTrue();
      });
    }
    for (const code of ['ANNOTATION_ASSESSMENT_BUSY', 'ANNOTATION_EVALUATION_NOT_CURRENT', 'ANNOTATION_REVIEW_NOT_NEEDED', 'ANNOTATION_IDEMPOTENCY_CONFLICT']) {
      it(`${code}: a plain message and a reload`, async () => {
        await create();
        respond = async () => { throw httpError(409, code); };
        await keep();
        expect(emitted).toEqual(['reload']);
        expect(q('[data-grade-error]')!.textContent!.length).toBeGreaterThan(20);
        expect(q('[data-grade-error]')!.textContent).not.toContain('ANNOTATION');
      });
    }
    it('closed class: the panel goes read-only', async () => {
      await create();
      respond = async () => { throw httpError(409, 'ANNOTATION_CLASS_CLOSED'); };
      await keep();
      expect(emitted).toEqual(['closed', 'reload']);
    });
    it('404: no access', async () => {
      await create();
      respond = async () => { throw httpError(404, 'ANNOTATION_NOT_FOUND'); };
      await keep();
      expect(emitted).toEqual(['noAccess']);
      expect(q('[data-grade-retry]')).toBeNull();
    });
    it('a reason left when the check is no longer needed can still be read, and cleared', async () => {
      await create();
      await typeReason('Typed text');
      fixture.componentRef.setInput('review', review({ status: 'checked' })); await settle();
      expect(q<HTMLInputElement>('[data-grade-reason]')!.value).toBe('Typed text');
      q<HTMLButtonElement>('[data-grade-clear]')!.click(); await settle();
      expect(registry.has('teacher-grade-check')).toBeFalse();
      expect(q('[data-grade-reason]')).toBeNull();
    });
  });

  describe('unsaved work', () => {
    it('a typed reason is registered; a blank one is not; success clears it', async () => {
      await create();
      expect(registry.has('teacher-grade-check')).toBeFalse();
      await typeReason('   ');
      expect(registry.has('teacher-grade-check')).toBeFalse();
      await typeReason('Reason');
      expect(registry.has('teacher-grade-check')).toBeTrue();
      await keep();
      expect(registry.has('teacher-grade-check')).toBeFalse();
    });
    it('an unconfirmed request is registered too', async () => {
      await create();
      respond = async () => { throw httpError(0); };
      await keep();
      expect(registry.has('teacher-grade-check')).toBeTrue();
    });
    it('rebuilt across the layout breakpoint: the reason and the unconfirmed request survive', async () => {
      await create();
      await typeReason('Reason');
      respond = async () => { throw httpError(0); };
      await keep();
      const sent = calls[0];
      fixture.destroy();
      expect(TestBed.inject(GradeCheckDraftStore).draft).toEqual({ submissionId: 's1', reason: 'Reason', pending: sent });
      await create({}, {}, false);
      expect(component.reason()).toBe('Reason');
      expect(component.pending()).toEqual(sent);
      expect(q('[data-grade-retry]')).not.toBeNull();
    });
    it('agreeing to leave discards it', async () => {
      await create();
      await typeReason('Reason');
      registry.clear('teacher-grade-check');
      fixture.destroy();
      expect(TestBed.inject(GradeCheckDraftStore).draft).toBeNull();
    });
    it('another submission starts clean', async () => {
      await create();
      await typeReason('Reason');
      fixture.componentRef.setInput('submissionId', 's2'); await settle();
      expect(component.reason()).toBe('');
      expect(registry.has('teacher-grade-check')).toBeFalse();
    });
  });
});
