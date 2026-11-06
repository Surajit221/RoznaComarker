import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeviceService } from '../../../services/device.service';
import type { AnnotationSnapshot, HistoryItem } from './annotation-editor.logic';
import { ChangeHistoryDialog } from './change-history-dialog';

const HIDE: HistoryItem = { action: 'hide', previousRevision: 1, newRevision: 2, createdAt: '2026-11-05T05:04:19.000Z', entryId: 'ann_abcdefgh12345678', correctionId: 'ai_1',
  before: { status: 'visible', anchor: { quotedText: 'goes to' } }, after: { status: 'hidden', anchor: { quotedText: 'goes to' } } };
const SNAPSHOT = { corrections: [{ id: 'ai_1', symbol: 'AGR', category: 'GRAMMAR' }], orphans: [],
  legend: { groups: [{ key: 'GRAMMAR', label: 'Grammar', symbols: [] }] } } as unknown as AnnotationSnapshot;

describe('ChangeHistoryDialog', () => {
  let fixture: ComponentFixture<ChangeHistoryDialog>, component: ChangeHistoryDialog, compact: ReturnType<typeof signal<boolean>>, closed: number;
  async function create(isCompact: boolean, inputs: Record<string, unknown> = {}) {
    compact = signal(isCompact);
    await TestBed.configureTestingModule({ imports: [ChangeHistoryDialog], providers: [{ provide: DeviceService, useValue: { isCompact: compact } }] }).compileComponents();
    fixture = TestBed.createComponent(ChangeHistoryDialog);
    component = fixture.componentInstance;
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    closed = 0; component.closed.subscribe(() => closed++);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle();
  }
  async function settle() { for (let i = 0; i < 3; i++) { await fixture.whenStable(); fixture.detectChanges(); await new Promise(resolve => setTimeout(resolve)); } }
  const dom = () => fixture.nativeElement as HTMLElement;
  const panel = () => dom().querySelector<HTMLElement>('[data-history-dialog]')!;
  const key = (name: string, shiftKey = false) => { const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }); document.dispatchEvent(event); return event; };
  afterEach(() => { fixture.destroy(); fixture.nativeElement.remove(); });

  for (const isCompact of [false, true]) {
    describe(isCompact ? 'compact: bottom sheet' : 'desktop: modal', () => {
      beforeEach(async () => { await create(isCompact, { items: [HIDE], snapshot: SNAPSHOT, hasMore: true }); });
      it('uses the shared dialog of this width', () => {
        expect(dom().querySelector('app-bottomsheet-dialog') !== null).toBe(isCompact);
        expect(dom().querySelector('app-modal-dialog') !== null).toBe(!isCompact);
      });
      it('is named and modal, and focus moves into it', () => {
        expect(panel().getAttribute('role')).toBe('dialog');
        expect(panel().getAttribute('aria-modal')).toBe('true');
        const title = document.getElementById(panel().getAttribute('aria-labelledby')!)!;
        expect(title.textContent).toBe('Change history');
        expect(panel().contains(document.activeElement)).toBeTrue();
      });
      it('Escape, the Close button and the backdrop each ask to close', () => {
        key('Escape');
        const afterEscape = closed;
        expect(afterEscape).toBeGreaterThan(0);
        dom().querySelector<HTMLElement>('[data-history-close]')!.click();
        expect(closed).toBe(afterEscape + 1);
        dom().querySelector<HTMLElement>('.fixed')!.click();
        expect(closed).toBe(afterEscape + 2);
      });
      it('a click inside does not ask to close', () => {
        panel().click();
        expect(closed).toBe(0);
      });
      it('Tab stays inside: from the last to the first, and Shift+Tab from the first to the last', () => {
        const close = dom().querySelector<HTMLElement>('[data-history-close]')!, more = dom().querySelector<HTMLElement>('[data-history-more]')!;
        more.focus();
        expect(key('Tab').defaultPrevented).toBeTrue();
        expect(document.activeElement).toBe(close);
        expect(key('Tab', true).defaultPrevented).toBeTrue();
        expect(document.activeElement).toBe(more);
      });
      it('Tab from outside the dialog comes back in', () => {
        (document.activeElement as HTMLElement | null)?.blur();
        expect(key('Tab').defaultPrevented).toBeTrue();
        expect(panel().contains(document.activeElement)).toBeTrue();
      });
    });
  }

  it('compact: the sheet really slides in, although the parents are OnPush', async () => {
    await create(true, { items: [HIDE] });
    await new Promise(resolve => setTimeout(resolve, 80));
    fixture.detectChanges();
    const sheet = dom().querySelector('app-bottomsheet-dialog')!;
    expect(sheet.querySelector('.translate-y-0')).not.toBeNull();
    expect(sheet.querySelector('.translate-y-full')).toBeNull();
    expect(sheet.querySelector('.opacity-100')).not.toBeNull();
  });

  describe('crossing the 1024px breakpoint while open', () => {
    for (const [from, name] of [[false, 'desktop to compact'], [true, 'compact to desktop']] as const) {
      it(`${name}: switches, one backdrop, entries kept, focus inside, no scroll lock, then closes cleanly`, async () => {
        const overflow = document.body.style.overflow;
        const errorSpy = spyOn(console, 'error');
        await create(from, { items: [HIDE], snapshot: SNAPSHOT });
        const before = dom().querySelector('.fixed')!;
        compact.set(!from); await settle();
        await new Promise(resolve => setTimeout(resolve, 60)); fixture.detectChanges();
        expect(before.isConnected).toBeFalse();
        expect(dom().querySelector('app-bottomsheet-dialog') !== null).toBe(!from);
        expect(dom().querySelector('app-modal-dialog') !== null).toBe(from);
        expect(dom().querySelectorAll('.fixed').length).toBe(1);
        expect(dom().querySelectorAll('[data-history-dialog]').length).toBe(1);
        expect(dom().querySelectorAll('[data-history-entry]').length).toBe(1);
        expect(panel().contains(document.activeElement)).toBeTrue();
        expect(document.body.style.overflow).toBe(overflow);
        fixture.destroy();
        expect(document.body.style.overflow).toBe(overflow);
        expect(errorSpy).not.toHaveBeenCalled();
      });
    }
    it('after it is gone, Escape and Tab do nothing', async () => {
      await create(false, { items: [HIDE] });
      fixture.destroy();
      closed = 0;
      expect(key('Tab').defaultPrevented).toBeFalse();
      expect(key('Escape').defaultPrevented).toBeFalse();
      expect(closed).toBe(0);
    });
  });

  describe('states', () => {
    it('loading: announced, no empty state, the dialog is busy', async () => {
      await create(false, { loading: true });
      expect(dom().querySelector('[data-history-status]')!.textContent).toContain('Loading changes');
      expect(dom().querySelector('[data-history-status]')!.getAttribute('role')).toBe('status');
      expect(panel().getAttribute('aria-busy')).toBe('true');
      expect(dom().querySelector('[data-history-empty]')).toBeNull();
    });
    it('empty', async () => {
      await create(false, { items: [] });
      expect(dom().querySelector('[data-history-empty]')!.textContent).toBe('No changes yet');
      expect(dom().querySelector('[data-history-list]')).toBeNull();
    });
    it('error: an alert with Retry, and no empty state', async () => {
      await create(false, { error: 'It failed.' });
      let retries = 0; component.retry.subscribe(() => retries++);
      expect(dom().querySelector('[data-history-error]')!.getAttribute('role')).toBe('alert');
      expect(dom().querySelector('[data-history-empty]')).toBeNull();
      dom().querySelector<HTMLElement>('[data-history-retry]')!.click();
      expect(retries).toBe(1);
    });
    it('the list scrolls by keyboard', async () => {
      await create(false, { items: [HIDE] });
      expect(dom().querySelector('[data-history-list]')!.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('an entry', () => {
    const entry = () => dom().querySelector<HTMLElement>('[data-history-entry]')!;
    const item = (patch: Partial<HistoryItem>): HistoryItem => ({ ...HIDE, ...patch });
    for (const [action, label] of [['edit', 'Edited'], ['hide', 'Hidden'], ['restore', 'Restored'], ['archive', 'Removed'], ['add', 'Added']]) {
      it(`${action} reads "${label}"`, async () => {
        await create(false, { items: [item({ action })] });
        expect(entry().querySelector('[data-history-action]')!.textContent).toBe(label);
      });
    }
    it('shows the time, what changed, the quote, the category and code, and the id only as a detail', async () => {
      await create(false, { items: [HIDE], snapshot: SNAPSHOT });
      expect(entry().querySelector('time')!.textContent).toContain('2026');
      expect(entry().textContent).not.toContain('Invalid');
      expect(entry().querySelector('[data-history-summary]')!.textContent).toContain('visible → hidden');
      expect(entry().querySelector('blockquote')!.textContent).toBe('goes to');
      expect(entry().querySelector('[data-history-target]')!.textContent).toContain('AGR');
      expect(entry().querySelector('[data-history-target]')!.textContent).toContain('Grammar');
      expect(entry().querySelector('[data-history-target]')!.textContent).not.toContain('12345678');
      const id = entry().querySelector('[data-history-id]')!;
      expect(id.textContent).toBe('item 12345678');
      expect(id.classList.contains('history__id')).toBeTrue();
    });
    it('changed explanation', async () => {
      await create(false, { items: [item({ action: 'edit', changedFields: ['message'], before: { status: 'visible' }, after: { status: 'visible' } })] });
      expect(entry().querySelector('[data-history-summary]')!.textContent).toContain('changed explanation');
    });
    it('an unresolved item shows no category line and keeps the id', async () => {
      await create(false, { items: [item({ correctionId: 'gone', entryId: 'ann_gone1234' })], snapshot: SNAPSHOT });
      expect(entry().querySelector('[data-history-target]')).toBeNull();
      expect(entry().querySelector('[data-history-id]')!.textContent).toContain('gone1234');
    });
    it('text from the server is shown as text', async () => {
      await create(false, { items: [item({ before: { status: 'visible', anchor: { quotedText: '<img src=x onerror=alert(1)>' } }, after: { status: 'hidden', anchor: { quotedText: '<img src=x onerror=alert(1)>' } } })] });
      expect(entry().querySelector('img')).toBeNull();
      expect(entry().querySelector('blockquote')!.textContent).toContain('<img src=x');
    });
  });
});
