import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalDialog } from './modal-dialog';
import { BottomsheetDialog } from '../bottomsheet-dialog/bottomsheet-dialog';

// Opt-in accessibility inputs: off by default, so every existing dialog stays exactly as it was.
describe('ModalDialog opt-in Esc and dialog semantics', () => {
  let fixture: ComponentFixture<ModalDialog>;
  let closed: number;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ModalDialog] });
    fixture = TestBed.createComponent(ModalDialog);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });
  const panel = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.bg-white')!;
  const esc = () => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); document.dispatchEvent(e); return e; };

  it('by default: Esc does nothing and the panel has no dialog role (unchanged)', () => {
    esc();
    expect(closed).toBe(0);
    expect(panel().hasAttribute('role')).toBeFalse();
    expect(panel().hasAttribute('aria-modal')).toBeFalse();
  });

  it('closeOnEscape: Esc emits closed once while open', () => {
    fixture.componentRef.setInput('closeOnEscape', true); fixture.detectChanges();
    esc();
    expect(closed).toBe(1);
    fixture.componentRef.setInput('open', false); fixture.detectChanges();
    esc();
    expect(closed).toBe(1);
  });

  it('closeOnEscape respects dismissible=false', () => {
    fixture.componentRef.setInput('closeOnEscape', true);
    fixture.componentRef.setInput('dismissible', false); fixture.detectChanges();
    esc();
    expect(closed).toBe(0);
  });

  it('labelledBy: role dialog, aria-modal and aria-labelledby on the panel', () => {
    fixture.componentRef.setInput('labelledBy', 'my-title'); fixture.detectChanges();
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('true');
    expect(panel().getAttribute('aria-labelledby')).toBe('my-title');
  });
});

describe('BottomsheetDialog opt-in dialog semantics', () => {
  it('labelledBy: role dialog, aria-modal and aria-labelledby on the sheet; nothing by default', () => {
    TestBed.configureTestingModule({ imports: [BottomsheetDialog] });
    const fixture = TestBed.createComponent(BottomsheetDialog);
    fixture.componentRef.setInput('open', true); fixture.detectChanges();
    const sheet = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.bg-white')!;
    expect(sheet().hasAttribute('role')).toBeFalse();
    fixture.componentRef.setInput('labelledBy', 'sheet-title'); fixture.detectChanges();
    expect(sheet().getAttribute('role')).toBe('dialog');
    expect(sheet().getAttribute('aria-modal')).toBe('true');
    expect(sheet().getAttribute('aria-labelledby')).toBe('sheet-title');
  });
});
