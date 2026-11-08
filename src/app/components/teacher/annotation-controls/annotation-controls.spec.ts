import { By } from '@angular/platform-browser';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { ReviewWorkspace } from './review-workspace';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AnnotationControls, AnnotationDraftStore, UNDO_MS } from './annotation-controls';
import type { AnnotationBody, AnnotationSnapshot, BulkBody, SnapshotCorrection } from './annotation-editor.logic';
import type { ScoreReview } from './grade-check.logic';
import { DeviceService } from '../../../services/device.service';
import { DashboardSidebarState } from '../../../services/dashboard-sidebar-state.service';
import { wordSpans } from './annotation-editor.logic';
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
  bulkCalls: BulkBody[] = [];
  bulkRespond: (body: BulkBody) => Promise<{ revision: number; changedIds: string[] }> = async body => ({ revision: 4, changedIds: 'ids' in body ? body.ids : ['ai_1'] });
  bulk(_id: string, body: BulkBody) { this.bulkCalls.push(JSON.parse(JSON.stringify(body))); return this.bulkRespond(body); }
}

const SCORE_REVIEW: ScoreReview = { status: 'needed', fingerprint: 'a'.repeat(64), decision: null, countsScored: { grammar: 3 }, countsVisible: { grammar: 2 },
  scores: { overallScore: 82, grade: 'B', categories: { GRAMMAR: { score: 18, maxScore: 25 } }, customRubricOverallScore: null } };

