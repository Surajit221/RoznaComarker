import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TeacherAnnotationApiService } from '../../../api/teacher-annotation-api.service';
import { AuthService } from '../../../auth/auth.service';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import { AnnotationControls, AnnotationDraftStore } from './annotation-controls';
import type { AnnotationBody, AnnotationSnapshot, CorrectionRow, SnapshotCorrection } from './annotation-editor.logic';
import { AnnotationMarkMenu, MarkMenuAction, MarkMenuEntry } from './annotation-mark-menu';

const row = (patch: Partial<CorrectionRow>): CorrectionRow => ({ key: 'ai_1', targetId: 'ai_1', status: 'visible', source: 'AI', manual: false, edited: false,
  orphanReason: null, suppressing: false, fileId: 'f1', page: 1, startChar: 2, endChar: 6, quotedText: 'goes', symbol: 'AGR', symbolLabel: 'Agreement',
  category: 'GRAMMAR', message: 'Use go.', suggestedText: 'go', ...patch } as CorrectionRow);

describe('AnnotationMarkMenu', () => {
  let fixture: ComponentFixture<AnnotationMarkMenu>, acted: MarkMenuAction[];
  const dom = () => fixture.nativeElement as HTMLElement;
  async function create(entries: MarkMenuEntry[], locked = false) {
    await TestBed.configureTestingModule({ imports: [AnnotationMarkMenu] }).compileComponents();
    fixture = TestBed.createComponent(AnnotationMarkMenu);
    fixture.componentRef.setInput('entries', entries); fixture.componentRef.setInput('locked', locked);
    acted = []; fixture.componentInstance.act.subscribe(a => acted.push(a));
    fixture.detectChanges();
  }
  const actions = () => [...dom().querySelectorAll('[data-sync-menu-action]')].map(b => b.getAttribute('data-sync-menu-action'));

  it('one correction: says which (chip, category, original text), then the actions', async () => {
    await create([{ row: row({}), actions: ['edit', 'hide', 'archive'] }]);
    expect(dom().querySelector('[data-mark-menu-target]')!.textContent).toContain('AGR');
    expect(dom().querySelector('[data-mark-menu-target]')!.textContent).toContain('GRAMMAR');
    expect(dom().querySelector('[data-mark-menu-target]')!.textContent).toContain('“goes”');
    expect(actions()).toEqual(['edit', 'hide', 'archive']);
    dom().querySelector<HTMLButtonElement>('[data-sync-menu-action="hide"]')!.click();
    expect(acted.map(a => [a.action, a.key])).toEqual([['hide', 'ai_1']]);
  });
  it('several corrections: a chooser first, no action until one is chosen; "Other corrections here" goes back', async () => {
    await create([{ row: row({}), actions: ['edit', 'hide', 'archive'] }, { row: row({ key: 'ai_2', targetId: 'ai_2', symbol: 'SP', category: 'MECHANICS' }), actions: ['hide'] }]);
    expect(actions()).toEqual([]);
    expect(dom().querySelectorAll('[data-mark-menu-choice]').length).toBe(2);
    dom().querySelector<HTMLButtonElement>('[data-mark-menu-choice="ai_2"]')!.click(); fixture.detectChanges();
    expect(dom().querySelector('[data-mark-menu-target]')!.textContent).toContain('SP');
    expect(actions()).toEqual(['hide']);
    dom().querySelector<HTMLButtonElement>('[data-sync-menu-action="hide"]')!.click();
    expect(acted.map(a => a.key)).toEqual(['ai_2']);
    dom().querySelector<HTMLButtonElement>('[data-mark-menu-back]')!.click(); fixture.detectChanges();
    expect(dom().querySelectorAll('[data-mark-menu-choice]').length).toBe(2);
  });
  it('locked: the buttons say so and do nothing', async () => {
    await create([{ row: row({}), actions: ['hide'] }], true);
    const hide = dom().querySelector<HTMLButtonElement>('[data-sync-menu-action="hide"]')!;
    expect(hide.getAttribute('aria-disabled')).toBe('true');
    hide.click();
    expect(acted).toEqual([]);
  });
});

// The teacher "Student Submissions" page wiring, reproduced: the page's own image and transcript, the editor, and the menu template.
const correction = (patch: Partial<SnapshotCorrection>): SnapshotCorrection => ({ id: 'ai_1', moderationStatus: 'visible', source: 'AI', fileId: 'f1', page: 1, startChar: 2, endChar: 6,
  quotedText: 'goes', symbol: 'AGR', symbolLabel: 'Agreement', category: 'GRAMMAR', message: 'Use go.', suggestedText: 'go', ...patch });
