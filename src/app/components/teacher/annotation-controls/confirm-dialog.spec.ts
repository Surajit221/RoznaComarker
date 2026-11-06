import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `<button type="button" id="opener" (click)="open.set(true)">Open</button>
    <app-confirm-dialog [open]="open()" heading="Hide all Vocabulary corrections (2) from the student?" text="Scores do not change." confirmLabel="Hide all" [tone]="tone()"
      (confirmed)="events.push('confirmed'); open.set(false)" (cancelled)="events.push('cancelled'); open.set(false)" />`,
})
class Host { readonly open = signal(false); readonly tone = signal<'primary' | 'danger'>('primary'); readonly events: string[] = []; }

describe('ConfirmDialog', () => {
  let fixture: ComponentFixture<Host>, host: Host;
  const dialog = () => (fixture.nativeElement as HTMLElement).querySelector('dialog') as HTMLDialogElement;
  async function openIt(tone: 'primary' | 'danger' = 'primary') {
    host.tone.set(tone); host.open.set(true); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host); host = fixture.componentInstance; fixture.detectChanges();
  });
  afterEach(() => { host.open.set(false); fixture.detectChanges(); });

  it('opens as a modal labelled by its title, centred in the viewport (not the top-left corner)', async () => {
    await openIt();
    const d = dialog();
    expect(d.open).toBeTrue();
    expect(d.matches(':modal')).toBeTrue();
    expect(d.getAttribute('aria-labelledby')).toBe(d.querySelector('h2')!.id);
    expect(d.querySelector('h2')!.textContent).toContain('Hide all Vocabulary');
    d.style.animation = 'none';   // measure the resting position, not the 160 ms entrance
    const style = getComputedStyle(d), rect = d.getBoundingClientRect();
    expect(style.position).toBe('fixed');
    expect(Math.abs(rect.left - (window.innerWidth - rect.width) / 2)).toBeLessThan(2);
    expect(Math.abs(rect.top - (window.innerHeight - rect.height) / 2)).toBeLessThan(2);
    expect(rect.width).toBeLessThanOrEqual(420);
  });
  it('locks page scroll while open and restores it after', async () => {
    document.documentElement.style.overflow = '';
    await openIt();
    expect(document.documentElement.style.overflow).toBe('hidden');
    host.open.set(false); fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('');
    expect(dialog().open).toBeFalse();
  });
  it('Escape and a click on the backdrop cancel; the confirm button confirms', async () => {
    await openIt();
    const escape = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(escape); fixture.detectChanges();
    expect(escape.defaultPrevented).toBeTrue();
    await openIt();
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));   // target = the dialog itself = the backdrop area
    fixture.detectChanges();
    await openIt();
    dialog().querySelector<HTMLElement>('.confirm-dialog__card')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // inside the card: nothing
    expect(host.events).toEqual(['cancelled', 'cancelled']);
    dialog().querySelector<HTMLButtonElement>('[data-confirm-ok]')!.click(); fixture.detectChanges();
    expect(host.events).toEqual(['cancelled', 'cancelled', 'confirmed']);
  });
  it('keeps Tab inside, and a danger action starts on the safe button', async () => {
    await openIt('danger');
    const cancel = dialog().querySelector<HTMLButtonElement>('[data-confirm-cancel]')!, ok = dialog().querySelector<HTMLButtonElement>('[data-confirm-ok]')!;
    expect(document.activeElement).toBe(cancel);
    expect(ok.classList).toContain('confirm-dialog__button--danger');
    ok.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ok.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(cancel);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    cancel.dispatchEvent(back);
    expect(document.activeElement).toBe(ok);
  });
});
