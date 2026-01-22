import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject } from '@angular/core';

import { UploadApiService, type BackendHandwrittenUploadResponse } from '../../../api/upload-api.service';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-handwritten-ocr-page',
  imports: [CommonModule],
  templateUrl: './handwritten-ocr-page.html',
  styleUrl: './handwritten-ocr-page.css'
})
export class HandwrittenOcrPage {
  private uploadApi = inject(UploadApiService);
  private alert = inject(AlertService);
  device = inject(DeviceService);

  selectedFile: File | null = null;

  isLoading = false;
  uploadProgressPercent: number | null = null;

  fileUrl: string | null = null;
  ocrText: string | null = null;
  ocrError: string | null = null;

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    this.selectedFile = file;

    this.fileUrl = null;
    this.ocrText = null;
    this.ocrError = null;

    if (input) input.value = '';
  }

  get isPdf(): boolean {
    const name = (this.selectedFile?.name || '').toLowerCase();
    return name.endsWith('.pdf') || this.selectedFile?.type === 'application/pdf';
  }

  async uploadAndOcr() {
    if (!this.selectedFile) {
      this.alert.showWarning('No file selected', 'Please select a JPG, PNG, or PDF file.');
      return;
    }

    if (this.isLoading) return;

    this.isLoading = true;
    this.uploadProgressPercent = 0;
    this.fileUrl = null;
    this.ocrText = null;
    this.ocrError = null;

    try {
      await new Promise<void>((resolve, reject) => {
        const subscription = this.uploadApi.uploadHandwrittenForOcr(this.selectedFile as File).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress) {
              const total = typeof event.total === 'number' ? event.total : null;
              const percent = total ? Math.round((100 * event.loaded) / total) : null;
              this.uploadProgressPercent = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0;
              return;
            }

            if (event.type === HttpEventType.Response) {
              const body = event.body as BackendHandwrittenUploadResponse | null;
              if (!body || body.success !== true) {
                reject(new Error(body?.message || 'Upload failed'));
                subscription.unsubscribe();
                return;
              }

              this.uploadProgressPercent = 100;
              this.fileUrl = body.fileUrl;
              this.ocrText = body.ocrText || null;
              this.ocrError = body.ocrError || null;

              resolve();
              subscription.unsubscribe();
            }
          },
          error: (err) => {
            subscription.unsubscribe();
            reject(err);
          }
        });
      });

      if (this.ocrError) {
        this.alert.showWarning('OCR failed', this.ocrError);
      } else {
        this.alert.showToast('Upload successful', 'success');
      }
    } catch (err: any) {
      const message = err?.error?.message || err?.message || 'Please try again';
      this.alert.showError('Upload failed', message);
    } finally {
      this.isLoading = false;
    }
  }
}
