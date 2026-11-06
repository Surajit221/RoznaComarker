import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, afterNextRender, effect, inject, input, output, untracked, viewChild } from '@angular/core';

let sequence = 0;

/**
 * The teacher editor's one confirm dialog (Remove, Hide selected, Hide all <category>, Restore all). A native modal <dialog>: it renders in
 * the browser's top layer (no transformed or clipping parent can move it) and makes the page behind it inert.
 * Centring: Tailwind's reset sets `margin: 0` on every element, which overrides the browser's `margin: auto` for modal dialogs and put the
 * old dialogs in the top-left corner; this component's CSS sets it back. Escape and a click on the backdrop cancel; Tab stays inside;
 * the page does not scroll behind it; focus goes back where it was (native <dialog> behaviour) when it closes.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog implements OnDestroy {
  readonly open = input(false);
  readonly heading = input('');
  readonly text = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  /** danger: a red confirm button, and focus starts on the safe choice. */
  readonly tone = input<'primary' | 'danger'>('primary');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  readonly titleId = `confirm-dialog-title-${++sequence}`;
  readonly textId = `confirm-dialog-text-${sequence}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly injector = inject(Injector);
  private savedOverflow: string | null = null;

  constructor() {
    effect(() => {
      const open = this.open(), dialog = this.dialog().nativeElement;
      untracked(() => { if (open) this.show(dialog); else this.hide(dialog); });
    });
  }

  ngOnDestroy(): void { this.unlockScroll(); }

  private show(dialog: HTMLDialogElement): void {
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    }
    this.lockScroll();
    afterNextRender(() => {
      const target = dialog.querySelector<HTMLElement>(this.tone() === 'danger' ? '[data-confirm-cancel]' : '[data-confirm-ok]');
      target?.focus();
    }, { injector: this.injector });
  }
  private hide(dialog: HTMLDialogElement): void {
    if (dialog.open) dialog.close();
    this.unlockScroll();
  }
  private lockScroll(): void {
    if (this.savedOverflow !== null || typeof document === 'undefined') return;
    this.savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  private unlockScroll(): void {
    if (this.savedOverflow === null || typeof document === 'undefined') return;
    document.documentElement.style.overflow = this.savedOverflow;
    this.savedOverflow = null;
  }

  /** Escape: the browser would close the dialog on its own; the owner decides instead. */
  onCancelEvent(event: Event): void { event.preventDefault(); this.cancelled.emit(); }
  /** The dialog element itself is only the backdrop area: its content sits in an inner card. */
  onDialogClick(event: MouseEvent): void { if (event.target === this.dialog().nativeElement) this.cancelled.emit(); }
  /** Tab and Shift+Tab cycle inside the dialog. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const buttons = [...this.dialog().nativeElement.querySelectorAll<HTMLElement>('button')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
