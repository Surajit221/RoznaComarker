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
    this.closed.emit();
  }
}
