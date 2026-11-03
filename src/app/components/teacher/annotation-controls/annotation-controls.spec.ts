import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AnnotationControls, AnnotationDraftStore } from './annotation-controls';
import type { AnnotationBody, AnnotationSnapshot, SnapshotCorrection } from './annotation-editor.logic';
import type { ScoreReview } from './grade-check.logic';
import { AuthService } from '../../../auth/auth.service';

const TEXT = 'I goes to the park and <img src=x onerror=alert(1)> it';
const correction = (patch: Partial<SnapshotCorrection>): SnapshotCorrection => ({ id: 'ai_1', moderationStatus: 'visible', source: 'AI', fileId: 'f1', page: 1, startChar: 2, endChar: 6, quotedText: 'goes', symbol: 'AGR', symbolLabel: 'Agreement', category: 'GRAMMAR', message: 'Use go.', suggestedText: 'go', ...patch });
function snapshot(patch: Partial<AnnotationSnapshot> = {}): AnnotationSnapshot {
  return { revision: 3, sourceHash: 'hash-3', scoringReviewRequired: false, scorePolicy: 'Annotation changes do not change grades.',
    pages: [{ fileId: 'f1', pageNumber: 1, startChar: 0, endChar: TEXT.length, text: TEXT, words: TEXT.split(' ').map((text, i) => ({ id: `w${i}`, text })) }],
    corrections: [correction({})], orphans: [], effective: [{ id: 'ai_1' }],
    transitions: { hide: { from: ['visible'], to: 'hidden' }, restore: { from: ['hidden', 'archived'], to: 'visible' }, archive: { from: ['visible', 'hidden'], to: 'archived' }, edit: { from: ['visible', 'hidden'], to: null }, add: { from: [], to: 'visible' },
      orphan: { edit: { from: ['visible', 'hidden'], to: null }, archive: { from: ['visible', 'hidden'], to: 'archived' }, restore: { from: ['archived'], to: 'orphaned' } } },
    legend: { groups: [{ key: 'GRAMMAR', label: 'Grammar', symbols: [{ symbol: 'AGR', label: 'Agreement' }, { symbol: 'ART', label: 'Article' }] }, { key: 'MECHANICS', label: 'Mechanics', symbols: [{ symbol: 'SP', label: 'Spelling' }] }] }, ...patch };
}
const httpError = (status: number, code?: string) => new HttpErrorResponse({ status, error: code ? { code } : null });

class FakeApi {
  current = snapshot(); calls: AnnotationBody[] = []; snapshotCalls = 0;
  respond: (body: AnnotationBody) => Promise<{ revision: number; replay?: boolean }> = async () => ({ revision: 4 });
  snapshotFailure: unknown = null;
  history = jasmine.createSpy('history').and.callFake(async (_id: string, offset: number) => offset === 0
    ? { items: [{ action: 'hide', previousRevision: 2, newRevision: 3, createdAt: '2026-11-01T10:00:00.000Z', entryId: 'ann_12345678', before: { status: 'visible' }, after: { status: 'hidden' } }], nextOffset: 20 }
    : { items: [{ action: 'add', previousRevision: 1, newRevision: 2, createdAt: '2026-11-01T09:00:00.000Z', entryId: 'teacher_1', before: null, after: { status: 'visible' } }], nextOffset: null });
  async snapshot() { this.snapshotCalls++; if (this.snapshotFailure) throw this.snapshotFailure; return this.current; }
  mutate(_id: string, body: AnnotationBody) { this.calls.push(JSON.parse(JSON.stringify(body))); return this.respond(body); }
}

const SCORE_REVIEW: ScoreReview = { status: 'needed', fingerprint: 'a'.repeat(64), decision: null, countsScored: { grammar: 3 }, countsVisible: { grammar: 2 },
  scores: { overallScore: 82, grade: 'B', categories: { GRAMMAR: { score: 18, maxScore: 25 } }, customRubricOverallScore: null } };

