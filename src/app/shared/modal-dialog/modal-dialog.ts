import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

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

  /** Emit ketika dialog ditutup */
  @Output() closed = new EventEmitter<void>();

  closeDialog() {
    if (this.dismissible) this.closed.emit();
  }
}
