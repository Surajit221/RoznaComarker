import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritingModelApiService, WritingModelSaveBody, WritingModelSnapshot } from '../../../api/writing-model-api.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { WritingModelEditor } from './writing-model-editor';

const snap = (patch: Partial<WritingModelSnapshot> = {}): WritingModelSnapshot => ({ enabled: true, text: '', status: 'none', source: 'teacher',
  releaseRule: 'afterRevision', released: false, releasedAt: null, revision: 2, updatedAt: null, readOnly: false, aiAvailable: true,
  generationsToday: 0, generationsPerDay: 3, textMax: 4000, ...patch });

class FakeApi {
  current: WritingModelSnapshot | null = snap(); snapshotCalls = 0; saves: WritingModelSaveBody[] = []; generations: { requestId: string; revision: number }[] = [];
  saveResult: (b: WritingModelSaveBody) => Promise<{ snapshot: WritingModelSnapshot }> = async b => ({ snapshot: snap({ text: b.text ?? '', status: b.status ?? 'draft', releaseRule: b.releaseRule ?? 'afterRevision', released: b.released ?? false, revision: 3 }) });
  generateResult: () => Promise<{ snapshot: WritingModelSnapshot; charged?: boolean }> = async () => ({ charged: true, snapshot: snap({ text: 'An AI model answer.', status: 'draft', source: 'ai', revision: 3, generationsToday: 1 }) });
  async snapshot() { this.snapshotCalls++; return this.current; }
  save(_id: string, body: WritingModelSaveBody) { this.saves.push(body); return this.saveResult(body); }
  generate(_id: string, body: { requestId: string; revision: number }) { this.generations.push(body); return this.generateResult(); }
}

