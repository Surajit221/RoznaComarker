import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { QrCodeComponent } from 'ng-qrcode';
import { DeviceService } from '../../../../../services/device.service';
import { AlertService } from '../../../../../services/alert.service';

@Component({
  selector: 'app-dialog-qr-classes',
  imports: [QrCodeComponent],
  templateUrl: './dialog-qr-classes.html',
  styleUrl: './dialog-qr-classes.css',
})
export class DialogQrClasses {
  @Input() qrValue: string = '';
  @Input() classTitle: string = '';
  @Output() closed = new EventEmitter<void>();
  device = inject(DeviceService);
  private alert = inject(AlertService);
  dismissible: any;

  closeDialog() {
    this.closed.emit();
  }

  downloadQRCode() {
    try {
      // Find the QR code element
      const qrElement = document.querySelector('qr-code canvas') as HTMLCanvasElement;
      
      if (!qrElement) {
        this.alert.showError('Download Failed', 'QR code not found. Please try again.');
        return;
      }

      // Convert canvas to data URL
      const dataUrl = qrElement.toDataURL('image/png');
      
      // Create download link
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${this.classTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qr_code.png`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.alert.showSuccess('Download Successful', 'QR code has been downloaded successfully.');
    } catch (error: any) {
      this.alert.showError('Download Failed', error.message || 'Failed to download QR code. Please try again.');
    }
  }
}
