import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-bottomsheet-dialog',
  imports: [CommonModule],
  templateUrl: './bottomsheet-dialog.html',
  styleUrl: './bottomsheet-dialog.css',
})
export class BottomsheetDialog {
  @Input() open = false;
  /** false: the backdrop and Escape do not close the sheet (e.g. while files are uploading). Its own buttons still can. */
  @Input() dismissible = true;
  @Output() closed = new EventEmitter<void>();

  visible = false;
  show = false;

  ngOnChanges() {
    if (this.open) {
      this.visible = true;
      // sedikit delay untuk memicu animasi slide up
      setTimeout(() => (this.show = true), 10);
    } else {
      this.show = false;
      // tunggu transisi selesai baru sembunyikan DOM
      setTimeout(() => (this.visible = false), 300);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  close() {
    if (this.dismissible) this.closed.emit();
  }
}
