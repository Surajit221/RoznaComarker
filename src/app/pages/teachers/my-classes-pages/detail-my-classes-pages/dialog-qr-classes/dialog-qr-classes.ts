import { Component, EventEmitter, inject, Output } from '@angular/core';
import { QrCodeComponent } from 'ng-qrcode';
import { DeviceService } from '../../../../../services/device.service';

@Component({
  selector: 'app-dialog-qr-classes',
  imports: [QrCodeComponent],
  templateUrl: './dialog-qr-classes.html',
  styleUrl: './dialog-qr-classes.css',
})
export class DialogQrClasses {
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);
  dismissible: any;

  closeDialog() {
    this.closed.emit();
  }
}
