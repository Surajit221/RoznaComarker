import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-modal-dialog',
  imports: [CommonModule],
  templateUrl: './modal-dialog.html',
  styleUrl: './modal-dialog.css',
})
export class ModalDialog {
  /** Apakah dialog sedang terbuka */
  @Input() open = false;

  @Input() panelClass = '';

  @Input() maxWidthClass = 'max-w-[650px]';

  /** Apakah backdrop bisa di-klik untuk menutup dialog */
  @Input() dismissible = true;

  /** Opt-in (off by default, so existing dialogs are unchanged): Escape closes like the backdrop (respects dismissible). */
  @Input() closeOnEscape = false;

  /** Opt-in: the id of the visible title. Gives the panel role="dialog", aria-modal="true" and aria-labelledby. */
  @Input() labelledBy: string | null = null;

  /** Emit ketika dialog ditutup */
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open && this.closeOnEscape) this.closeDialog();
  }

  closeDialog() {
    if (this.dismissible) this.closed.emit();
  }
}
