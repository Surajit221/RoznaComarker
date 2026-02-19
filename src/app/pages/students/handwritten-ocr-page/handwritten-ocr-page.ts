import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { UploadApiService, type BackendHandwrittenUploadResponse } from '../../../api/upload-api.service';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';

import { environment } from '../../../../environments/environment';

import { ImageAnnotationOverlayComponent } from '../../../components/image-annotation-overlay/image-annotation-overlay';
import { TokenizedTranscript } from '../../../components/submission-details/tokenized-transcript/tokenized-transcript';

import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import type { OcrWord } from '../../../models/ocr-token.model';

@Component({
  selector: 'app-handwritten-ocr-page',
  imports: [CommonModule, ImageAnnotationOverlayComponent, TokenizedTranscript],
  templateUrl: './handwritten-ocr-page.html',
  styleUrl: './handwritten-ocr-page.css'
})
export class HandwrittenOcrPage {
  private uploadApi = inject(UploadApiService);
  private alert = inject(AlertService);
  private http = inject(HttpClient);
  device = inject(DeviceService);

  selectedFile: File | null = null;

  isLoading = false;
  uploadProgressPercent: number | null = null;

  fileUrl: string | null = null;
  private objectUrl: string | null = null;
  private rawFileUrl: string | null = null;
  ocrText: string | null = null;
  ocrError: string | null = null;

  submissionId: string | null = null;

  ocrWords: OcrWord[] = [];
  annotations: FeedbackAnnotation[] = [];

  correctionsError: string | null = null;
  isCorrectionsLoading = false;

  ngOnDestroy() {
    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl);
      } catch {
        // ignore
      }
    }
  }

  async onOpenUploadedPdf(event: Event) {
    event.preventDefault();

    const rawUrl = this.rawFileUrl;
    if (!rawUrl) {
      this.alert.showWarning('PDF not available', 'Please try again');
      return;
    }

    try {
      const blob = await firstValueFrom(this.http.get(rawUrl, { responseType: 'blob' }));
      const objectUrl = URL.createObjectURL(blob);

      // Allow the new tab time to load the PDF before revoking.
      setTimeout(() => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }, 60000);

      window.open(objectUrl, '_blank', 'noopener');
    } catch {
      this.alert.showError('Failed to open PDF', 'Please try again');
    }
  }

  private async setFileUrl(url: string | null) {
    this.rawFileUrl = url;
    this.fileUrl = null;

    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl);
      } catch {
        // ignore
      }
      this.objectUrl = null;
    }

    if (!url) return;

    try {
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      this.objectUrl = URL.createObjectURL(blob);
      this.fileUrl = this.objectUrl;
    } catch {
      this.fileUrl = null;
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    this.selectedFile = file;

    this.setFileUrl(null);
    this.ocrText = null;
    this.ocrError = null;

    this.submissionId = null;
    this.ocrWords = [];
    this.annotations = [];
    this.correctionsError = null;
    this.isCorrectionsLoading = false;

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
    await this.setFileUrl(null);
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
              this.setFileUrl(body.fileUrl)
                .then(() => {
                  this.submissionId = body.submissionId || null;
                  this.ocrText = body.ocrText || null;
                  this.ocrError = body.ocrError || null;
                  resolve();
                  subscription.unsubscribe();
                })
                .catch((err) => {
                  subscription.unsubscribe();
                  reject(err);
                });
            }
          },
          error: (err) => {
            subscription.unsubscribe();
            reject(err);
          }
        });
      });

      if (!this.ocrError && this.submissionId) {
        await this.loadOcrCorrectionsWithRetry(this.submissionId);
      }

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

  private async loadOcrCorrectionsWithRetry(submissionId: string) {
    if (this.isCorrectionsLoading) return;

    this.isCorrectionsLoading = true;
    this.correctionsError = null;

    const delays = [0, 1200, 2000, 3000, 5000];
    try {
      for (let i = 0; i < delays.length; i += 1) {
        const delayMs = delays[i];
        if (delayMs) {
          await new Promise((r) => setTimeout(r, delayMs));
        }

        try {
          const ok = await this.loadOcrCorrections(submissionId);
          if (ok) return;
        } catch (err: any) {
          const status = err?.status || err?.error?.status;
          const msg = err?.error?.message || err?.message || 'Failed to load OCR corrections';

          if (status === 409) {
            continue;
          }

          this.correctionsError = msg;
          return;
        }
      }

      this.correctionsError = 'OCR corrections are not ready yet. Please try again in a moment.';
    } finally {
      this.isCorrectionsLoading = false;
    }
  }

  private async loadOcrCorrections(submissionId: string): Promise<boolean> {
    const apiBaseUrl = `${environment.apiUrl}/api`;
    const resp = await firstValueFrom(
      this.http.post<any>(`${apiBaseUrl}/submissions/${submissionId}/ocr-corrections`, {})
    );

    const success = Boolean(resp && (resp as any).success);
    const data = resp && typeof resp === 'object' ? (resp as any).data : null;
    if (!success || !data) return false;

    const corrections: any[] = Array.isArray((data as any).corrections) ? (data as any).corrections : [];
    const ocrPages: any[] = Array.isArray((data as any).ocr) ? (data as any).ocr : [];

    const words: OcrWord[] = [];
    for (const p of ocrPages) {
      const pageWords = p && Array.isArray(p.words) ? p.words : [];
      for (const w of pageWords) {
        const id = typeof w?.id === 'string' ? w.id : '';
        const text = typeof w?.text === 'string' ? w.text : '';
        const bbox = w?.bbox && typeof w.bbox === 'object'
          ? { x: Number(w.bbox.x), y: Number(w.bbox.y), w: Number(w.bbox.w), h: Number(w.bbox.h) }
          : null;
        if (!id || !text) continue;
        if (bbox && ![bbox.x, bbox.y, bbox.w, bbox.h].every((v) => Number.isFinite(v))) {
          words.push({ id, text, bbox: null });
        } else {
          words.push({ id, text, bbox });
        }
      }
    }

    this.ocrWords = words;

    this.annotations = corrections.map((c: any) => ({
      _id: c && c.id ? String(c.id) : '',
      submissionId,
      page: typeof c?.page === 'number' && Number.isFinite(c.page) ? c.page : 1,
      wordIds: Array.isArray(c?.wordIds) ? c.wordIds : [],
      bboxList: Array.isArray(c?.bboxList) ? c.bboxList : [],
      group: typeof c?.category === 'string' ? c.category : (typeof c?.group === 'string' ? c.group : ''),
      symbol: typeof c?.symbol === 'string' ? c.symbol : '',
      color: typeof c?.color === 'string' ? c.color : '#FF0000',
      message: typeof c?.message === 'string' ? c.message : '',
      suggestedText: typeof c?.suggestedText === 'string' ? c.suggestedText : '',
      startChar: typeof c?.startChar === 'number' ? c.startChar : undefined,
      endChar: typeof c?.endChar === 'number' ? c.endChar : undefined,
      source: 'AI' as const,
      editable: Boolean(c?.editable)
    }));

    return true;
  }
}
