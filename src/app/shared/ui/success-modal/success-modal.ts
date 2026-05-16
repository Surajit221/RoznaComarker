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
  selector: 'app-success-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './success-modal.html',
  styleUrl: './success-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuccessModal {
  @Input() title   = 'Success';
  @Input() message = '';
  @Input() show    = false;
  @Output() closed = new EventEmitter<void>();

  close(): void { this.closed.emit(); }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.show) this.close(); }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('sm-backdrop')) this.close();
  }
}
