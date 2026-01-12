import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceService } from '../../../../services/device.service';
import { MembershipApiService, type JoinClassResponse } from '../../../../api/membership-api.service';
import { AlertService } from '../../../../services/alert.service';
import { QrScannerService } from '../../../../services/qr-scanner.service';

@Component({
  selector: 'app-join-class-form',
  imports: [CommonModule, FormsModule],
  templateUrl: './join-class-form.html',
  styleUrl: './join-class-form.css',
})
export class JoinClassForm implements AfterViewInit {
  @Output() joined = new EventEmitter<JoinClassResponse>();
  @Output() closed = new EventEmitter<void>();
  dismissible: any;
  device = inject(DeviceService);
  private membershipApi = inject(MembershipApiService);
  private alert = inject(AlertService);
  private qrScanner = inject(QrScannerService);
  private cdr = inject(ChangeDetectorRef);

  joinCode = '';
  isLoading = false;
  showQRScanner = false;
  private isScanning = false;

  async onFindClass() {
    if (this.isLoading) return;

    const joinCode = (this.joinCode || '').trim();
    if (!joinCode) {
      this.alert.showWarning('Join code required', 'Please enter a class code.');
      return;
    }

    this.isLoading = true;
    try {
      const resp = await this.membershipApi.joinClassByCode(joinCode);
      this.joined.emit(resp);
    } catch (err: any) {
      this.alert.showError('Failed to join class', err?.message || 'Please try again');
    } finally {
      this.isLoading = false;
    }
  }

  async onScanQR() {
    if (this.isLoading || this.isScanning) return;

    this.isScanning = true;
    this.showQRScanner = true;
    this.cdr.detectChanges(); // Ensure DOM is updated

    // Wait a bit for the DOM to render the modal
    setTimeout(async () => {
      try {
        const qrContent = await this.qrScanner.scanQRCode();
        const joinCode = this.qrScanner.extractJoinCode(qrContent);
        
        if (joinCode) {
          this.joinCode = joinCode;
          this.alert.showSuccess('QR Code Scanned', `Join code extracted: ${joinCode}`);
          this.closeQRScanner();
          // Auto-join after successful scan
          await this.onFindClass();
        } else {
          this.alert.showError('Invalid QR Code', 'This QR code does not contain a valid class join code');
        }
      } catch (err: any) {
        console.error('QR Scan Error:', err);
        this.alert.showError('QR Scan Failed', err?.message || 'Failed to scan QR code');
        this.closeQRScanner();
      } finally {
        this.isScanning = false;
      }
    }, 100); // Small delay to ensure DOM is ready
  }

  cancelQRScan() {
    this.closeQRScanner();
    this.isScanning = false;
  }

  switchToManual() {
    this.closeQRScanner();
    this.isScanning = false;
    // Focus on the input field
    setTimeout(() => {
      const input = document.querySelector('input[name="joinCode"]') as HTMLInputElement ||
                   document.querySelector('input[name="joinCodeMobile"]') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 100);
  }

  private closeQRScanner() {
    this.showQRScanner = false;
    this.cdr.detectChanges();
    
    // Clean up any remaining scanner instances
    setTimeout(() => {
      const qrReader = document.getElementById('qr-reader');
      if (qrReader) {
        qrReader.innerHTML = '';
      }
    }, 300);
  }

  ngAfterViewInit() {
    // Component is ready for QR scanning
  }

  closeDialog() {
    this.closed.emit();
  }
}