const TEXT = 'I goes home';
const SNAPSHOT: AnnotationSnapshot = { revision: 3, sourceHash: 'hash-3', scoringReviewRequired: false, scorePolicy: 'Annotation changes do not change grades.',
  pages: [{ fileId: 'f1', pageNumber: 1, startChar: 0, endChar: TEXT.length, text: TEXT, words: TEXT.split(' ').map((text, i) => ({ id: `w${i}`, text })) }],
  corrections: [correction({}), correction({ id: 'ai_2', symbol: 'SP', symbolLabel: 'Spelling', category: 'MECHANICS', message: 'Spelling.' }),
    correction({ id: 'ai_3', quotedText: 'home', startChar: 7, endChar: 11, symbol: 'WC', symbolLabel: 'Word choice', category: 'VOCABULARY', message: 'Other word.' })],
  orphans: [], effective: [{ id: 'ai_1' }, { id: 'ai_2' }, { id: 'ai_3' }],
  transitions: { hide: { from: ['visible'], to: 'hidden' }, restore: { from: ['hidden', 'archived'], to: 'visible' }, archive: { from: ['visible', 'hidden'], to: 'archived' }, edit: { from: ['visible', 'hidden'], to: null }, add: { from: [], to: 'visible' },
    orphan: { edit: { from: ['visible', 'hidden'], to: null }, archive: { from: ['visible', 'hidden'], to: 'archived' }, restore: { from: ['archived'], to: 'orphaned' } } },
  legend: { groups: [{ key: 'GRAMMAR', label: 'Grammar', symbols: [{ symbol: 'AGR', label: 'Agreement' }] }, { key: 'MECHANICS', label: 'Mechanics', symbols: [{ symbol: 'SP', label: 'Spelling' }] },
    { key: 'VOCABULARY', label: 'Vocabulary', symbols: [{ symbol: 'WC', label: 'Word choice' }] }] } } as AnnotationSnapshot;
const ANNOTATIONS = [
  { _id: 'ai_1', submissionId: 's1', wordIds: ['w1'], symbol: 'AGR', category: 'GRAMMAR', message: 'Use go.', source: 'AI', editable: false },
  { _id: 'ai_2', submissionId: 's1', wordIds: ['w1'], symbol: 'SP', category: 'MECHANICS', message: 'Spelling.', source: 'AI', editable: false },
  { _id: 'ai_3', submissionId: 's1', wordIds: ['w2'], symbol: 'WC', category: 'VOCABULARY', message: 'Other word.', source: 'AI', editable: false },
] as unknown as FeedbackAnnotation[];

class FakeApi {
  calls: AnnotationBody[] = []; snapshotCalls = 0; failure: unknown = null;
  async snapshot() { this.snapshotCalls++; if (this.failure) throw this.failure; return SNAPSHOT; }
  async mutate(_id: string, body: AnnotationBody) { this.calls.push(body); return { revision: 4 }; }
  async history() { return { items: [], nextOffset: null }; }
}

@Component({
  imports: [AnnotationControls, AnnotationMarkMenu, CorrectionOverlay, TokenizedTranscript],
  template: `
    <app-correction-overlay [annotations]="annotations" [markMenu]="teacher() ? teacherMarkMenu : null" (markActivated)="controls.markActivated($event, 'image')" />
    <app-tokenized-transcript [ocrWords]="words" [annotations]="annotations" [markMenu]="teacher() ? teacherMarkMenu : null" (markActivated)="controls.markActivated($event, 'transcript')" />
    <app-annotation-controls #controls submissionId="s1" />
    <ng-template #teacherMarkMenu let-ids>
      @if (controls.menuFor(ids); as entries) {
        @if (entries.length) { <app-annotation-mark-menu [entries]="entries" [locked]="controls.locked() || !!controls.form()" (act)="controls.onMenuAction($event)" /> }
      }
    </ng-template>`,
})
class PageWiringHost {
  readonly teacher = signal(true);
  readonly annotations = ANNOTATIONS;
  readonly words = TEXT.split(' ').map((text, i) => ({ id: `w${i}`, text, bbox: null, separatorBefore: i ? ' ' : '' }));
  readonly overlay = viewChild.required(CorrectionOverlay);
  readonly controls = viewChild.required(AnnotationControls);
}

