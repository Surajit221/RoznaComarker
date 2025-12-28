import { Component, EventEmitter, inject, Output } from '@angular/core';
import { DeviceService } from '../../../../services/device.service';

@Component({
  selector: 'app-join-class-form',
  imports: [],
  templateUrl: './join-class-form.html',
  styleUrl: './join-class-form.css',
})
export class JoinClassForm {
  @Output() closed = new EventEmitter<void>();
  dismissible: any;
  device = inject(DeviceService);

  closeDialog() {
    this.closed.emit();
  }
}