describe('AnnotationControls', () => {
  let fixture: ComponentFixture<AnnotationControls>, component: AnnotationControls, api: FakeApi, registry: UnsavedWorkRegistry;

  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(inputs: { classClosed?: boolean } = {}) {
    api = new FakeApi();
    await TestBed.configureTestingModule({ imports: [AnnotationControls], providers: [{ provide: AuthService, useValue: { getMeProfile: async () => ({ id: 'me' }) } }, { provide: TeacherAnnotationApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(AnnotationControls);
    fixture.componentRef.setInput('submissionId', 's1');
    if (inputs.classClosed) fixture.componentRef.setInput('classClosed', true);
    component = fixture.componentInstance; registry = TestBed.inject(UnsavedWorkRegistry);
    fixture.detectChanges();
  }
  async function openEditor() { await component.toggle(); await settle(); }
  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';
  const button = (label: string, within: Element = dom()) => [...within.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(label)) as HTMLButtonElement | undefined;
  const row = (key = 'ai_1') => dom().querySelector(`[data-row-key="${key}"]`) as HTMLElement;
  function setSelection(start: number, end: number) { const ta = dom().querySelector('[data-source-text]') as HTMLTextAreaElement; ta.setSelectionRange(start, end); ta.dispatchEvent(new Event('select')); }
  function fill(id: string, value: string) { const el = dom().querySelector(`#${id}`) as HTMLTextAreaElement; el.value = value; el.dispatchEvent(new Event('input')); }

  afterEach(() => { registry?.clear('teacher-annotation-editor'); TestBed.inject(AnnotationDraftStore).draft = null; TestBed.resetTestingModule(); });

  describe('review workspace', () => {
    const toggle = () => dom().querySelector<HTMLButtonElement>('[data-sync-toggle]')!;
    const workspace = () => dom().querySelector('app-review-workspace');
    const words = (bbox = true) => TEXT.split(' ').map((word, i) => ({ id: `w${i}`, text: word, bbox: bbox ? { x: 2 + i * 8, y: 5, w: 7, h: 3 } : null }));
    const two = () => snapshot({
      pages: [{ fileId: 'f1', pageNumber: 1, startChar: 0, endChar: TEXT.length, text: TEXT, words: words() }],
      corrections: [correction({ wordIds: ['w1'], quotedText: 'goes' }),
        correction({ id: 'ai_2', moderationStatus: 'hidden', wordIds: ['w3'], quotedText: 'the' }),
        correction({ id: 'ai_3', moderationStatus: 'hidden', wordIds: ['w3'], quotedText: 'not these words' })],
      effective: [{ id: 'ai_1', wordIds: ['w1'], renderTarget: { version: 1, source: 'wordIds', wordIds: ['w1'], boxes: [{ x: 10, y: 5, w: 7, h: 3 }] } }] });
    const open = async () => { api.current = two(); await openEditor(); };
    const mouse = (type: string, target: Element) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse' }));

    it('is closed until the teacher asks: nothing of it exists, and the list has no position labels', async () => {
      await create(); await open();
      expect(workspace()).toBeNull();
      expect(dom().querySelector('[data-row-position]')).toBeNull();
      expect(row().getAttribute('tabindex')).toBe('-1');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });
    it('opening shows it; closing destroys it, clears the selection and restores the list', async () => {
      await create(); await open();
      toggle().click(); await settle();
      expect(workspace()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(row().getAttribute('tabindex')).toBe('0');
      component.selection.pin('ai_1', 'list'); await settle();
      toggle().click(); await settle();
      expect(workspace()).toBeNull();
      expect(component.selection.activeId()).toBeNull();
      expect(row().getAttribute('tabindex')).toBe('-1');
    });
    it('uses the image the page already has and never asks for it', async () => {
      await create();
      fixture.componentRef.setInput('imageUrl', 'blob:already-loaded');
      await open();
      toggle().click(); await settle();
      expect(dom().querySelector('app-review-workspace img')?.getAttribute('src')).toBe('blob:already-loaded');
    });
    it('labels each row: exact says nothing, passed says approximate in words, failed says no position', async () => {
      await create(); await open();
      toggle().click(); await settle();
      const labels = (key: string) => [...row(key).querySelectorAll('[data-row-position]')].map(el => el.textContent?.trim());
      expect(labels('ai_1')).toEqual([]);
      expect(labels('ai_2')).toEqual(['Approximate position']);
      expect(labels('ai_3')).toEqual(['No position on the image', 'Not in the transcript']);
    });
    it('list: one click selects, says so in words, and announces it', async () => {
      await create(); await open();
      toggle().click(); await settle();
      row('ai_2').querySelector('blockquote')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle();
      expect(component.selection.pinnedId()).toBe('ai_2');
      expect(row('ai_2').querySelector('[data-row-selected]')?.textContent).toBe('Selected');
      expect(row('ai_2').getAttribute('aria-current')).toBe('true');
      expect(dom().querySelector('[data-sync-live]')?.textContent).toContain('hidden from the student. Approximate position.');
      expect(dom().querySelector('[data-sync-note]')?.textContent).toContain('Approximate position');
    });
    it('list: a click on a row button does not select; the list has the listeners, not the rows', async () => {
      await create(); await open();
      toggle().click(); await settle();
      const list = dom().querySelector('ul.rows') as HTMLElement;
      expect(list.classList.contains('rows--panel')).toBeTrue();
      button('Change history')!.click(); await settle();
      row('ai_1').querySelector<HTMLButtonElement>('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(component.selection.pinnedId()).toBeNull();
    });
    it('list: hover shows it after the delay and is not announced', async () => {
      await create(); await open();
      toggle().click(); await settle();
      mouse('pointerover', row('ai_1'));
      await new Promise(r => setTimeout(r, 170)); await settle();
      expect(component.selection.activeId()).toBe('ai_1');
      expect(component.selection.pinnedId()).toBeNull();
      expect(dom().querySelector('[data-sync-live]')?.textContent).toBe('');
      mouse('pointerout', row('ai_1'));
      await new Promise(r => setTimeout(r, 170)); await settle();
      expect(component.selection.activeId()).toBeNull();
    });
    it('closing removes the list listeners', async () => {
      await create(); await open();
      toggle().click(); await settle();
      const list = dom().querySelector('ul.rows') as HTMLElement, removes = spyOn(list, 'removeEventListener').and.callThrough();
      toggle().click(); await settle();
      expect(removes.calls.allArgs().map(args => args[0])).toEqual(jasmine.arrayWithExactContents(['pointerover', 'pointerout', 'focusin', 'click']));
    });
    it('list: closed, it does nothing at all', async () => {
      await create(); await open();
      row().querySelector('blockquote')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      mouse('pointerover', row());
      await new Promise(r => setTimeout(r, 170));
      expect(component.selection.activeId()).toBeNull();
    });
    it('Escape and the button clear it', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_1', 'list'); await settle();
      dom().querySelector('#annotation-editor-body')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
      expect(component.selection.activeId()).toBeNull();
      component.selection.pin('ai_1', 'list'); await settle();
      dom().querySelector<HTMLButtonElement>('[data-sync-clear]')!.click(); await settle();
      expect(component.selection.activeId()).toBeNull();
    });
    it('selected from elsewhere while filtered out: the list switches to All and says so', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.setFilter('visible'); await settle();
      expect(row('ai_2')).toBeNull();
      component.selection.pin('ai_2', 'transcript'); await settle();
      expect(component.filter()).toBe('all');
      expect(row('ai_2')).not.toBeNull();
      expect(component.notice()).toContain('Showing all corrections');
    });
    it('hovered from elsewhere while filtered out: the list does not change under the teacher', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.setFilter('visible'); await settle();
      component.selection.hover('ai_2', 'transcript');
      await new Promise(r => setTimeout(r, 170)); await settle();
      expect(component.filter()).toBe('visible');
    });
    it('the selected correction disappears after a reload: cleared, with a notice', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_2', 'list'); await settle();
      api.current = snapshot({ pages: two().pages, corrections: [two().corrections[0]], effective: two().effective });
      await component.reload(); await settle();
      expect(component.selection.activeId()).toBeNull();
      expect(component.notice()).toContain('no longer in the list');
    });
    it('survives the 1024px page rebuild: open, with the same selection', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_2', 'list'); await settle();
      fixture.destroy();
      const store = TestBed.inject(AnnotationDraftStore);
      expect(store.draft?.workspaceOpen).toBeTrue();
      expect(store.draft?.pinnedKey).toBe('ai_2');
      fixture = TestBed.createComponent(AnnotationControls);
      fixture.componentRef.setInput('submissionId', 's1');
      component = fixture.componentInstance; fixture.detectChanges(); await settle();
      expect(workspace()).not.toBeNull();
      expect(component.selection.pinnedId()).toBe('ai_2');
    });
    it('another submission starts closed and empty', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_1', 'list'); await settle();
      fixture.componentRef.setInput('submissionId', 's2'); await settle();
      expect(component.workspaceOpen()).toBeFalse();
      expect(component.selection.activeId()).toBeNull();
    });
    it('selecting does not touch an open form or the unsaved guard', async () => {
      await create(); await open();
      toggle().click(); await settle();
      button('Edit')!.click(); await settle();
      fill('annotation-message', 'Half typed');  await settle();
      expect(component.hasUnsaved()).toBeTrue();
      component.selection.pin('ai_2', 'transcript'); await settle();
      expect(component.form()?.value.message).toBe('Half typed');
      expect(registry.has('teacher-annotation-editor')).toBeTrue();
    });
    it('a row without an image position still selects, and the status says why', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_3', 'list'); await settle();
      expect(dom().querySelector('[data-sync-note]')?.textContent).toContain('No position on the image');
    });
  });

  describe('grade check panel', () => {
    const panel = () => dom().querySelector('[data-grade-check]');
    const keepButton = () => dom().querySelector<HTMLButtonElement>('[data-grade-keep]')!;
    let scoreReview: jasmine.Spy;
    beforeEach(async () => {
      await create();
      scoreReview = jasmine.createSpy('scoreReview').and.resolveTo({ revision: 4 });
      (api as unknown as { scoreReview: jasmine.Spy }).scoreReview = scoreReview;
    });
    it('replaces the policy sentence', async () => {
      api.current = snapshot({ scoreReview: SCORE_REVIEW });
      await openEditor();
      expect(panel()).not.toBeNull();
      expect(text()).not.toContain('Annotation changes do not change grades.');
      expect(text()).toContain('Grammar: 3 when scored, 2 shown to the student');
    });
    it('a server without the review: no panel, nothing breaks', async () => {
      await openEditor();
      expect(panel()).toBeNull();
      expect(text()).toContain('Review corrections');
    });
    it('blocked while the correction form has unsaved input; free again when it is cancelled', async () => {
      api.current = snapshot({ scoreReview: SCORE_REVIEW });
      await openEditor();
      expect(keepButton().getAttribute('aria-disabled')).toBe('false');
      button('Add correction')!.click(); await settle();
      fill('annotation-message', 'Unsaved text'); await settle();
      expect(keepButton().getAttribute('aria-disabled')).toBe('true');
      expect(dom().querySelector('[data-grade-blocked]')!.textContent).toContain('Save or cancel your correction first');
      keepButton().click(); await settle();
      expect(scoreReview).not.toHaveBeenCalled();
      component.cancelForm(); await settle();
      expect(keepButton().getAttribute('aria-disabled')).toBe('false');
    });
    it('closed class: read-only', async () => {
      api.current = snapshot({ scoreReview: SCORE_REVIEW, readOnly: true, readOnlyReason: 'CLASS_CLOSED' });
      await openEditor();
      expect(dom().querySelector('[data-grade-keep]')).toBeNull();
      expect(dom().querySelector('[data-grade-readonly]')!.textContent).toContain('read-only');
    });
    it('after a decision: the snapshot and an open history reload; the page is not told scores changed', async () => {
      api.current = snapshot({ scoreReview: SCORE_REVIEW });
      await openEditor();
      await component.toggleHistory(); await settle();
      const saved: void[] = []; component.saved.subscribe(() => saved.push());
      const before = api.snapshotCalls, historyBefore = api.history.calls.count();
      keepButton().click(); await settle();
      expect(scoreReview).toHaveBeenCalledTimes(1);
      expect(api.snapshotCalls).toBe(before + 1);
      expect(api.history.calls.count()).toBe(historyBefore + 1);
      expect(saved).toEqual([]);
    });
    it('history: a readable grade-check row with its reason, as text', async () => {
      api.history.and.resolveTo({ nextOffset: null, items: [{ action: 'score_review', previousRevision: 3, newRevision: 4, createdAt: '2026-11-01T10:00:00.000Z', entryId: null, reason: '<img src=x> kept',
        before: { status: 'needed' }, after: { status: 'checked' } }] });
      await openEditor();
      await component.toggleHistory(); await settle();
      const history = dom().querySelector('.history')!;
      expect(history.textContent).toContain('Grade checked');
      expect(history.textContent).toContain('Scores kept. No score was changed.');
      expect(history.textContent).not.toContain('needed');
      expect(history.textContent).not.toContain(' item ');
      expect(history.querySelector('[data-history-reason]')!.textContent).toContain('<img src=x> kept');
      expect(history.querySelector('img')).toBeNull();
    });
  });

  describe('state badges and gating', () => {
    beforeEach(async () => {
      await create();
      api.current = snapshot({ effective: [{ id: 'ai_1' }],
        corrections: [correction({}), correction({ id: 'ai_2', moderationStatus: 'hidden', entryId: 'ann_2' }), correction({ id: 'ai_3', moderationStatus: 'archived', entryId: 'ann_3' }),
          correction({ id: 'ai_4', teacherEdited: true, entryId: 'ann_4' }), correction({ id: 'teacher_5', source: 'Teacher', entryId: 'teacher_5' })],
        orphans: [{ entryId: 'teacher_6', kind: 'manual', status: 'visible', reason: 'TEXT_NOT_FOUND', value: { quotedText: 'gone', message: 'note', suggestedText: 'x', symbol: 'ART', category: 'GRAMMAR' } }],
        archivedOrphans: [{ entryId: 'teacher_7', kind: 'manual', status: 'archived', reason: 'TEXT_NOT_FOUND', value: { quotedText: 'old', message: 'old', suggestedText: 'x' } }] });
      await openEditor();
    });
    it('shows each state as a word and states how many the student sees', () => {
      expect(row('ai_1').textContent).toContain('Visible to student');
      expect(row('ai_2').textContent).toContain('Hidden from student');
      expect(row('ai_3').textContent).toContain('Removed');
      expect(row('ai_4').textContent).toContain('Edited by you');
      expect(row('teacher_5').textContent).toContain('Teacher');
      expect(row('orphan:teacher_6').textContent).toContain('Needs review');
      expect(row('orphan:teacher_6').textContent).toContain('no longer in the transcript');
      expect(dom().querySelector('[data-counts]')?.textContent?.replace(/\s+/g, ' ')).toContain('1 of 7 corrections are visible to the student');
    });
    it('dims hidden and archived rows but keeps them listed', () => {
      expect(row('ai_2').classList).toContain('row--dimmed');
      expect(row('ai_3').classList).toContain('row--dimmed');
      expect(row('ai_1').classList).not.toContain('row--dimmed');
    });
    it('offers only the legal actions per state', () => {
      const labels = (key: string) => [...row(key).querySelectorAll('button')].map(b => b.textContent?.trim().split(/\s/)[0]);
      expect(labels('ai_1')).toEqual(['Edit', 'Hide', 'Remove']);
      expect(labels('ai_2')).toEqual(['Edit', 'Restore', 'Remove']);
      expect(labels('ai_3')).toEqual(['Restore']);
      expect(labels('orphan:teacher_6')).toEqual(['Place', 'Remove']);
      expect(labels('orphan:teacher_7')).toEqual(['Restore']);
      expect([...row('orphan:teacher_7').querySelectorAll('.badge')].map(b => b.textContent)).not.toContain('Needs review');
      expect(row('orphan:teacher_7').textContent).toContain('Restoring it returns it to Needs review');
    });
    it('restoring an archived orphan says it is back in review, not visible to the student', async () => {
      const before = api.current;
      api.respond = async () => { api.current = { ...before, archivedOrphans: [], orphans: [...before.orphans, { entryId: 'teacher_7', kind: 'manual', status: 'visible', reason: 'TEXT_NOT_FOUND', value: { quotedText: 'old', message: 'old', suggestedText: 'x' } }] }; return { revision: 4 }; };
      button('Restore', row('orphan:teacher_7'))!.click(); await settle();
      expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'restore', id: 'teacher_7' }));
      expect(text()).toContain('Back in Needs review');
      expect(row('orphan:teacher_7').textContent).toContain('Needs review');
    });
    it('an illegal action is refused without a request', () => {
      const archived = component.rows().find(r => r.key === 'ai_3')!;
      component.run('hide', archived);
      expect(api.calls).toEqual([]);
    });
  });

  describe('actions and the API contract', () => {
    beforeEach(async () => { await create(); await openEditor(); });
    it('hide sends id, revision, source hash and a fresh request id, then reloads and tells the parent', async () => {
      const saved = jasmine.createSpy('saved'); component.saved.subscribe(saved);
      const before = api.snapshotCalls;
      button('Hide', row())!.click(); await settle();
      expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'hide', id: 'ai_1', revision: 3, sourceHash: 'hash-3' }));
      expect(api.calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(api.calls[0].value).toBeUndefined();
      expect(api.snapshotCalls).toBe(before + 1);
      expect(saved).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Hidden from the student.');
    });
    it('each new user action gets a new request id', async () => {
      button('Hide', row())!.click(); await settle();
      button('Hide', row())!.click(); await settle();
      expect(api.calls[0].requestId).not.toBe(api.calls[1].requestId);
    });
    it('Remove asks first, explains it is restorable and recorded, and sends archive (never the old "reject")', async () => {
      button('Remove', row())!.click(); fixture.detectChanges();
      const dialog = dom().querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBeTrue();
      expect(dialog.textContent).toContain('restore it at any time');
      expect(dialog.textContent).toContain('recorded');
      expect(api.calls).toEqual([]);
      button('Remove', dialog)!.click(); await settle();
      expect(dialog.open).toBeFalse();
      expect(api.calls[0].action).toBe('archive');
    });
    it('"Keep it" sends nothing', async () => {
      button('Remove', row())!.click(); fixture.detectChanges();
      const dialog = dom().querySelector('dialog') as HTMLDialogElement;
      button('Keep it', dialog)!.click(); await settle();
      expect(dialog.open).toBeFalse();
      expect(api.calls).toEqual([]);
    });
    it('add: sends exactly the server keys and never any geometry', async () => {
      button('Add correction')!.click(); await settle();
      setSelection(2, 6); fixture.detectChanges();
      component.chooseSymbol('ART'); fill('annotation-message', 'Note'); fill('annotation-suggestion', 'Fix'); await settle();
      component.saveForm(); await settle();
      const body = api.calls[0];
      expect(body.action).toBe('add'); expect(body.id).toBeUndefined();
      expect(Object.keys(body.value!).sort()).toEqual(['category', 'endChar', 'fileId', 'message', 'page', 'quotedText', 'startChar', 'suggestedText', 'symbol']);
      expect(body.value).toEqual(jasmine.objectContaining({ fileId: 'f1', page: 1, startChar: 2, endChar: 6, quotedText: 'goes', symbol: 'ART', category: 'GRAMMAR' }));
    });
    it('a partial selection grows to whole words', async () => {
      button('Add correction')!.click(); await settle();
      setSelection(3, 8); await settle();
      expect(component.form()!.value.quotedText).toBe('goes to');
      expect(text()).toContain('Selection extended to whole words');
    });
    it('edit opens with the current text and span; an unknown legend symbol must be chosen', async () => {
      button('Edit', row())!.click(); await settle();
      expect(component.form()!.value).toEqual(jasmine.objectContaining({ quotedText: 'goes', startChar: 2, endChar: 6, symbol: 'AGR', category: 'GRAMMAR', message: 'Use go.' }));
      expect(document.activeElement?.hasAttribute('data-form-heading')).toBeTrue();
    });
    it('an invalid form makes no request and says what to fix', async () => {
      button('Add correction')!.click(); await settle();
      component.saveForm(); await settle();
      expect(api.calls).toEqual([]);
      expect(text()).toContain('Select the words');
      expect(text()).toContain('Choose a category and symbol');
      expect(text()).toContain('Explanation is required');
    });
    it('explanation and suggestion have the server caps', async () => {
      button('Add correction')!.click(); await settle();
      expect((dom().querySelector('#annotation-message') as HTMLTextAreaElement).maxLength).toBe(2000);
      expect((dom().querySelector('#annotation-suggestion') as HTMLTextAreaElement).maxLength).toBe(2000);
    });
    it('orphan: "Place again" targets the entry id and must select the span afresh', async () => {
      api.current = snapshot({ corrections: [], effective: [], orphans: [{ entryId: 'teacher_6', kind: 'manual', status: 'visible', reason: 'TEXT_NOT_FOUND', value: { fileId: 'f1', page: 1, quotedText: 'gone', message: 'note', suggestedText: 'x', symbol: 'ART', category: 'GRAMMAR' } }] });
      await component.reload(); await settle();
      button('Place again', row('orphan:teacher_6'))!.click(); await settle();
      expect(component.form()!.value.quotedText).toBe('');
      setSelection(2, 6); await settle();
      component.saveForm(); await settle();
      expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'edit', id: 'teacher_6' }));
    });
  });

  describe('failures', () => {
    beforeEach(async () => { await create(); await openEditor(); });
    it('network failure keeps the request; Retry reuses the same body and request id', async () => {
      api.respond = async () => { throw httpError(0); };
      button('Hide', row())!.click(); await settle();
      expect(text()).toContain('could not confirm');
      expect(registry.hasWork()).toBeTrue();
      api.respond = async () => ({ revision: 4, replay: true });
      button('Retry')!.click(); await settle();
      expect(api.calls.length).toBe(2);
      expect(api.calls[1]).toEqual(api.calls[0]);
      expect(component.pending()).toBeNull();
      expect(registry.hasWork()).toBeFalse();
    });
    it('a 5xx is treated as unconfirmed too, and a form keeps its input', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'My careful text'); await settle();
      api.respond = async () => { throw httpError(500, 'ANNOTATION_OPERATION_FAILED'); };
      component.saveForm(); await settle();
      expect(component.form()!.value.message).toBe('My careful text');
      expect(component.pending()).not.toBeNull();
      expect(button('Retry')).toBeTruthy();
    });
    it('409 stale: reloads, says so, keeps the form and shows what is saved now; saving again is a new request on the new revision', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Mine'); await settle();
      api.respond = async () => { throw httpError(409, 'ANNOTATION_REVISION_CONFLICT'); };
      api.current = snapshot({ revision: 9, sourceHash: 'hash-3', corrections: [correction({ message: 'From the other tab' })] });
      component.saveForm(); await settle();
      expect(text()).toContain('Your change was not saved');
      expect(component.form()!.value.message).toBe('Mine');
      expect(text()).toContain('From the other tab');
      expect(api.calls.length).toBe(1);                // never re-sent on its own
      api.respond = async () => ({ revision: 10 });
      component.saveForm(); await settle();
      expect(api.calls.length).toBe(2);
      expect(api.calls[1].revision).toBe(9);
      expect(api.calls[1].requestId).not.toBe(api.calls[0].requestId);
    });
    it('409 state conflict: reloads and explains', async () => {
      api.respond = async () => { throw httpError(409, 'ANNOTATION_STATE_CONFLICT'); };
      const before = api.snapshotCalls;
      button('Hide', row())!.click(); await settle();
      expect(api.snapshotCalls).toBe(before + 1);
      expect(text()).toContain('no longer possible');
      expect(component.pending()).toBeNull();
    });
    it('429: friendly wait message, the request is kept for Retry', async () => {
      api.respond = async () => { throw httpError(429, 'ANNOTATION_RATE_LIMITED'); };
      button('Hide', row())!.click(); await settle();
      expect(text()).toContain('Wait a few minutes');
      expect(button('Retry')).toBeTruthy();
    });
    it('404: "not found or no access", editing stops', async () => {
      api.respond = async () => { throw httpError(404, 'ANNOTATION_NOT_FOUND'); };
      button('Hide', row())!.click(); await settle();
      expect(text()).toContain('do not have access');
      expect(component.readOnly()).toBeTrue();
      expect(button('Hide', row())).toBeUndefined();
    });
    it('closed class discovered on a write: the whole editor becomes read-only, the form text is kept', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Mine'); await settle();
      api.respond = async () => { throw httpError(409, 'ANNOTATION_CLASS_CLOSED'); };
      component.saveForm(); await settle();
      expect(component.readOnly()).toBeTrue();
      expect(text()).toContain('read-only');
      expect(component.form()!.value.message).toBe('Mine');
      expect(button('Add correction')).toBeUndefined();
      component.saveForm(); await settle();
      expect(api.calls.length).toBe(1);
    });
    it('a load failure says what happened', async () => {
      api.snapshotFailure = httpError(0);
      await component.reload(); await settle();
      expect(text()).toContain('could not be loaded');
    });
  });

  it('the snapshot\'s read-only indicator closes the editor even when the page does not know', async () => {
    await create();
    api.current = snapshot({ readOnly: true, readOnlyReason: 'CLASS_CLOSED' });
    await openEditor();
    expect(text()).toContain('read-only');
    expect(button('Add correction')).toBeUndefined();
    expect(row().querySelectorAll('button').length).toBe(0);
  });

  it('a hidden row that was edited shows the teacher\'s text and the badge', async () => {
    await create();
    api.current = snapshot({ corrections: [correction({ moderationStatus: 'hidden', entryId: 'ann_1', teacherEdited: true, message: 'Teacher wording.' })], effective: [] });
    await openEditor();
    expect(row().textContent).toContain('Teacher wording.');
    expect(row().textContent).toContain('Edited by you');
    expect(row().textContent).toContain('Hidden from student');
  });

  it('closed class known from the page: read-only from the start, no actions at all', async () => {
    await create({ classClosed: true }); await openEditor();
    expect(text()).toContain('read-only');
    expect(button('Add correction')).toBeUndefined();
    expect(row().querySelectorAll('button').length).toBe(0);
  });

  describe('unsaved work', () => {
    beforeEach(async () => { await create(); await openEditor(); });
    it('opening a form alone is not unsaved; typing is; saving clears it', async () => {
      button('Edit', row())!.click(); await settle();
      expect(registry.hasWork()).toBeFalse();
      fill('annotation-message', 'Changed'); await settle();
      expect(registry.hasWork()).toBeTrue();
      component.saveForm(); await settle();
      expect(registry.hasWork()).toBeFalse();
    });
    it('cancelling discards and clears', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Changed'); await settle();
      button('Cancel')!.click(); await settle();
      expect(registry.hasWork()).toBeFalse();
      expect(component.form()).toBeNull();
    });
    it('agreeing to discard is final: the work does not re-register and does not come back', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Changed'); await settle();
      spyOn(window, 'confirm').and.returnValue(true);
      expect(registry.confirmLeave()).toBeTrue();
      await settle();
      expect(registry.hasWork()).toBeFalse();
      fixture.destroy();
      expect(registry.hasWork()).toBeFalse();
      const next = TestBed.createComponent(AnnotationControls);
      next.componentRef.setInput('submissionId', 's1'); next.detectChanges();
      expect(next.componentInstance.form()).toBeNull();
      next.destroy(); TestBed.inject(AnnotationDraftStore).draft = null;
    });
    it('the page being rebuilt (crossing the layout breakpoint) keeps the typed text, the open panel and the protection', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Typed before rotating'); await settle();
      fixture.destroy();
      expect(registry.hasWork()).toBeTrue();
      fixture = TestBed.createComponent(AnnotationControls);
      fixture.componentRef.setInput('submissionId', 's1');
      component = fixture.componentInstance; fixture.detectChanges(); await settle();
      expect(component.form()!.value.message).toBe('Typed before rotating');
      expect(component.open()).toBeTrue();
      expect((dom().querySelector('#annotation-message') as HTMLTextAreaElement).value).toBe('Typed before rotating');
      expect(registry.hasWork()).toBeTrue();
    });
    it('a draft is never restored onto another submission', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'For s1'); await settle();
      fixture.destroy();
      fixture = TestBed.createComponent(AnnotationControls);
      fixture.componentRef.setInput('submissionId', 's2');
      component = fixture.componentInstance; fixture.detectChanges(); await settle();
      expect(component.form()).toBeNull();
    });
    it('a save running when the page is rebuilt comes back as an unconfirmed save with the same request id', async () => {
      let release: (v: { revision: number }) => void = () => undefined;
      api.respond = () => new Promise(resolve => { release = resolve; });
      button('Hide', row())!.click(); await fixture.whenStable(); fixture.detectChanges();
      const sent = api.calls[0];
      fixture.destroy();
      fixture = TestBed.createComponent(AnnotationControls);
      fixture.componentRef.setInput('submissionId', 's1');
      component = fixture.componentInstance; fixture.detectChanges();
      release({ revision: 4 });   // the old instance finishing must not touch anything
      await settle();
      expect(component.pending()!.body).toEqual(sent);
      expect(text()).toContain('could not confirm');
      api.respond = async () => ({ revision: 4, replay: true });
      button('Retry')!.click(); await settle();
      expect(api.calls[1]).toEqual(sent);
      expect(registry.hasWork()).toBeFalse();
    });
    it('switching submission resets the editor', async () => {
      button('Edit', row())!.click(); await settle();
      fixture.componentRef.setInput('submissionId', 's2'); await settle();
      expect(component.form()).toBeNull();
      expect(component.snapshot()).toBeNull();
      expect(component.open()).toBeFalse();
    });
  });

  it('teacher text is rendered as text, never as markup', async () => {
    await create();
    api.current = snapshot({ corrections: [correction({ message: '<img src=x onerror="window.__x=1">', suggestedText: '<script>window.__x=2</script>', quotedText: '"><svg onload=window.__x=3>' })] });
    await openEditor();
    expect(row().querySelector('img, script, svg')).toBeNull();
    expect(row().textContent).toContain('<img src=x onerror="window.__x=1">');
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });

  describe('history', () => {
    beforeEach(async () => { await create(); await openEditor(); });
    it('shows createdAt, the item and a summary; load more appends with the next offset', async () => {
      await component.toggleHistory(); await settle();
      expect(api.history).toHaveBeenCalledWith('s1', 0);
      expect(text()).toContain('visible → hidden');
      expect(text()).toContain('12345678');
      expect(text()).not.toContain('Invalid Date');
      button('Load more')!.click(); await settle();
      expect(api.history).toHaveBeenCalledWith('s1', 20);
      expect(component.historyItems().length).toBe(2);
      expect(button('Load more')).toBeUndefined();
    });
  });

  it('300 corrections: rendering is capped and stays fast; "Show more" extends it', async () => {
    await create();
    api.current = snapshot({ corrections: Array.from({ length: 300 }, (_, i) => correction({ id: `ai_${i}` })), effective: [] });
    const started = performance.now();
    await openEditor();
    const elapsed = performance.now() - started;
    expect(dom().querySelectorAll('[data-row-key]').length).toBe(50);
    expect(text()).toContain('showing 50 of 300');
    expect(elapsed).toBeLessThan(2000);
    console.info(`[annotation editor] 300 corrections, first render: ${elapsed.toFixed(0)} ms`);
    button('Show more')!.click(); await settle();
    expect(dom().querySelectorAll('[data-row-key]').length).toBe(100);
  });
});
