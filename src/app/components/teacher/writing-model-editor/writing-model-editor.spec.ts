import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritingModelApiService, WritingModelSaveBody, WritingModelSnapshot } from '../../../api/writing-model-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { WritingModelEditor } from './writing-model-editor';

const snap = (patch: Partial<WritingModelSnapshot> = {}): WritingModelSnapshot => ({ enabled: true, text: '', source: 'teacher', releaseRule: 'manual',
  visibility: 'draft', published: null, writingChanged: false, hasTranscript: true, draftNumber: 1, revision: 2, updatedAt: null, readOnly: false,
  aiAvailable: true, generationsToday: 0, generationsPerDay: 3, textMax: 4000, legacyAssignmentModel: null, ...patch });
const AT = '2026-11-13T09:30:00.000Z';

class FakeApi {
  current: WritingModelSnapshot | null = snap(); snapshotCalls = 0; ids: string[] = []; saves: WritingModelSaveBody[] = []; generations: { requestId: string; revision: number }[] = [];
  saveResult: (b: WritingModelSaveBody) => Promise<{ snapshot: WritingModelSnapshot }> = async b => {
    const rule = b.releaseRule ?? 'manual';
    const published = b.action === 'submit' ? { at: AT, rule, sameAsDraft: true } : null;
    return { snapshot: snap({ text: b.text ?? '', releaseRule: rule, revision: b.revision + 1, published,
      visibility: !published ? 'draft' : rule === 'manual' ? 'released' : 'waiting' }) };
  };
  generateResult: () => Promise<{ snapshot: WritingModelSnapshot; charged?: boolean }> = async () => ({ charged: true, snapshot: snap({ text: 'An improved version of this essay.', source: 'ai', revision: 3 }) });
  async snapshot(id: string) { this.snapshotCalls++; this.ids.push(id); return this.current; }
  save(id: string, body: WritingModelSaveBody) { this.ids.push(id); this.saves.push(body); return this.saveResult(body); }
  generate(id: string, body: { requestId: string; revision: number }) { this.ids.push(id); this.generations.push(body); return this.generateResult(); }
}

