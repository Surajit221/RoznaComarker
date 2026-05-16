import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-error-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-modal.html',
  styleUrl: './error-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorModal {
  @Input() title   = 'Error';
  @Input() message = '';
  @Input() show    = false;
  @Output() closed = new EventEmitter<void>();

  close(): void { this.closed.emit(); }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.show) this.close(); }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('em-backdrop')) this.close();
  }
}