describe('AnnotationControls', () => {
  let fixture: ComponentFixture<AnnotationControls>, component: AnnotationControls, api: FakeApi, registry: UnsavedWorkRegistry;

  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(inputs: { classClosed?: boolean; desktop?: boolean } = {}) {
    api = new FakeApi();
    await TestBed.configureTestingModule({ imports: [AnnotationControls], providers: [{ provide: DeviceService, useValue: { isDesktop: () => !!inputs.desktop, isMobile: () => !inputs.desktop, isCompact: () => !inputs.desktop, isTablet: () => false } }, { provide: AuthService, useValue: { getMeProfile: async () => ({ id: 'me' }) } }, { provide: TeacherAnnotationApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(AnnotationControls);
    fixture.componentRef.setInput('submissionId', 's1');
    if (inputs.classClosed) fixture.componentRef.setInput('classClosed', true);
    component = fixture.componentInstance; registry = TestBed.inject(UnsavedWorkRegistry);
    fixture.detectChanges();
  }
  async function openEditor() { await component.toggle(); component.workspaceOpen.set(false); await settle(); }
  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';
  const button = (label: string, within: Element = dom()) => [...within.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(label)) as HTMLButtonElement | undefined;
  const row = (key = 'ai_1') => dom().querySelector(`[data-row-key="${key}"]`) as HTMLElement;
  function setSelection(start: number, end: number, pageIndex = component.form()?.pageIndex ?? 0, keyboard = false) {
    const ta = dom().querySelector<HTMLTextAreaElement>('[data-source-text]');
    if (ta) { ta.setSelectionRange(start, end); ta.dispatchEvent(new Event('select')); return; }
    const page = component.snapshot()!.pages[pageIndex], spans = wordSpans(page.text, page.words);
    const source = Array.from(dom().querySelectorAll<HTMLElement>('[data-source-content]')).find(el => el.dataset['fileId'] === page.fileId && Number(el.dataset['page']) === page.pageNumber)!;
    const words = source.querySelectorAll('[data-word-id]');
    const first = spans.findIndex(span => span.end > start), last = spans.map(span => span.start < end).lastIndexOf(true);
    const range = document.createRange();
    range.setStart(words[first].firstChild!, Math.max(0, start - spans[first].start) + (words[first].firstChild!.textContent ?? '').indexOf(page.words[first].text));
    range.setEnd(words[last].firstChild!, Math.min(page.words[last].text.length, end - spans[last].start) + (words[last].firstChild!.textContent ?? '').indexOf(page.words[last].text));
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    source.dispatchEvent(keyboard ? new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true }) : new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();
  }
  function fill(id: string, value: string) { const el = dom().querySelector(`#${id}`) as HTMLTextAreaElement; el.value = value; el.dispatchEvent(new Event('input')); }

  afterEach(() => { registry?.clear('teacher-annotation-editor'); TestBed.inject(AnnotationDraftStore).draft = null; TestBed.resetTestingModule(); });

  describe('Phase A: menu on a chosen mark, multi-select and bulk actions', () => {
    const three = () => snapshot({
      corrections: [correction({}), correction({ id: 'ai_2', category: 'MECHANICS', symbol: 'SP', quotedText: 'park', startChar: 14, endChar: 18 }),
        correction({ id: 'ai_3', moderationStatus: 'hidden', quotedText: 'the', startChar: 10, endChar: 13 })] });
    const openWorkspace = async () => { dom().querySelector<HTMLButtonElement>('[data-sync-toggle]')!.click(); await settle(); };
    const menu = () => dom().querySelector('[data-sync-menu]');
    const dialogOpen = () => dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!.open;
    const confirm = async () => { dom().querySelector<HTMLButtonElement>('[data-confirm-ok]')!.click(); await settle(); };

    it('image/transcript selections reveal the list card without a floating action menu; list actions keep their contracts', async () => {
      await create(); api.current = three(); await openEditor(); await openWorkspace();
      const workspace = fixture.debugElement.query(By.directive(ReviewWorkspace)).componentInstance as ReviewWorkspace;
      for (const source of ['transcript', 'image'] as const) {
        workspace.onPointer({ ids: ['ai_1'], kind: 'activate' }, source); await settle();
        expect(component.selection.pinnedId()).toBe('ai_1');
        expect(row().classList).toContain('row--active');
        expect(menu()).toBeNull();
        expect(dom().querySelector('.workspace__mark-menu, app-annotation-mark-menu')).toBeNull();
      }
      button('Hide', row())!.click(); await settle();
      expect(api.calls).toEqual([jasmine.objectContaining({ action: 'hide', id: 'ai_1', revision: 3, sourceHash: 'hash-3' })]);
      component.selection.pin('ai_3', 'image'); await settle();
      button('Remove', row('ai_3'))!.click(); await settle();
      expect(component.confirmRow()?.key).toBe('ai_3');
      expect(api.calls.length).toBe(1);
    });
    it('no menu for a list selection or a closed class', async () => {
      await create(); api.current = three(); await openEditor(); await openWorkspace();
      component.selection.pin('ai_1', 'list'); await settle();
      expect(menu()).toBeNull();
      TestBed.resetTestingModule();
      await create({ classClosed: true }); api.current = three(); await openEditor(); await openWorkspace();
      component.selection.pin('ai_1', 'transcript'); await settle();
      expect(menu()).toBeNull();
      expect(dom().querySelector('[data-bulk]')).toBeNull();
    });
    it('select several, confirm once, hide; Undo restores exactly those, without asking', async () => {
      await create(); api.current = three(); await openEditor();
      dom().querySelector<HTMLButtonElement>('[data-bulk-select-mode]')!.click(); await settle();
      expect(row('ai_3').querySelector('[data-row-select]')).toBeNull();   // hidden rows cannot be hidden again
      for (const key of ['ai_1', 'ai_2']) { row(key).querySelector<HTMLInputElement>('[data-row-select]')!.click(); await settle(); }
      expect(component.selection.pinnedId()).toBeNull();
      dom().querySelector<HTMLButtonElement>('[data-bulk-hide-selected]')!.click(); await settle();
      expect(dialogOpen()).toBeTrue();
      expect(text()).toContain('Hide 2 corrections from the student?');
      expect(api.bulkCalls.length).toBe(0);
      await confirm();
      expect(api.bulkCalls).toEqual([jasmine.objectContaining({ action: 'hide', ids: ['ai_1', 'ai_2'], revision: 3, sourceHash: 'hash-3' })]);
      expect(api.bulkCalls[0].requestId).toMatch(/^[a-f0-9-]{36}$/i);
      expect(component.selectMode()).toBeFalse();
      expect(dom().querySelector('[data-bulk-undo]')?.textContent).toContain('2 corrections hidden from the student.');
      button('Undo', dom().querySelector('[data-bulk-undo]')!)!.click(); await settle();
      expect(api.bulkCalls[1]).toEqual(jasmine.objectContaining({ action: 'restore', ids: ['ai_1', 'ai_2'] }));
      expect(dom().querySelector('[data-bulk-undo]')).toBeNull();
    });
    it('hide all of one category and restore all hidden; Cancel sends nothing', async () => {
      await create(); api.current = three(); await openEditor();
      expect(button('Hide all Grammar')!.textContent).toContain('(1)');
      expect(button('Hide all Mechanics')!.textContent).toContain('(1)');
      expect(button('Restore all hidden')!.textContent).toContain('(1)');
      button('Hide all Grammar')!.click(); await settle();
      button('Cancel', dom().querySelector('[data-confirm-dialog]')!)!.click(); await settle();
      expect(dialogOpen()).toBeFalse(); expect(api.bulkCalls.length).toBe(0);
      button('Hide all Grammar')!.click(); await settle(); await confirm();
      expect(api.bulkCalls[0]).toEqual(jasmine.objectContaining({ action: 'hide', category: 'GRAMMAR' }));
      expect('ids' in api.bulkCalls[0]).toBeFalse();
      button('Restore all hidden')!.click(); await settle();
      expect(text()).toContain('Removed corrections stay removed.');
      await confirm();
      expect(api.bulkCalls[1]).toEqual(jasmine.objectContaining({ action: 'restore', all: true }));
    });
    it('Undo is offered for a few seconds only', async () => {
      await create(); api.current = three(); await openEditor();
      let expire: (() => void) | null = null;
      const real = window.setTimeout.bind(window);
      spyOn(window, 'setTimeout').and.callFake(((fn: () => void, ms?: number, ...rest: unknown[]) => {
        if (ms === UNDO_MS) { expire = fn; return 0; }
        return real(fn, ms, ...rest);
      }) as typeof window.setTimeout);
      button('Hide all Grammar')!.click(); await settle(); await confirm();
      expect(component.undo()).not.toBeNull();
      expect(expire).not.toBeNull();
      expire!(); await settle();
      expect(component.undo()).toBeNull();
      expect(dom().querySelector('[data-bulk-undo]')).toBeNull();
    });
    it('a rejected bulk request shows why, reloads, and offers no Undo', async () => {
      await create(); api.current = three(); await openEditor();
      api.bulkRespond = async () => { throw httpError(400, 'ANNOTATION_UNKNOWN_IDS'); };
      const loads = api.snapshotCalls;
      button('Hide all Grammar')!.click(); await settle(); await confirm();
      expect(text()).toContain('Some of the selected corrections are no longer in this submission. Nothing was changed.');
      expect(api.snapshotCalls).toBe(loads + 1);
      expect(component.undo()).toBeNull();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('workspace action presentation', () => {
    it('projects one original Add correction trigger to the workspace toolbar, with no Transcript-header trigger', async () => {
      await create(); await component.toggle(); await settle();
      const original = spyOn(component, 'openForm').and.callThrough();
      const header = dom().querySelector('.workspace__toolbar-actions')!;
      expect(button('Add correction', dom().querySelector('.workspace__transcript-header')!)).toBeUndefined();
      expect([...dom().querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Add correction').length).toBe(1);
      expect(button('Add correction', dom().querySelector('.editor__toolbar')!)).toBeUndefined();
      button('Add correction', header)!.click(); await settle();
      expect(original).toHaveBeenCalledOnceWith(null, jasmine.any(MouseEvent));
      setSelection(3, 5); await settle();
      expect(component.form()?.value).toEqual(jasmine.objectContaining({ fileId: 'f1', page: 1, startChar: 2, endChar: 6, quotedText: 'goes' }));
      expect(dom().querySelector('[data-selected-quote]')?.textContent).toBe('goes');
    });
    it('uses labelled, titled icons with unchanged permissions and a 44px target', async () => {
      await create(); await openEditor();
      const icons = [['Edit', 'bx-pencil'], ['Hide', 'bx-hide'], ['Remove', 'bx-trash']];
      for (const [label, icon] of icons) {
        const action = button(label, row())!;
        expect(action.getAttribute('aria-label')).toBe(label + ' correction AGR');
        expect(action.title).toBe(label + ' correction');
        expect(action.querySelector('i')?.classList).toContain(icon);
        expect(action.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
        expect(action.textContent?.trim()).toBe('');
        expect(action.getBoundingClientRect().width).toBe(44);
        expect(action.getBoundingClientRect().height).toBe(44);
      }
      button('Edit', row())!.click(); await settle();
      expect(component.form()?.mode).toBe('edit');
      component.cancelForm(); await settle();
      api.current = snapshot({ corrections: [correction({ moderationStatus: 'hidden' })] }); await component.reload(); await settle();
      expect(button('Restore', row())!.querySelector('i')?.classList).toContain('bx-show');
      expect(button('Hide', row())).toBeUndefined();
    });
    it('preserves a manual draft and its canonical offsets while changing source images', async () => {
      await create();
      const first = snapshot().pages[0];
      api.current = snapshot({ pages: [first, { ...first, fileId: 'f2', startChar: TEXT.length, endChar: TEXT.length * 2 }] });
      fixture.componentRef.setInput('imageUrl', 'blob:f1'); fixture.componentRef.setInput('activeFileId', 'f1'); fixture.componentRef.setInput('fileIds', ['f1', 'f2']);
      component.fileRequested.subscribe(fileId => { fixture.componentRef.setInput('activeFileId', fileId); fixture.componentRef.setInput('imageUrl', 'blob:' + fileId); });
      await component.toggle(); await settle();
      button('Add correction')!.click(); await settle(); setSelection(3, 5); fill('annotation-message', 'Draft explanation'); await settle();
      const draft = component.form(), value = { ...draft!.value }, snapshots = api.snapshotCalls;
      dom().querySelector<HTMLButtonElement>('[data-image-index="1"]')!.click(); await settle();
      expect(component.form()).toBe(draft); expect(component.form()?.value).toEqual(value);
      expect(registry.has('teacher-annotation-editor')).toBeTrue();
      expect(api.snapshotCalls).toBe(snapshots); expect(api.calls).toEqual([]);
      expect(dom().querySelector('[data-source-text]')).toBeNull();
      expect(dom().querySelector('[data-selected-quote]')?.textContent).toBe(value.quotedText);
    });
  });

  describe('manual correction selection and side editor', () => {
    it('waits for a verified span, then opens the panel and temporarily collapses the desktop sidebar', async () => {
      await create({ desktop: true }); await component.toggle(); await settle();
      const sidebar = TestBed.inject(DashboardSidebarState), workspace = fixture.debugElement.query(By.directive(ReviewWorkspace)).componentInstance;
      const original = dom().querySelector('[data-sync-transcript]'), list = dom().querySelector('ul.rows');
      expect(sidebar.collapsed()).toBeFalse();
      workspace.onPointer({ ids: ['ai_1'], kind: 'activate' }, 'transcript'); await settle();
      expect(component.form()).toBeNull(); expect(dom().querySelector('.workspace__editor')).toBeNull();
      button('Add correction')!.click(); await settle();
      expect(sidebar.collapsed()).toBeFalse(); expect(component.manualSelection()).toBeTrue();
      expect(dom().querySelector('ul.rows')).toBe(list);
      expect(dom().querySelector('.workspace__editor, [data-source-text], [data-edit-fields]')).toBeNull();
      expect(document.activeElement?.hasAttribute('data-source-content')).toBeTrue();
      const source = dom().querySelector<HTMLElement>('[data-source-content]')!;
      expect(source.getAttribute('aria-readonly')).toBe('true');
      const before = source.textContent;
      for (const type of ['beforeinput', 'paste', 'cut', 'drop']) expect(source.dispatchEvent(new Event(type, { cancelable: true, bubbles: true }))).toBeFalse();
      expect(source.textContent).toBe(before);
      setSelection(3, 8); await settle();
      expect(component.form()?.value).toEqual(jasmine.objectContaining({ startChar: 2, endChar: 9, quotedText: 'goes to' }));
      expect(sidebar.collapsed()).toBeTrue();
      expect(dom().querySelector('[data-sync-transcript]')).toBe(original); expect(dom().querySelector('ul.rows')).toBeNull();
      expect(dom().querySelectorAll('.is-manual-selected').length).toBe(2);
      expect(document.activeElement?.hasAttribute('data-form-heading')).toBeTrue();
      dom().querySelector<HTMLButtonElement>('[aria-label="Close Add correction"]')!.click(); await settle();
      expect(component.form()).toBeNull(); expect(sidebar.collapsed()).toBeFalse();
      expect(dom().querySelectorAll('.workspace__corrections-panel ul.rows').length).toBe(1);
      expect(dom().querySelector('.workspace__editor, .is-manual-selected')).toBeNull(); expect(api.calls).toEqual([]);
      expect(document.activeElement?.textContent?.trim()).toBe('Add correction');
    });
    for (const desktop of [true, false]) {
      it('preserves manual sidebar preference and mobile navigation with desktop=' + desktop, async () => {
        await create({ desktop }); await component.toggle(); await settle();
        const sidebar = TestBed.inject(DashboardSidebarState);
        sidebar.toggle(); expect(sidebar.collapsed()).toBeTrue();
        button('Add correction')!.click(); await settle(); setSelection(2, 6); await settle();
        expect(sidebar.collapsed()).toBeTrue(); component.cancelForm(); await settle(); expect(sidebar.collapsed()).toBeTrue();
        sidebar.toggle(); expect(sidebar.collapsed()).toBeFalse();
        button('Add correction')!.click(); await settle(); setSelection(2, 6); await settle();
        expect(sidebar.collapsed()).toBe(desktop);
        if (desktop) { sidebar.toggle(); expect(sidebar.collapsed()).toBeFalse(); }
        component.patch({ message: 'Typing does not undo a manual sidebar toggle.' }); await settle();
        expect(sidebar.collapsed()).toBeFalse(); component.cancelForm(); await settle(); expect(sidebar.collapsed()).toBeFalse();
      });
    }
    it('accepts native browser caret extension from the original read-only transcript', async () => {
      await create(); await component.toggle(); await settle(); button('Add correction')!.click(); await settle();
      const source = dom().querySelector<HTMLElement>('[data-source-content]')!, word = source.querySelector<HTMLElement>('[data-word-id="w1"]')!;
      source.focus(); const selection = document.getSelection()!;
      selection.collapse(word.firstChild, (word.textContent ?? '').indexOf('goes') + 1);
      (selection as Selection & { modify: (alter: string, direction: string, unit: string) => void }).modify('extend', 'forward', 'word');
      source.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true })); await settle();
      expect(component.form()?.value.quotedText).toBe('goes'); expect(dom().querySelector('.workspace__editor')).not.toBeNull();
      expect(document.activeElement).toBe(source);
      (selection as Selection & { modify: (alter: string, direction: string, unit: string) => void }).modify('extend', 'forward', 'word');
      source.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true })); await settle();
      expect(component.form()?.value.quotedText).toBe('goes to'); expect(document.activeElement).toBe(source);
      source.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true })); await settle();
      expect(document.activeElement?.hasAttribute('data-form-heading')).toBeTrue();
    });
    it('rejects stale source identities, invalid and cross-page ranges without opening an editor', async () => {
      await create(); await component.toggle(); await settle(); button('Add correction')!.click(); await settle();
      component.useTranscriptSelection({ fileId: 'f1', page: 1, sourceHash: 'stale', start: 2, end: 6, quotedText: 'goes' }); await settle();
      expect(component.manualPanelOpen()).toBeFalse(); expect(component.form()?.value.quotedText).toBe('');
      component.useTranscriptSelection({ fileId: 'f2', page: 1, sourceHash: 'hash-3', start: 2, end: 6, quotedText: 'goes' }); await settle();
      expect(component.manualPanelOpen()).toBeFalse(); expect(api.calls).toEqual([]);
      component.useTranscriptSelection(null); await settle();
      expect(component.error()).toContain('within one transcript page');
    });
    for (const pdf of [false, true]) {
      it('selects canonical text on the second/third source and saves once with PDF=' + pdf, async () => {
        await create({ desktop: true });
        const pages = [0, 1, 2].map(i => ({ ...snapshot().pages[0], fileId: pdf ? 'pdf' : 'f' + (i + 1), pageNumber: pdf ? i + 1 : 1, startChar: i * TEXT.length, endChar: (i + 1) * TEXT.length }));
        api.current = snapshot({ pages }); fixture.componentRef.setInput('isPdf', pdf); fixture.componentRef.setInput('fileIds', [...new Set(pages.map(page => page.fileId))]);
        fixture.componentRef.setInput('activeFileId', pages[2].fileId);
        await component.toggle(); await settle();
        const workspace = fixture.debugElement.query(By.directive(ReviewWorkspace)).componentInstance as ReviewWorkspace;
        if (pdf) workspace.goTo(2);
        await settle(); button('Add correction')!.click(); await settle(); setSelection(2, 6, 2); await settle();
        expect(component.form()?.value).toEqual(jasmine.objectContaining({ fileId: pages[2].fileId, page: pages[2].pageNumber, startChar: 2 * TEXT.length + 2, endChar: 2 * TEXT.length + 6, quotedText: 'goes' }));
        component.chooseSymbol('ART'); component.patch({ message: 'Note', suggestedText: 'go' }); await settle();
        let complete: (value: { revision: number }) => void = () => undefined;
        api.respond = () => new Promise(resolve => { complete = resolve; });
        component.saveForm(); component.saveForm(); await settle(); expect(api.calls.length).toBe(1);
        expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'add', revision: 3, sourceHash: 'hash-3', value: component.form()!.value }));
        const saved = { ...component.form()!.value };
        api.current = snapshot({ pages, revision: 4, corrections: [correction({}), correction({ ...saved, id: 'manual-new', source: 'Teacher' })] });
        complete({ revision: 4 }); await settle();
        expect(component.form()).toBeNull(); expect(dom().querySelector('.workspace__editor')).toBeNull();
        expect(row('manual-new').textContent).toContain('Note'); expect(TestBed.inject(DashboardSidebarState).collapsed()).toBeFalse();
        expect(registry.has('teacher-annotation-editor')).toBeFalse();
        if (pdf) workspace.goTo(1); else fixture.componentRef.setInput('activeFileId', pages[1].fileId);
        await settle(); button('Add correction')!.click(); await settle(); setSelection(2, 6, 1); await settle();
        expect(component.form()?.value.fileId).toBe(pages[1].fileId); expect(component.form()?.value.page).toBe(pages[1].pageNumber);
        component.cancelForm(); await settle(); expect(api.calls.length).toBe(1);
      });
    }
    it('keeps the side editor, selected source, fields and retry identity after an unconfirmed save', async () => {
      await create({ desktop: true }); await component.toggle(); await settle(); button('Add correction')!.click(); await settle(); setSelection(2, 6); await settle();
      component.chooseSymbol('ART'); component.patch({ message: 'Keep explanation', suggestedText: 'go' }); api.respond = async () => { throw httpError(0); };
      component.saveForm(); await settle();
      expect(dom().querySelector('.workspace__editor')).not.toBeNull(); expect(component.form()?.value.quotedText).toBe('goes');
      expect(dom().querySelector('ul.rows')).toBeNull();
      expect(dom().querySelector<HTMLTextAreaElement>('#annotation-message')?.value).toBe('Keep explanation');
      expect(component.error()).toContain('could not confirm'); expect(registry.hasWork()).toBeTrue();
      const pending = api.calls[0]; api.respond = async () => ({ revision: 4, replay: true }); component.retry(); await settle();
      expect(api.calls[1]).toEqual(pending); expect(component.form()).toBeNull();
      expect(dom().querySelector('.workspace__corrections-panel ul.rows')).not.toBeNull();
    });
  });

  describe('shared Add/Edit review presentation', () => {
    const side = () => dom().querySelector<HTMLElement>('.workspace__editor')!;
    it('contains hidden live regions inside the review card without creating an outer blank scroll area', async () => {
      await create(); await component.toggle(); await settle();
      for (const width of [1440, 1280, 1024, 768, 375, 320]) {
        const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:760px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!;
          for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
          doc.body.style.cssText = 'margin:0;display:flex;flex-direction:column;height:760px';
          const header = doc.createElement('header'); header.style.cssText = 'height:73px;flex-shrink:0'; doc.body.appendChild(header);
          const main = doc.createElement('main'); main.style.cssText = 'flex:1;overflow:auto;min-height:0'; doc.body.appendChild(main);
          const top = doc.createElement('div'); top.style.height = '600px'; main.appendChild(top); main.appendChild(dom().cloneNode(true));
          const bottom = doc.createElement('div'); bottom.style.height = '1100px'; main.appendChild(bottom);
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          expect(doc.documentElement.scrollHeight).withContext('outer document at ' + width).toBeLessThanOrEqual(760);
          expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
          const editor = doc.querySelector('.editor');
          for (const live of Array.from(doc.querySelectorAll<HTMLElement>('.editor > .sr-only, .workspace > .sr-only'))) expect(live.offsetParent).toBe(editor);
          main.scrollTop = main.scrollHeight;
          expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(760);
          expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        } finally { frame.remove(); }
      }
    });
    it('keeps a multiline Unicode source unchanged while short selected phrases flow on one line', async () => {
      await create();
      const quote = "husband's\ndeath,", canonical = 'After ' + quote + ' café was quiet.';
      const page = { fileId: 'f1', pageNumber: 1, startChar: 40, endChar: 40 + canonical.length, text: canonical, words: [...canonical.matchAll(/\S+/g)].map((m, i) => ({ id: 'q' + i, text: m[0] })) };
      api.current = snapshot({ pages: [page], corrections: [correction({ startChar: 46, endChar: 46 + quote.length, quotedText: quote })] });
      await component.toggle(); await settle(); button('Edit', row())!.click(); await settle();
      const value = { ...component.form()!.value }, before = JSON.stringify(api.current.pages);
      expect(side().querySelector('[data-selected-quote]')?.textContent).toBe(quote);
      for (const width of [1440, 1280, 1024, 768, 375, 320]) {
        const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!, win = frame.contentWindow!;
          for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
          doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true)); doc.documentElement.setAttribute('data-four-review-qa', 'edit-short');
          const selected = doc.querySelector<HTMLElement>('.manual-editor [data-selected-quote]')!;
          expect(win.getComputedStyle(selected).whiteSpace).toBe('normal');
          const range = doc.createRange(); range.selectNodeContents(selected);
          expect(new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top))).size).toBe(1);
          expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
          expect(doc.querySelector('.row [data-edit-fields]')).toBeNull();
          for (const selector of ['[data-sync-image]', '[data-sync-transcript]', '.rows--panel', '.workspace__column-body', '.workspace__editor']) {
            const el = doc.querySelector(selector); if (el) expect(win.getComputedStyle(el).overscrollBehaviorY).toBe('auto');
          }
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        } finally { frame.remove(); }
      }
      component.patch({ message: 'Keep café and punctuation.' }); component.saveForm(); await settle();
      expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'edit', id: 'ai_1', sourceHash: 'hash-3', value: { ...value, message: 'Keep café and punctuation.' } }));
      expect(JSON.stringify(api.current.pages)).toBe(before);
    });
    for (const pdf of [false, true]) {
      it('edits the original hidden/manual correction on another source and retains draft, retry and sidebar state with PDF=' + pdf, async () => {
        await create({ desktop: true });
        const first = snapshot().pages[0], second = { ...first, fileId: pdf ? 'f1' : 'f2', pageNumber: pdf ? 2 : 1, startChar: 100, endChar: 100 + TEXT.length };
        api.current = snapshot({ pages: [first, second], corrections: [correction({}), correction({ id: 'manual-2', source: 'Teacher', moderationStatus: 'hidden', fileId: second.fileId, page: second.pageNumber, startChar: 102, endChar: 106 })] });
        fixture.componentRef.setInput('isPdf', pdf); fixture.componentRef.setInput('fileIds', ['f1', 'f2']); fixture.componentRef.setInput('activeFileId', 'f1');
        component.fileRequested.subscribe(id => fixture.componentRef.setInput('activeFileId', id));
        await component.toggle(); await settle(); button('Edit', row('manual-2'))!.click(); await settle();
        const sidebar = TestBed.inject(DashboardSidebarState);
        expect(sidebar.collapsed()).toBeTrue(); expect(side().textContent).toContain('Edit correction');
        expect(dom().querySelector('[data-source-content]')?.getAttribute('data-page')).toBe(String(second.pageNumber));
        expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe(second.fileId);
        expect(component.selection.pinnedId()).toBe('manual-2'); expect(component.manualSelection()).toBeFalse();
        component.patch({ message: 'Do not discard.', suggestedText: 'go' }); await settle();
        const draft = component.form(); button('Add correction')!.click();
        expect(row()).toBeNull();
        component.openForm(component.rows().find(row => row.key === 'ai_1')!, new Event('click'), 'row'); await settle();
        expect(component.form()).toBe(draft);
        component.selection.pin('ai_1', 'list'); await settle();
        expect(component.form()).toBe(draft); expect(registry.hasWork()).toBeTrue();
        api.respond = async () => { throw httpError(0); }; component.saveForm(); component.saveForm(); await settle();
        expect(api.calls.length).toBe(1); expect(component.form()).toBe(draft);
        expect(side().querySelector<HTMLTextAreaElement>('#annotation-message')?.value).toBe('Do not discard.');
        const request = api.calls[0];
        expect(request).toEqual(jasmine.objectContaining({ action: 'edit', id: 'manual-2', revision: 3, value: jasmine.objectContaining({ fileId: second.fileId, page: second.pageNumber, startChar: 102, endChar: 106 }) }));
        api.respond = async () => ({ revision: 4, replay: true }); component.retry(); await settle();
        expect(api.calls[1]).toEqual(request); expect(side()).toBeNull(); expect(sidebar.collapsed()).toBeFalse();
      });
    }
    it('keeps Add drafts and closed-review drafts until explicitly saved or cancelled', async () => {
      await create({ desktop: true }); await component.toggle(); await settle(); button('Add correction')!.click(); await settle();
      setSelection(2, 6); component.patch({ message: 'Add draft' }); await settle();
      const draft = component.form(); expect(row()).toBeNull();
      component.openForm(component.rows()[0], new Event('click'), 'row'); await settle(); expect(component.form()).toBe(draft);
      await component.toggle(); await settle(); expect(registry.hasWork()).toBeTrue(); expect(component.form()).toBe(draft);
      await component.toggle(); await settle(); expect(side().querySelector<HTMLTextAreaElement>('#annotation-message')?.value).toBe('Add draft');
      component.cancelForm(); await settle(); expect(api.calls).toEqual([]); expect(registry.hasWork()).toBeFalse();
    });
    it('replaces an edit span through the existing original-transcript adapter and updates the same correction', async () => {
      await create(); await component.toggle(); await settle(); button('Edit', row())!.click(); await settle();
      const initial = component.form()!.initial;
      component.patch({ message: 'My existing edit.' }); component.changeWords(); await settle(); setSelection(10, 18); await settle();
      expect(component.form()?.initial).toBe(initial); expect(component.form()?.mode).toBe('edit'); expect(component.form()?.targetId).toBe('ai_1');
      expect(component.form()?.value.quotedText).toBe('the park'); expect(dom().querySelectorAll('[data-edit-fields]').length).toBe(1);
      component.saveForm(); await settle();
      expect(api.calls[0]).toEqual(jasmine.objectContaining({ action: 'edit', id: 'ai_1', value: jasmine.objectContaining({ quotedText: 'the park', startChar: 10, endChar: 18, message: 'My existing edit.' }) }));
    });
  });

  describe('aligned page-specific review', () => {
    it('retains the failed save source and exact retry body after navigating to another page', async () => {
      await create(); const first = snapshot().pages[0], text = 'We goes home.';
      const second = { fileId: 'f2', pageNumber: 1, startChar: 100, endChar: 100 + text.length, text, words: text.split(' ').map((text, index) => ({ id: 's' + index, text })) };
      api.current = snapshot({ pages: [first, second] });
      fixture.componentRef.setInput('fileIds', ['f1', 'f2']); fixture.componentRef.setInput('activeFileId', 'f2'); fixture.componentRef.setInput('imageUrl', 'blob:f2');
      component.fileRequested.subscribe(fileId => { fixture.componentRef.setInput('activeFileId', fileId); fixture.componentRef.setInput('imageUrl', 'blob:' + fileId); });
      await component.toggle(); await settle(); button('Add correction')!.click(); await settle(); setSelection(3, 7, 1); await settle();
      component.chooseSymbol('ART'); component.patch({ message: 'Keep the original page.', suggestedText: 'go' });
      api.respond = async () => { throw httpError(0); }; component.saveForm(); await settle();
      const pending = api.calls[0], value = { ...component.form()!.value };
      dom().querySelector<HTMLButtonElement>('[data-image-index="0"]')!.click(); await settle();
      expect(component.form()?.value).toEqual(value); expect(component.form()?.value.startChar).toBe(103);
      expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('f1');
      expect(dom().querySelector('.is-manual-selected')).toBeNull(); expect(registry.hasWork()).toBeTrue();
      api.respond = async () => ({ revision: 4, replay: true }); component.retry(); await settle();
      expect(api.calls[1]).toEqual(pending); expect(api.calls[1].value?.fileId).toBe('f2'); expect(component.form()).toBeNull();
    });
    it('keeps distinct page transcripts, aligned boundaries and canonical manual drafts through navigation and Save/Cancel', async () => {
      await create({ desktop: true });
      const texts = ['Yesterday, I walk to the market.\n\nI bought fresh fruit.', 'My sister has two bright ideas.\n\nWe try them together.', 'Tomorrow, our class will visit the river.\n\nWe will write about it.'];
      let offset = 0;
      const pages = texts.map((text, index) => {
        let previousEnd = 0;
        const words = [...text.matchAll(/\S+/g)].map((match, wordIndex) => {
          const gap = text.slice(previousEnd, match.index); previousEnd = match.index + match[0].length;
          return { id: 'p' + index + '-w' + wordIndex, text: match[0], separatorBefore: gap.includes('\n\n') ? '\n\n' : wordIndex ? ' ' : '',
            bbox: { x: 3 + wordIndex % 6 * 14, y: 10 + Math.floor(wordIndex / 6) * 9, w: 10, h: 5 } };
        });
        const page = { fileId: 'f' + (index + 1), pageNumber: 1, startChar: offset, endChar: offset + text.length, text, words };
        offset += text.length + 2; return page;
      });
      const corrections = pages.map((page, index) => {
        const span = wordSpans(page.text, page.words)[2];
        return correction({ id: 'page-mark-' + index, fileId: page.fileId, wordIds: [page.words[2].id], startChar: page.startChar + span.start, endChar: page.startChar + span.end,
          quotedText: page.text.slice(span.start, span.end) });
      });
      const effective = corrections.map((item, index) => ({ ...item, renderTarget: { version: 1, source: 'wordIds', wordIds: item.wordIds, boxes: [pages[index].words[2].bbox] } }));
      api.current = snapshot({ pages, corrections, effective });
      const originalPages = JSON.stringify(pages), initial = api.current;
      const image = (index: number) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + (600 + index * 90) + '" height="' + (800 - index * 100) + '"><rect width="100%" height="100%" fill="#fff"/><text x="25" y="60" font-size="23">' + texts[index].split('\n')[0] + '</text></svg>');
      fixture.componentRef.setInput('fileIds', pages.map(page => page.fileId)); fixture.componentRef.setInput('activeFileId', 'f1'); fixture.componentRef.setInput('imageUrl', image(0));
      component.fileRequested.subscribe(fileId => { fixture.componentRef.setInput('activeFileId', fileId); fixture.componentRef.setInput('imageUrl', image(pages.findIndex(page => page.fileId === fileId))); });
      await component.toggle(); await settle();
      const workspace = fixture.debugElement.query(By.directive(ReviewWorkspace)).componentInstance as ReviewWorkspace;
      const capture = async (state: string, widths = [1440]) => {
        const loadedImage = dom().querySelector<HTMLImageElement>('app-correction-overlay img');
        if (loadedImage && !loadedImage.complete) await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 1500);
          const done = () => { clearTimeout(timer); resolve(); };
          loadedImage.addEventListener('load', done, { once: true }); loadedImage.addEventListener('error', done, { once: true });
        });
        await settle();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await settle();
        expect(fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance.mediaState).toBe('loaded');
        for (const width of widths) {
          const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:1000px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
          try {
            const doc = frame.contentDocument!, win = frame.contentWindow!;
            for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
            doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true)); doc.documentElement.setAttribute('data-page-review-qa', state);
            expect(doc.documentElement.scrollWidth).withContext(state + ' at ' + width).toBeLessThanOrEqual(width);
            const transcript = doc.querySelector('[data-sync-transcript]')!;
            expect(transcript.querySelectorAll('[data-source-content]').length).toBe(1);
            expect(transcript.querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe(workspace.view()?.fileId ?? '');
            expect(doc.querySelectorAll('[data-row-key]').length).toBe(component.sideEditorOpen() ? 0 : component.rows().length);
            expect(doc.querySelector('#annotation-text-panel ul.rows')).toBeNull();
            if (width >= 1024) {
              const panels = Array.from(doc.querySelectorAll<HTMLElement>('.workspace__column, .workspace__corrections-panel')).filter(panel => win.getComputedStyle(panel).display !== 'none');
              const boxes = panels.map(panel => panel.getBoundingClientRect());
              for (const box of boxes) { expect(Math.abs(box.top - boxes[0].top)).toBeLessThan(1); expect(Math.abs(box.bottom - boxes[0].bottom)).toBeLessThan(1); }
              for (let index = 1; index < boxes.length; index++) expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right);
              expect(boxes[0].height).toBeLessThanOrEqual(win.innerHeight - 180 + 1);
              const imageBody = doc.querySelector('.workspace__image-body')!.getBoundingClientRect(), transcriptBody = doc.querySelector('.workspace__column-body')!.getBoundingClientRect();
              expect(Math.abs(imageBody.top - transcriptBody.top)).toBeLessThan(1);
              expect(boxes.length).toBe(3);
            }
            for (const field of Array.from(doc.querySelectorAll<HTMLElement>('.workspace__editor input, .workspace__editor textarea, .workspace__editor select'))) {
              expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(doc.querySelector('.workspace__editor')!.getBoundingClientRect().right - 8);
            }
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          } finally { frame.remove(); }
        }
      };
      for (const index of [0, 1, 2]) {
        workspace.goTo(index); await settle();
        expect(dom().querySelector('[data-sync-transcript]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(texts[index].replace(/\s+/g, ' '));
        await capture('normal-p' + (index + 1), index === 1 ? [1440, 1280, 1024, 768, 375, 320] : [1440]);
      }
      for (const index of [0, 1]) {
        workspace.goTo(index); await settle(); button('Add correction')!.click(); await settle();
        const span = wordSpans(pages[index].text, pages[index].words)[2]; setSelection(span.start + 1, span.end, index); await settle();
        expect(component.form()?.value.fileId).toBe(pages[index].fileId);
        expect(component.form()?.value.startChar).toBe(pages[index].startChar + span.start);
        expect(dom().querySelector('[data-selected-quote]')?.textContent).toBe(pages[index].text.slice(span.start, span.end));
        await capture('editor-p' + (index + 1), index === 1 ? [1440, 1280, 1024, 768, 375, 320] : [1440]);
        if (index === 1) { setSelection(0, pages[index].text.length, index); await settle(); await capture('add-long', [1440, 1280, 1024, 768, 375, 320]); }
        component.cancelForm(); await settle();
      }
      button('Edit', row('page-mark-1'))!.click(); await settle();
      await capture('edit-existing-p2', [1440, 1280, 1024, 768, 375, 320]);
      component.cancelForm(); await settle();
      await capture('cancel-p2');
      button('Add correction')!.click(); await settle(); const span = wordSpans(pages[1].text, pages[1].words)[2]; setSelection(span.start, span.end, 1); await settle();
      component.chooseSymbol('ART'); component.patch({ message: 'Keep this page-specific note.', suggestedText: 'has' });
      const draft = { ...component.form()!.value };
      workspace.goTo(2); await settle();
      expect(component.form()?.value).toEqual(draft); expect(dom().querySelector('.is-manual-selected')).toBeNull();
      expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('f3');
      api.respond = async () => { api.current = { ...initial, revision: 4, corrections: [...corrections, correction({ ...draft, id: 'manual-page-2', source: 'Teacher' })] }; return { revision: 4 }; };
      component.saveForm(); component.saveForm(); await settle();
      expect(api.calls.length).toBe(1); expect(api.calls[0].value).toEqual(draft);
      expect(component.form()).toBeNull(); expect(row('manual-page-2').textContent).toContain('page-specific note');
      workspace.goTo(1); await settle(); await capture('saved-p2');
      expect(JSON.stringify(api.current.pages)).toBe(originalPages); expect(api.snapshotCalls).toBe(2);
    });
  });

  describe('Phase A polish: panel', () => {
    it('bulk actions sit in one labelled toolbar, categories as compact chips; no global page buttons in the editor', async () => {
      await create(); await openEditor();
      const bulk = dom().querySelector('[data-bulk]')!;
      expect(bulk.getAttribute('role')).toBe('group');
      expect(bulk.querySelector('[data-bulk-category="GRAMMAR"]')!.className).toContain('ui-chip');
      expect(bulk.querySelector('[data-bulk-select-mode]')!.className).toContain('ui-btn--secondary');
      expect(dom().querySelector('.btn-info, .btn-danger, .btn-primary, .btn-warning')).toBeNull();
      expect(button('Remove', row())!.className).toContain('ui-btn--danger');
      expect(button('Add correction')!.className).toContain('ui-btn--primary');
    });
  });

  describe('correction edit in the shared side panel', () => {
    beforeEach(async () => { await create(); await openEditor(); });
    const key = (target: Element, k: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    const field = (id: string) => dom().querySelector<HTMLElement>(`#${id}`)!;

    it('Edit opens the shared side form, pre-filled; Enter in the suggestion saves through the existing single action', async () => {
      button('Edit', row())!.click(); await settle();
      expect(row()).toBeNull();
      expect(dom().querySelector('.workspace__editor [data-form-heading]')?.textContent).toContain('Edit correction');
      expect(dom().querySelector('.workspace__editor [data-selected-quote]')?.textContent).toBe('goes');
      expect((field('annotation-message') as HTMLTextAreaElement).value).toBe('Use go.');
      expect((field('annotation-suggestion') as HTMLInputElement).value).toBe('go');
      expect((field('annotation-symbol') as HTMLSelectElement).value).toBe('AGR');
      fill('annotation-message', 'Use the base form.'); await settle();
      expect(registry.hasWork()).toBeTrue();
      key(field('annotation-suggestion'), 'Enter'); await settle();
      expect(api.calls).toEqual([jasmine.objectContaining({ action: 'edit', id: 'ai_1', revision: 3, sourceHash: 'hash-3',
        value: jasmine.objectContaining({ message: 'Use the base form.', suggestedText: 'go', quotedText: 'goes', startChar: 2, endChar: 6, symbol: 'AGR' }) })]);
      expect(api.calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/i);
      expect(component.form()).toBeNull();
      expect(registry.hasWork()).toBeFalse();
      expect(text()).toContain('Your edit is saved.');
    });
    it('Escape cancels and focus goes back to the row\'s Edit button; nothing is sent', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Changed'); await settle();
      key(field('annotation-message'), 'Escape'); await settle();
      expect(component.form()).toBeNull();
      expect(api.calls).toEqual([]);
      expect(document.activeElement).toBe(row().querySelector('[data-row-edit]'));
    });
    it('a field error is shown next to the field, nothing is sent, focus goes to the field', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', '   '); await settle();
      dom().querySelector<HTMLButtonElement>('.workspace__editor [data-edit-save]')!.click(); await settle();
      expect(api.calls).toEqual([]);
      expect(dom().querySelector('.workspace__editor')?.textContent).toContain('Explanation is required');
      expect(field('annotation-message').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(field('annotation-message'));
    });
    it('while saving the button says so; a 409 shows the existing reload message in the row and keeps the text', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Mine'); await settle();
      let fail: (e: unknown) => void = () => undefined;
      api.respond = () => new Promise((_, reject) => { fail = reject; });
      dom().querySelector<HTMLButtonElement>('.workspace__editor [data-edit-save]')!.click(); await fixture.whenStable(); fixture.detectChanges();
      expect(dom().querySelector('.workspace__editor [data-edit-save]')!.textContent).toContain('Saving…');
      expect(dom().querySelector('.workspace__editor [data-edit-fields]')!.getAttribute('aria-busy')).toBe('true');
      api.current = snapshot({ revision: 9, corrections: [correction({ message: 'From the other tab' })] });
      fail(httpError(409, 'ANNOTATION_REVISION_CONFLICT')); await settle();
      expect(dom().querySelector('.workspace__editor [role="alert"]')!.textContent).toContain('Your change was not saved');
      expect(component.rows().find(row => row.key === 'ai_1')?.message).toBe('From the other tab');
      expect(row()).toBeNull();
      expect((field('annotation-message') as HTMLTextAreaElement).value).toBe('Mine');
    });
    it('"Change the words…" moves the same form, with what was typed, to the panel', async () => {
      button('Edit', row())!.click(); await settle();
      fill('annotation-message', 'Typed'); await settle();
      dom().querySelector<HTMLButtonElement>('.workspace__editor [data-edit-change-words]')!.click(); await settle();
      expect(component.form()!.placement).toBe('panel');
      expect(row()).toBeNull();
      expect(dom().querySelector('[data-form-heading]')).not.toBeNull();
      expect(dom().querySelector('[data-source-text]')).toBeNull();
      expect(dom().querySelector('[data-source-content][contenteditable]')).not.toBeNull();
      expect((field('annotation-message') as HTMLTextAreaElement).value).toBe('Typed');
    });
    it('a correction to place again still uses the panel (it needs word selection)', async () => {
      api.current = snapshot({ corrections: [], effective: [], orphans: [{ entryId: 'teacher_6', kind: 'manual', status: 'visible', reason: 'TEXT_NOT_FOUND', value: { fileId: 'f1', page: 1, quotedText: 'gone', message: 'note', suggestedText: 'x', symbol: 'ART', category: 'GRAMMAR' } }] });
      await component.reload(); await settle();
      button('Place again', row('orphan:teacher_6'))!.click(); await settle();
      expect(component.form()!.placement).toBe('panel');
    });
  });

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

    it('opening Review corrections enables the workspace with one list and form in the right column', async () => {
      await create(); api.current = two(); await component.toggle(); await settle();
      expect(component.workspaceOpen()).toBeTrue();
      expect(dom().querySelectorAll('ul.rows').length).toBe(1);
      expect(dom().querySelector('[aria-label="Transcript and annotations"] ul.rows')).toBeNull();
      expect(dom().querySelector('.workspace__corrections-panel ul.rows')).not.toBeNull();
      const view = fixture.debugElement.query(By.directive(ReviewWorkspace)).componentInstance as ReviewWorkspace;
      view.narrowTab.set('image'); view.layout.desktop.set('image');
      button('Add correction')!.click(); await settle();
      expect(view.narrowTab()).toBe('text');
      expect(view.layout.desktop()).toBe('split');
      expect(dom().querySelector('[aria-label="Transcript and annotations"] form')).toBeNull();
      expect(dom().querySelector('.workspace__editor')).toBeNull();
      setSelection(2, 6); await settle();
      expect(dom().querySelector('.workspace__editor form')).not.toBeNull();
      expect(dom().querySelector('ul.rows')).toBeNull();
    });
    it('keeps the toolbar, original transcript, list and separate editor usable at every requested width', async () => {
      await create({ desktop: true });
      fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="25" y="60" font-size="26">I goes to the park.</text></svg>'));
      api.current = two(); await component.toggle(); await settle();
      const render = async (state: string) => {
        for (const width of [1440, 1280, 1024, 768, 375, 320]) {
          const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;top:0;left:0;height:1000px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
          try {
            const doc = frame.contentDocument!, win = frame.contentWindow!;
            for (const style of Array.from(document.querySelectorAll('style'))) doc.head.appendChild(style.cloneNode(true));
            doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true)); doc.documentElement.setAttribute('data-manual-qa', state);
            expect(doc.documentElement.scrollWidth).withContext(state + ' at ' + width).toBeLessThanOrEqual(width);
            expect(doc.querySelectorAll('[data-sync-transcript]').length).toBe(1);
            expect(doc.querySelector('[data-source-text]')).toBeNull();
            expect(doc.querySelectorAll('ul.rows').length).toBe(state === 'editor' || state === 'edit' ? 0 : 1);
            expect(doc.querySelector('#annotation-text-panel ul.rows')).toBeNull();
            expect(doc.querySelectorAll('.workspace__corrections-panel').length).toBe(1);
            const panel = doc.querySelector<HTMLElement>('.workspace__editor');
            if (state === 'editor' || state === 'edit') {
              expect(panel).not.toBeNull();
              expect(doc.querySelector('[data-selected-quote]')?.textContent).toBe('goes');
              expect(doc.querySelectorAll('[data-edit-save]').length).toBe(1);
              expect(win.getComputedStyle(panel!).overflowY).toBe('auto');
              if (width >= 1024) expect(panel!.getBoundingClientRect().left).toBeGreaterThan(doc.querySelector('.workspace__column--right')!.getBoundingClientRect().left);
              for (const field of Array.from(panel!.querySelectorAll<HTMLElement>('input, textarea, select'))) {
                expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1);
                expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(panel!.getBoundingClientRect().right - 10);
              }
            } else expect(panel).toBeNull();
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          } finally { frame.remove(); }
        }
      };
      await render('normal');
      button('Add correction')!.click(); await settle(); await render('selecting');
      setSelection(3, 5); await settle(); await render('editor');
      expect(component.form()?.value).toEqual(jasmine.objectContaining({ startChar: 2, endChar: 6, quotedText: 'goes' }));
      component.cancelForm(); await settle(); await render('cancel');
      button('Edit', row())!.click(); await settle(); await render('edit');
      expect(component.form()?.targetId).toBe('ai_1');
      component.cancelForm(); await settle();
      expect(dom().querySelector('.workspace__corrections-panel ul.rows')).not.toBeNull();
    });
    it('keeps global rows, counts and filters in the right panel across page changes and edit cancellation', async () => {
      await create();
      const first = snapshot().pages[0], second = { ...first, fileId: 'f2', startChar: 100, endChar: 100 + TEXT.length };
      api.current = snapshot({ pages: [first, second], corrections: Array.from({ length: 7 }, (_, i) => correction({
        id: 'saved-' + i, moderationStatus: i < 2 ? 'hidden' : 'visible', fileId: i % 2 ? 'f2' : 'f1',
        startChar: i % 2 ? 102 : 2, endChar: i % 2 ? 106 : 6
      })) });
      fixture.componentRef.setInput('fileIds', ['f1', 'f2']); fixture.componentRef.setInput('activeFileId', 'f1');
      component.fileRequested.subscribe(id => fixture.componentRef.setInput('activeFileId', id));
      await component.toggle(); await settle();
      expect(dom().querySelectorAll('.workspace__corrections-panel [data-row-key]').length).toBe(7);
      expect(dom().querySelectorAll('ul.rows').length).toBe(1);
      expect(dom().querySelector('[data-counts]')?.textContent).toContain('of 7 corrections');
      button('Hidden (')!.click(); await settle();
      expect(component.filter()).toBe('hidden'); expect(dom().querySelectorAll('[data-row-key]').length).toBe(2);
      const countText = dom().querySelector('[data-counts]')?.textContent;
      button('Edit', row('saved-1'))!.click(); await settle();
      expect(component.form()?.targetId).toBe('saved-1'); expect(dom().querySelector('ul.rows')).toBeNull();
      expect(dom().querySelector('[data-source-content]')?.getAttribute('data-file-id')).toBe('f2');
      component.cancelForm(); await settle();
      expect(component.filter()).toBe('hidden'); expect(dom().querySelectorAll('[data-row-key]').length).toBe(2);
      expect(dom().querySelector('[data-counts]')?.textContent).toBe(countText);
      button('All (')!.click(); await settle();
      expect(dom().querySelectorAll('.workspace__corrections-panel [data-row-key]').length).toBe(7);
      expect(api.calls).toEqual([]); expect(api.snapshotCalls).toBe(1);
    });
    it('image activation selects the matching transcript and list; transcript activation selects the image input', async () => {
      await create(); fixture.componentRef.setInput('imageUrl', 'blob:already-loaded'); await open();
      toggle().click(); await settle();
      const image = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
      image.syncPointer.emit({ ids: ['ai_1'], kind: 'activate' }); await settle();
      expect(dom().querySelector('[data-sync-transcript] .is-sync-active')).not.toBeNull();
      expect(row('ai_1').classList.contains('row--active')).toBeTrue();
      const word = dom().querySelector<HTMLElement>('[data-sync-transcript] [data-word-id="w3"]')!;
      word.click(); await settle();
      expect(component.selection.source()).toBe('transcript');
      expect(image.syncActiveId).toBe('ai_2');
      expect(row('ai_2').classList.contains('row--active')).toBeTrue();
    });
    it('is closed until the teacher asks: nothing of it exists; a correction placed on its word has no position label', async () => {
      await create(); await open();
      expect(workspace()).toBeNull();
      expect(row().querySelector('[data-row-position]')).toBeNull();
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
      expect(labels('ai_3')).toEqual(['Not located on image', 'Not in the transcript']);
    });
    it('list: one click selects, says so in words, and announces it', async () => {
      await create(); await open();
      toggle().click(); await settle();
      row('ai_2').querySelector('blockquote')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle();
      expect(component.selection.pinnedId()).toBe('ai_2');
      expect(row('ai_2').querySelector('[data-row-selected]')?.textContent).toBe('Selected');
      expect(row('ai_2').getAttribute('aria-current')).toBe('true');
      expect(dom().querySelector('[data-sync-live]')?.textContent).toContain('hidden from the student. Approximate position.');
      expect(dom().querySelector('[data-sync-status], [data-sync-clear]')).toBeNull();
    });
    it('list: Edit explicitly selects its correction and opens the side panel without an inline form', async () => {
      await create(); await open();
      toggle().click(); await settle();
      const list = dom().querySelector('ul.rows') as HTMLElement;
      expect(list.classList.contains('rows--panel')).toBeTrue();
      button('Change history')!.click(); await settle();
      button('Edit', row('ai_1'))!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();
      expect(component.selection.pinnedId()).toBe('ai_1');
      expect(dom().querySelector('.workspace__editor [data-edit-fields]')).not.toBeNull();
      expect(row('ai_1')).toBeNull();
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
    it('Escape and clicking empty space clear it', async () => {
      await create(); await open();
      toggle().click(); await settle();
      component.selection.pin('ai_1', 'list'); await settle();
      dom().querySelector('#annotation-editor-body')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
      expect(component.selection.activeId()).toBeNull();
      component.selection.pin('ai_1', 'list'); await settle();
      dom().querySelector<HTMLElement>('.workspace')!.click(); await settle();
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
      expect(dom().querySelector('[data-sync-live]')?.textContent).toContain('Not located on image');
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
      button('Add correction')!.click(); await settle(); setSelection(2, 6); await settle();
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
      await component.openHistory(); await settle();
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
      await component.openHistory(); await settle();
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
      const labels = (key: string) => [...row(key).querySelectorAll('button')].map(b => (b.getAttribute('aria-label') ?? b.textContent)?.trim().split(/\s/)[0]);
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
      expect(component.form()!.placement).toBe('panel');
      expect(document.activeElement?.hasAttribute('data-form-heading')).toBeTrue();
      expect(row()).toBeNull();
      expect(dom().querySelector('.workspace__editor')?.contains(document.activeElement)).toBeTrue();
    });
    it('an invalid form makes no request and says what to fix', async () => {
      button('Add correction')!.click(); await settle();
      component.saveForm(); await settle();
      expect(api.calls).toEqual([]);
      expect(text()).toContain('Select words or a sentence');
      expect(component.formErrors().symbol).toBe('Choose a category and symbol from the legend.');
      expect(component.formErrors().message).toBe('Explanation is required.');
    });
    it('explanation and suggestion have the server caps', async () => {
      button('Add correction')!.click(); await settle(); setSelection(2, 6); await settle();
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
      await component.openHistory(); await settle();
      expect(api.history).toHaveBeenCalledWith('s1', 0);
      expect(text()).toContain('visible → hidden');
      expect(text()).toContain('12345678');
      expect(text()).not.toContain('Invalid Date');
      button('Load more')!.click(); await settle();
      expect(api.history).toHaveBeenCalledWith('s1', 20);
      expect(component.historyItems().length).toBe(2);
      expect(button('Load more')).toBeUndefined();
    });

    const historyButton = () => button('Change history')!;
    const dialog = () => dom().querySelector<HTMLElement>('[data-history-dialog]');
    const waitForFocus = async () => { await settle(); await new Promise(resolve => setTimeout(resolve)); await settle(); };

    it('is a dialog, not a list at the end of the page; nothing is rendered until it is opened', async () => {
      expect(dialog()).toBeNull();
      expect(dom().querySelector('.history')).toBeNull();
      expect(historyButton().getAttribute('aria-haspopup')).toBe('dialog');
      historyButton().click(); await settle();
      expect(dialog()!.getAttribute('role')).toBe('dialog');
      expect(dialog()!.closest('[id=annotation-editor-body]')).toBeNull();
    });
    for (const [name, close] of [
      ['the Close button', () => dom().querySelector<HTMLElement>('[data-history-close]')!.click()],
      ['Escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
      ['the backdrop', () => (dom().querySelector('app-change-history-dialog .fixed') as HTMLElement).click()],
    ] as const) {
      it(`closes with ${name} and focus returns to the Change history button`, async () => {
        historyButton().focus();
        historyButton().click(); await waitForFocus();
        expect(dialog()!.contains(document.activeElement)).toBeTrue();
        close(); await waitForFocus();
        expect(dialog()).toBeNull();
        expect(component.historyOpen()).toBeFalse(); expect(document.querySelectorAll('app-change-history-dialog, app-change-history-dialog .fixed').length).toBe(0);
        expect(document.activeElement).toBe(historyButton());
      });
    }
    it('a click inside the dialog does not close it', async () => {
      historyButton().click(); await settle();
      dialog()!.click(); await settle();
      expect(dialog()).not.toBeNull();
    });
    it('reopening asks for the list again from the start, so a change made since then is listed', async () => {
      historyButton().click(); await settle();
      dom().querySelector<HTMLElement>('[data-history-close]')!.click(); await settle();
      api.history.calls.reset();
      historyButton().click(); await settle();
      expect(api.history.calls.allArgs()).toEqual([['s1', 0]]);
    });
    it('a slow answer that arrives after closing is dropped', async () => {
      let finish: (value: unknown) => void = () => undefined;
      api.history.and.returnValue(new Promise(resolve => { finish = resolve; }));
      historyButton().click(); await settle();
      dom().querySelector<HTMLElement>('[data-history-close]')!.click(); await settle();
      finish({ items: [{ action: 'hide', previousRevision: 1, newRevision: 2, createdAt: '2026-11-01T10:00:00.000Z' }], nextOffset: null }); await settle();
      expect(component.historyItems()).toEqual([]);
    });
    it('zero entries: the button still works and the empty state shows', async () => {
      api.history.and.resolveTo({ items: [], nextOffset: null });
      expect(historyButton().hasAttribute('disabled')).toBeFalse();
      historyButton().click(); await settle();
      expect(dom().querySelector('[data-history-empty]')!.textContent).toContain('No changes yet');
      dom().querySelector<HTMLElement>('[data-history-close]')!.click(); await settle();
      expect(dialog()).toBeNull();
    });
    it('a failure shows in the dialog with Retry, not behind it; Retry loads the list', async () => {
      api.history.and.rejectWith(httpError(500));
      historyButton().click(); await settle();
      expect(dom().querySelector('[data-history-error]')!.textContent).toContain('could not be loaded');
      expect(component.error()).toBe('');
      api.history.and.callThrough();
      api.history.and.resolveTo({ items: [{ action: 'hide', previousRevision: 1, newRevision: 2, createdAt: '2026-11-01T10:00:00.000Z' }], nextOffset: null });
      dom().querySelector<HTMLElement>('[data-history-retry]')!.click(); await settle();
      expect(dom().querySelector('[data-history-error]')).toBeNull();
      expect(dom().querySelectorAll('[data-history-entry]').length).toBe(1);
    });
    it('Retry after a failed Load more asks for the same next page and keeps what is listed', async () => {
      historyButton().click(); await settle();
      api.history.and.rejectWith(httpError(500));
      button('Load more')!.click(); await settle();
      expect(dom().querySelectorAll('[data-history-entry]').length).toBe(1);
      api.history.calls.reset();
      api.history.and.resolveTo({ items: [{ action: 'add', previousRevision: 1, newRevision: 2, createdAt: '2026-11-01T09:00:00.000Z' }], nextOffset: null });
      dom().querySelector<HTMLElement>('[data-history-retry]')!.click(); await settle();
      expect(api.history.calls.allArgs()).toEqual([['s1', 20]]);
      expect(dom().querySelectorAll('[data-history-entry]').length).toBe(2);
    });
  });

  describe('possible missed line', () => {
    it('warns the teacher when the server says a written line may have been skipped', async () => {
      await create();
      api.current = snapshot({ possibleMissedLines: 1 });
      await openEditor();
      const warning = dom().querySelector('[data-possible-missed-line]')!;
      expect(warning.textContent).toContain('Possible missed line, please check the image.');
      expect(warning.getAttribute('role')).toBe('status');
    });
    it('says nothing when none was found, or the server is older', async () => {
      await create();
      api.current = snapshot({ possibleMissedLines: 0 });
      await openEditor();
      expect(dom().querySelector('[data-possible-missed-line]')).toBeNull();
    });
  });

  describe('why a correction has no marker', () => {
    it('the list says so with the workspace closed too', async () => {
      await create();
      api.current = snapshot({ corrections: [correction({ id: 'ai_1', wordIds: ['w1'] })], effective: [{ id: 'ai_1', wordIds: ['w1'], renderTarget: { source: 'none', wordIds: [], boxes: [] } }] });
      await openEditor();
      expect(component.workspaceOpen()).toBeFalse();
      const labels = [...dom().querySelectorAll('[data-row-key="ai_1"] [data-row-position]')].map(el => el.textContent?.trim());
      expect(labels).toEqual(['Not located on image']);
    });
  });

  describe('history: teacher only', () => {
    it('someone the server refuses gets no history button and no history request', async () => {
      await create();
      api.snapshotFailure = httpError(404, 'ANNOTATION_NOT_FOUND');
      await openEditor();
      expect(button('Change history')).toBeUndefined();
      expect(dom().querySelector('[data-history-dialog]')).toBeNull();
      expect(api.history).not.toHaveBeenCalled();
    });
    it('the server refusing the history itself shows a message and no entries', async () => {
      await create(); await openEditor();
      api.history.and.rejectWith(httpError(404, 'ANNOTATION_NOT_FOUND'));
      button('Change history')!.click(); await settle();
      expect(dom().querySelector('[data-history-entry]')).toBeNull();
      expect(dom().querySelector('[data-history-error]')!.textContent).toContain('do not have access');
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
    dom().querySelector<HTMLButtonElement>('[data-sync-toggle]')!.click(); await settle();
    expect(dom().querySelectorAll('.workspace__corrections-panel [data-row-key]').length).toBe(100);
    expect(dom().querySelector('#annotation-text-panel ul.rows')).toBeNull();
    button('Show more')!.click(); await settle();
    expect(dom().querySelectorAll('.workspace__corrections-panel [data-row-key]').length).toBe(150);
  });
});
