import { Injectable } from '@angular/core';
import { AlertService } from './alert.service';
import { ErrorHandlerService, ErrorContext } from './error-handler.service';

@Injectable({
  providedIn: 'root'
})
export class QrScannerService {
  constructor(
    private alert: AlertService,
    private errorHandler: ErrorHandlerService
  ) {}

  async scanQRCode(): Promise<string> {
    const context: ErrorContext = {
      operation: 'QR Code Scanning',
      component: 'QrScannerService'
    };

    return new Promise((resolve, reject) => {
      // Check if running on mobile device with Capacitor
      if (this.isCapacitorAvailable()) {
        this.scanWithCapacitor(resolve, reject, context);
      } else {
        this.scanWithWebCam(resolve, reject, context);
      }
    });
  }

  private isCapacitorAvailable(): boolean {
    return typeof (window as any).Capacitor !== 'undefined' && 
           typeof (window as any).CapacitorCore !== 'undefined';
  }

  private async scanWithCapacitor(resolve: Function, reject: Function, context: ErrorContext) {
    try {
      // Try to import Capacitor barcode scanner
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      
      // Check camera permissions
      const permission = await BarcodeScanner.checkPermissions();
      if (!permission.camera) {
        const granted = await BarcodeScanner.requestPermissions();
        if (!granted.camera) {
          this.errorHandler.handleError(
            new Error('Camera permission denied'),
            { ...context, operation: 'Camera Permission Request' }
          );
          return;
        }
      }

      // Start scanning
      await BarcodeScanner.startScan();
      
      BarcodeScanner.addListener('barcodesScanned', (result: any) => {
        if (result && result.barcodes && result.barcodes.length > 0) {
          const barcode = result.barcodes[0];
          if (barcode.displayValue) {
            BarcodeScanner.stopScan();
            resolve(barcode.displayValue);
          }
        }
      });

    } catch (error: any) {
      // Fallback to web scanner if Capacitor is not available
      console.warn('Capacitor QR scanner not available, falling back to web camera:', error);
      this.scanWithWebCam(resolve, reject, context);
    }
  }

  private async scanWithWebCam(resolve: Function, reject: Function, context: ErrorContext) {
    try {
      // Check if the QR reader element exists
      const qrReaderElement = document.getElementById('qr-reader');
      if (!qrReaderElement) {
        throw new Error('QR scanner container not found. Please ensure the modal is open and the element exists in the DOM.');
      }

      // Clear any existing content
      qrReaderElement.innerHTML = '';

      const { Html5QrcodeScanner } = await import('html5-qrcode');
      
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          supportedScanTypes: [0] // 0 = QR_CODE
        },
        false
      );

      scanner.render(
        (decodedText: string) => {
          scanner.clear();
          resolve(decodedText);
        },
        (error: any) => {
          // Only log errors that aren't just "no QR code found"
          if (!error?.message?.includes('No QR code found') && 
              !error?.message?.includes('NotFoundException')) {
            console.warn('QR scan error:', error);
          }
        }
      );

    } catch (error: any) {
      console.error('Web Camera QR Scanner Error:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to initialize QR scanner';
      if (error?.message?.includes('not found')) {
        errorMessage = 'QR scanner container not found. Please try again.';
      } else if (error?.message?.includes('Permission')) {
        errorMessage = 'Camera permission denied. Please allow camera access and try again.';
      } else if (error?.message?.includes('NotAllowedError')) {
        errorMessage = 'Camera access was denied. Please check your browser permissions.';
      } else if (error?.message?.includes('NotFoundError')) {
        errorMessage = 'No camera found. Please ensure your device has a camera.';
      } else if (error?.message?.includes('NotSupportedError')) {
        errorMessage = 'Camera not supported in this browser. Please try a different browser.';
      }

      this.errorHandler.handleError(
        new Error(errorMessage),
        { ...context, operation: 'Web Camera QR Scanner Initialization' }
      );
      reject(new Error(errorMessage));
    }
  }

  extractJoinCode(qrContent: string): string | null {
    if (!qrContent) return null;

    // Handle URL format: https://myfrontend.com/student/join-class?joinCode=ABC123
    if (qrContent.includes('joinCode=')) {
      const url = new URL(qrContent);
      return url.searchParams.get('joinCode');
    }

    // Handle direct join code
    if (qrContent.match(/^[A-Z0-9]{6,12}$/i)) {
      return qrContent;
    }

    return null;
  }
}