describe('Teacher submission page: menu on the page image and transcript (Phase A wiring)', () => {
  let fixture: ComponentFixture<PageWiringHost>, host: PageWiringHost, api: FakeApi;
  async function create(teacher = true) {
    api = new FakeApi();
    await TestBed.configureTestingModule({ imports: [PageWiringHost], providers: [{ provide: AuthService, useValue: { getMeProfile: async () => ({ id: 'me' }) } },
      { provide: TeacherAnnotationApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(PageWiringHost); host = fixture.componentInstance;
    host.teacher.set(teacher);
    fixture.detectChanges();
  }
  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  const dom = () => fixture.nativeElement as HTMLElement;
  /** The transcript tooltip lives in document.body while open. */
  /** The transcript tooltip lives in document.body while open. */
  const tooltip = () => [...document.querySelectorAll<HTMLElement>('.transcript-tooltip')].find(t => t.parentElement === document.body) ?? null;
  const word = (text: string) => [...dom().querySelectorAll<HTMLElement>('.correction-highlight')].find(w => w.textContent?.trim() === text)!;
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  /** On screen, as the transcript spec does: the transcript closes a tooltip whose word is outside the visible area (karma lays fixtures out anywhere). */
  const placed = new Set<Element>();
  function onScreen(target: HTMLElement) {
    const container = dom().querySelector<HTMLElement>('.tokenized-transcript')!;
    if (!placed.has(container)) { spyOn(container, 'getBoundingClientRect').and.returnValue(rect(10, 10, 400, 300)); placed.add(container); }
    if (!placed.has(target)) { spyOn(target, 'getBoundingClientRect').and.returnValue(rect(40, 80, 40, 20)); placed.add(target); }
  }
  const tapWord = async (text: string) => {
    const target = word(text); onScreen(target);
    target.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true })); await settle();
  };
  function clickImageMark(id: string) {
    const target = document.createElement('button');
    const marker = { annotation: ANNOTATIONS.find(a => a._id === id)!, code: 'X', label: 'x', left: 10, top: 10, offsetX: 0, offsetY: 0, textColor: '#fff' };
    host.overlay().onMarkerClick(marker as never, { currentTarget: target, preventDefault: jasmine.createSpy('preventDefault'), stopPropagation: jasmine.createSpy('stopPropagation') } as unknown as MouseEvent);
  }
  afterEach(() => { TestBed.inject(AnnotationDraftStore).draft = null; TestBed.resetTestingModule(); });

  it('image: a click keeps the old details and adds the menu for that correction; Hide runs the existing single action', async () => {
    await create();
    clickImageMark('ai_3'); await settle();
    expect(api.snapshotCalls).toBe(1);
    expect(host.controls().selection.pinnedId()).toBe('ai_3');
    const card = dom().querySelector('.correction-overlay__tooltip-card')!;
    expect(card.querySelector('.correction-overlay__header')).not.toBeNull();   // the old tooltip content stays
    const menu = card.querySelector('[data-overlay-mark-menu] [data-sync-menu]')!;
    expect(menu.querySelector('[data-mark-menu-target]')!.textContent).toContain('WC');
    expect(menu.querySelector('[data-mark-menu-target]')!.textContent).toContain('“home”');
    menu.querySelector<HTMLButtonElement>('[data-sync-menu-action="hide"]')!.click(); await settle();
    expect(api.calls).toEqual([jasmine.objectContaining({ action: 'hide', id: 'ai_3', revision: 3, sourceHash: 'hash-3' })]);
  });
  it('transcript: a word with two corrections asks which first; Remove asks for confirmation; Escape closes', async () => {
    await create();
    await tapWord('goes');
    expect(tooltip()!.classList).toContain('transcript-tooltip--menu');
    expect(tooltip()!.textContent).toContain('Use go.');   // the old text stays
    expect(tooltip()!.querySelectorAll('[data-mark-menu-choice]').length).toBe(2);
    expect(tooltip()!.querySelector('[data-sync-menu-action]')).toBeNull();
    tooltip()!.querySelector<HTMLButtonElement>('[data-mark-menu-choice="ai_2"]')!.click(); await settle();
    expect(tooltip()!.querySelector('[data-mark-menu-target]')!.textContent).toContain('SP');
    tooltip()!.querySelector<HTMLButtonElement>('[data-sync-menu-action="archive"]')!.click(); await settle();
    expect(host.controls().confirmRow()?.key).toBe('ai_2');
    expect(api.calls).toEqual([]);
    host.controls().closeRemove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await settle();
    expect(document.querySelector('[data-transcript-mark-menu]')).toBeNull();
  });
  it('transcript: one correction goes straight to the actions; Edit opens the editor with the form', async () => {
    await create();
    await tapWord('home');
    expect(tooltip()!.querySelector('[data-mark-menu-target]')!.textContent).toContain('WC');
    expect(host.controls().open()).toBeFalse();
    tooltip()!.querySelector<HTMLButtonElement>('[data-sync-menu-action="edit"]')!.click(); await settle();
    expect(host.controls().open()).toBeTrue();
    expect(host.controls().form()?.targetId).toBe('ai_3');
  });
  it('no access (404): no menu, the old details only', async () => {
    await create();
    api.failure = new HttpErrorResponse({ status: 404, error: { code: 'ANNOTATION_NOT_FOUND' } });
    clickImageMark('ai_3'); await settle();
    expect(dom().querySelector('.correction-overlay__header')).not.toBeNull();
    expect(dom().querySelector('[data-sync-menu]')).toBeNull();
  });
  it('student and guest pages (no menu input): old tooltip only, nothing emitted, the word click still toggles it', async () => {
    await create(false);
    clickImageMark('ai_3'); await settle();
    expect(dom().querySelector('.correction-overlay__header')).not.toBeNull();
    expect(dom().querySelector('[data-overlay-mark-menu]')).toBeNull();
    expect(api.snapshotCalls).toBe(0);
    await tapWord('home');
    expect(tooltip()!.textContent).toContain('Other word.');
    expect(tooltip()!.classList).not.toContain('transcript-tooltip--menu');
    expect(document.querySelector('[data-transcript-mark-menu]')).toBeNull();
    await tapWord('home');
    expect(host.overlay()).toBeTruthy();
    expect(tooltip()!.style.display).toBe('none');
  });
});