describe('WritingModelEditor', () => {
  let fixture: ComponentFixture<WritingModelEditor>, api: FakeApi, registry: UnsavedWorkRegistry;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function settle() { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); await Promise.resolve(); } }
  async function create(current: WritingModelSnapshot | null = snap()) {
    api = new FakeApi(); api.current = current;
    await TestBed.configureTestingModule({ imports: [WritingModelEditor], providers: [{ provide: WritingModelApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(WritingModelEditor);
    fixture.componentRef.setInput('assignmentId', 'a1');
    registry = TestBed.inject(UnsavedWorkRegistry);
    fixture.detectChanges(); await settle();
  }
  const type = (value: string) => { const t = dom().querySelector<HTMLTextAreaElement>('#wm-text')!; t.value = value; t.dispatchEvent(new Event('input')); };
  const click = async (selector: string) => { dom().querySelector<HTMLElement>(selector)!.click(); await settle(); };
  afterEach(() => { registry?.clear('writing-model-editor'); TestBed.resetTestingModule(); });

  it('feature off or not the owner (404): nothing is rendered', async () => {
    await create(null);
    expect(dom().querySelector('[data-writing-model-editor]')).toBeNull();
    expect(dom().innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
  });
  it('an AI draft is marked as not visible to students', async () => {
    await create(snap({ text: 'Draft.', status: 'draft', source: 'ai' }));
    expect(dom().querySelector('[data-wm-ai-badge]')!.textContent).toContain('AI draft - not visible to students until you approve');
    expect(dom().querySelector('[data-wm-visibility]')!.textContent).toContain('Not visible to students');
  });
  for (const [rule, released, message] of [
    ['manual', false, 'Approved, waiting for you to release it.'],
    ['manual', true, 'Visible to students now.'],
    ['afterRevision', false, 'Approved: each student sees it after submitting a second draft.'],
  ] as const) {
    it(`approval reports the persisted ${rule}, released=${released} state`, async () => {
      await create(snap({ text: 'Teacher model.', releaseRule: rule, released }));
      await click('[data-wm-approve]');
      expect(dom().querySelector('[data-wm-notice]')?.textContent).toContain(message);
      expect(api.saves[0].released).toBe(released);
      expect(api.saves[0].releaseRule).toBe(rule);
    });
  }
  it('typing registers unsaved work; Save draft and Approve send the text, rule and release', async () => {
    await create();
    expect(dom().querySelector('[data-wm-approve]')?.textContent?.trim()).toBe('Submit Improved Writing to Student');
    expect(dom().querySelector('[data-wm-save-draft]')?.textContent?.trim()).toBe('Save draft');
    expect(dom().querySelector('[data-wm-generate]')?.textContent).toContain('Generate draft with AI (1 credit)');
    for (const width of [320, 360, 768, 1024, 1440]) {
      const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;height:900px;border:0;width:' + width + 'px'; document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        const css = doc.createElement('style');
        css.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules).filter(rule => rule.type !== CSSRule.IMPORT_RULE).map(rule => rule.cssText); } catch { return []; } }).join('\n');
        doc.head.appendChild(css);
        doc.body.style.margin = '0'; doc.body.appendChild(dom().cloneNode(true));
        doc.documentElement.setAttribute('data-button-labels-qa', 'model');
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        const approve = doc.querySelector<HTMLButtonElement>('[data-wm-approve]')!;
        expect(approve.scrollWidth).toBeLessThanOrEqual(approve.clientWidth + 1);
        expect(approve.scrollHeight).toBeLessThanOrEqual(approve.clientHeight + 1);
        expect(approve.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      } finally { frame.remove(); }
    }
    type('A model answer written by me.'); await settle();
    expect(registry.has('writing-model-editor')).toBeTrue();
    expect(dom().querySelector('#wm-count')!.textContent).toContain('29 / 4000');
    await click('[data-wm-save-draft]');
    expect(api.saves[0]).toEqual(jasmine.objectContaining({ revision: 2, text: 'A model answer written by me.', status: 'draft', releaseRule: 'afterRevision', released: false }));
    expect(api.saves[0].requestId).toMatch(/^[a-f0-9-]{36}$/i);
    expect(registry.has('writing-model-editor')).toBeFalse();
    const rule = dom().querySelector<HTMLSelectElement>('#wm-rule')!; rule.value = 'manual'; rule.dispatchEvent(new Event('change')); await settle();
    dom().querySelector<HTMLInputElement>('[data-wm-released]')!.click(); await settle();
    await click('[data-wm-approve]');
    expect(api.saves[1]).toEqual(jasmine.objectContaining({ status: 'approved', releaseRule: 'manual', released: true }));
  });
  it('Approve with no text is refused locally', async () => {
    await create();
    await click('[data-wm-approve]');
    expect(api.saves).toEqual([]);
    expect(dom().querySelector('[data-wm-error]')!.textContent).toContain('before approving');
  });
  it('AI draft: asks first in the centred dialog stating the cost; then generates and says a credit was used', async () => {
    await create();
    await click('[data-wm-generate]');
    const dialog = dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.textContent).toContain('This uses 1 credit');
    expect(api.generations).toEqual([]);
    await click('[data-confirm-ok]');
    expect(api.generations[0]).toEqual(jasmine.objectContaining({ revision: 2 }));
    expect((dom().querySelector('#wm-text') as HTMLTextAreaElement).value).toBe('An AI model answer.');
    expect(dom().textContent).toContain('1 credit was used');
    expect(dom().querySelector('[data-wm-ai-badge]')).not.toBeNull();
  });
  it('AI failure: the message says no credit was used; the daily cap blocks the button without a dialog', async () => {
    await create();
    api.generateResult = async () => { throw new HttpErrorResponse({ status: 502, error: { code: 'WRITING_MODEL_AI_FAILED' } }); };
    await click('[data-wm-generate]'); await click('[data-confirm-ok]');
    expect(dom().querySelector('[data-wm-error]')!.textContent).toContain('No credit was used');
    TestBed.resetTestingModule();
    await create(snap({ generationsToday: 3 }));
    expect(dom().querySelector('[data-wm-generate]')!.getAttribute('aria-disabled')).toBe('true');
    expect(dom().querySelector('[data-wm-ai-blocked]')!.textContent).toContain("today's 3 AI drafts");
    await click('[data-wm-generate]');
    expect(dom().querySelector<HTMLDialogElement>('[data-confirm-dialog]')!.open).toBeFalse();
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
});