describe('WritingModelEditor (one per submission)', () => {
  let fixture: ComponentFixture<WritingModelEditor>, api: FakeApi, registry: UnsavedWorkRegistry;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(current: WritingModelSnapshot | null = snap()) {
    api = new FakeApi(); api.current = current;
    await TestBed.configureTestingModule({ imports: [WritingModelEditor], providers: [{ provide: WritingModelApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(WritingModelEditor);
    fixture.componentRef.setInput('submissionId', 'sub-A');
    registry = TestBed.inject(UnsavedWorkRegistry);
    fixture.detectChanges(); await settle();
  }
  const type = (value: string) => { const t = dom().querySelector<HTMLTextAreaElement>('#wm-text')!; t.value = value; t.dispatchEvent(new Event('input')); };
  const click = async (selector: string) => { dom().querySelector<HTMLElement>(selector)!.click(); await settle(); };
  const chip = () => dom().querySelector('[data-wm-status]')!;
  afterEach(() => { registry?.clear('writing-model-editor'); TestBed.resetTestingModule(); });

  it('feature off or not the owner (404): nothing is rendered', async () => {
    await create(null);
    expect(dom().querySelector('[data-writing-model-editor]')).toBeNull();
    expect(dom().innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
  });

  it('loads and saves by THIS submission, never by assignment', async () => {
    await create();
    type('Text.'); await settle();
    await click('[data-wm-save-draft]');
    expect(api.ids.every(id => id === 'sub-A')).toBeTrue();
  });

  it('says it is an improved version of THIS student\'s writing that only this student sees; the AI note says it reads this student\'s writing', async () => {
    await create();
    const text = dom().textContent!;
    expect(text).toContain('An improved version of this student\'s own writing. Only this student will see it');
    expect(text).not.toContain('One model answer for every student');
    expect(text).not.toContain('each student sees it');
    expect(text).not.toContain('never student writing');
    expect(dom().querySelector('[data-wm-ai-help]')!.textContent).toContain('The AI reads this student\'s writing');
  });

  it('"Release manually" is selected by default and there is no "Released to students" checkbox', async () => {
    await create();
    const rule = dom().querySelector<HTMLSelectElement>('#wm-rule')!;
    expect(rule.value).toBe('manual');
    expect(Array.from(rule.options).map(o => [o.value, o.textContent?.trim()])).toEqual([['manual', 'Release manually'], ['afterRevision', 'After the student\'s second draft']]);
    expect(dom().querySelector('input[type="checkbox"]')).toBeNull();
    expect(dom().querySelector('[data-wm-released]')).toBeNull();
    expect(dom().textContent).not.toContain('Released to students (once approved)');
    expect(dom().querySelector('[data-wm-rule-help]')!.textContent).toContain('Submit shows it to this student straight away.');
  });

  it('Save draft keeps it hidden (chip "Draft"); Submit with "Release manually" releases it to this student at once (chip with the time)', async () => {
    await create();
    expect(chip().textContent).toContain('Draft');
    type('Improved writing for A.'); await settle();
    expect(registry.has('writing-model-editor')).toBeTrue();
    await click('[data-wm-save-draft]');
    expect(api.saves[0]).toEqual(jasmine.objectContaining({ action: 'save', text: 'Improved writing for A.', releaseRule: 'manual', revision: 2 }));
    expect(api.saves[0]).not.toEqual(jasmine.objectContaining({ released: jasmine.anything() }));
    expect(Object.keys(api.saves[0]).sort()).toEqual(['action', 'releaseRule', 'requestId', 'revision', 'text']);
    expect(dom().querySelector('[data-wm-notice]')!.textContent).toContain('This student does not see it.');
    expect(chip().getAttribute('data-wm-state')).toBe('draft');
    expect(registry.has('writing-model-editor')).toBeFalse();
    await click('[data-wm-submit]');
    expect(api.saves[1]).toEqual(jasmine.objectContaining({ action: 'submit', text: 'Improved writing for A.', releaseRule: 'manual' }));
    expect(chip().getAttribute('data-wm-state')).toBe('released');
    expect(chip().textContent).toContain('Released to this student');
    expect(chip().querySelector('time')!.getAttribute('datetime')).toBe(AT);
    expect(dom().querySelector('[data-wm-notice]')!.textContent).toContain('Released to this student.');
  });

  it('"After the student\'s second draft": Submit shows "Waiting for second draft"', async () => {
    await create(snap({ text: 'Ready.' }));
    const rule = dom().querySelector<HTMLSelectElement>('#wm-rule')!; rule.value = 'afterRevision'; rule.dispatchEvent(new Event('change')); await settle();
    expect(dom().querySelector('[data-wm-rule-help]')!.textContent).toContain('after submitting a second draft');
    await click('[data-wm-submit]');
    expect(api.saves[0]).toEqual(jasmine.objectContaining({ action: 'submit', releaseRule: 'afterRevision' }));
    expect(chip().getAttribute('data-wm-state')).toBe('waiting');
    expect(chip().textContent).toContain('Waiting for second draft');
  });

  it('a released model with newer unsent changes says so; the "writing changed" warning shows when the student\'s writing changed', async () => {
    await create(snap({ text: 'Newer text.', visibility: 'released', published: { at: AT, rule: 'manual', sameAsDraft: false }, writingChanged: true }));
    expect(dom().querySelector('[data-wm-visibility]')!.textContent).toContain('has changes this student does not see yet');
    expect(dom().querySelector('[data-wm-writing-changed]')!.textContent).toContain('This student\'s writing changed since this draft was made');
  });

  it('Submit with no text is refused locally', async () => {
    await create();
    await click('[data-wm-submit]');
    expect(api.saves).toEqual([]);
    expect(dom().querySelector('[data-wm-error]')!.textContent).toContain('before submitting it to the student');
  });

  it('the old assignment-wide model is shown read-only as a starting point, not saved until the teacher saves', async () => {
    await create(snap({ legacyAssignmentModel: { text: 'Old shared model.', updatedAt: null } }));
    expect(dom().querySelector('[data-wm-legacy]')!.textContent).toContain('It is no longer shown to any student.');
    await click('[data-wm-use-legacy]');
    expect((dom().querySelector('#wm-text') as HTMLTextAreaElement).value).toBe('Old shared model.');
    expect(api.saves).toEqual([]);
  });

  it('AI draft: asks first stating the cost and that it reads this student\'s writing; then generates; the student does not see it yet', async () => {
    await create();
    await click('[data-wm-generate]');
    const dialog = dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.textContent).toContain('This uses 1 credit');
    expect(dialog.textContent).toContain('reads this student\'s writing');
    expect(api.generations).toEqual([]);
    await click('[data-confirm-ok]');
    expect(api.generations[0]).toEqual(jasmine.objectContaining({ revision: 2 }));
    expect((dom().querySelector('#wm-text') as HTMLTextAreaElement).value).toBe('An improved version of this essay.');
    expect(dom().textContent).toContain('1 credit was used');
    expect(dom().querySelector('[data-wm-ai-badge]')).not.toBeNull();
  });

  it('AI failure: no credit used; the per-student daily cap and a missing transcript block the button without a dialog', async () => {
    await create();
    api.generateResult = async () => { throw new HttpErrorResponse({ status: 502, error: { code: 'WRITING_MODEL_AI_FAILED' } }); };
    await click('[data-wm-generate]'); await click('[data-confirm-ok]');
    expect(dom().querySelector('[data-wm-error]')!.textContent).toContain('No credit was used');
    TestBed.resetTestingModule();
    await create(snap({ generationsToday: 3 }));
    expect(dom().querySelector('[data-wm-generate]')!.getAttribute('aria-disabled')).toBe('true');
    expect(dom().querySelector('[data-wm-ai-blocked]')!.textContent).toContain("today's 3 AI drafts for this student");
    await click('[data-wm-generate]');
    expect(dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!.open).toBeFalse();
    TestBed.resetTestingModule();
    await create(snap({ hasTranscript: false }));
    expect(dom().querySelector('[data-wm-ai-blocked]')!.textContent).toContain('needs this student\'s transcript');
  });

  it('a conflict reloads the latest version and keeps what was typed', async () => {
    await create();
    type('My unsaved text.'); await settle();
    api.saveResult = async () => { throw new HttpErrorResponse({ status: 409, error: { code: 'WRITING_MODEL_REVISION_CONFLICT' } }); };
    api.current = snap({ revision: 7, text: 'Someone else saved.' });
    const loads = api.snapshotCalls;
    await click('[data-wm-save-draft]');
    expect(dom().querySelector('[data-wm-error]')!.textContent).toContain('Your change was not saved');
    expect(api.snapshotCalls).toBe(loads + 1);
    expect((dom().querySelector('#wm-text') as HTMLTextAreaElement).value).toBe('My unsaved text.');
  });

  it('buttons fit and keep 44px targets from 320 to 1440px', async () => {
    await create(snap({ text: 'Text.' }));
    for (const width of [320, 390, 768, 1024, 1440]) {
      const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        const css = doc.createElement('style');
        css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
        doc.head.appendChild(css);
        doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true));
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        const submit = doc.querySelector<HTMLButtonElement>('[data-wm-submit]')!;
        expect(submit.scrollWidth).toBeLessThanOrEqual(submit.clientWidth + 1);
        expect(submit.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      } finally { frame.remove(); }
    }
  });
});
