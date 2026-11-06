import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { CorrectionOverlay } from '../correction-overlay/correction-overlay';
import { TranscriptPageView } from '../../utils/transcript-page-views.util';
import type { SharedPageImages } from './shared-page-images';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-submission-page-review',
  standalone: true,
  imports: [CorrectionOverlay],
  template: `
    @if (activePage; as page) {
      <nav aria-label="PDF pages" class="flex items-center justify-between gap-3 mb-3">
        <button type="button" class="btn-info" [disabled]="index === 0" (click)="select(index - 1)">Previous page</button>
        <span role="status">Page {{ index + 1 }} of {{ pages.length }}</span>
        <button type="button" class="btn-info" [disabled]="index >= pages.length - 1" (click)="select(index + 1)">Next page</button>
      </nav>
      <app-correction-overlay [imageUrl]="imageUrl" [sourceLoading]="loading" [sourceLoadError]="failed"
        [annotations]="page.annotations" [ocrWords]="page.words" [page]="page.pageNumber"
        (retryRequested)="load()" alt="Submitted PDF page {{ page.pageNumber }}" />
    }
  `,
})
export class SubmissionPageReview implements OnChanges, OnDestroy {
  @Input() pages: TranscriptPageView[] = [];
  /** The teacher's page shares its downloaded page images with the review workspace. Unset on a student's page and in the preview. */
  @Input() imageStore: SharedPageImages | null = null;
  private readonly http = inject(HttpClient);
  private request?: Subscription;
  private loadedSource = '';
  private sharedSource = '';
  private sharedSequence = 0;
  private readonly changes = inject(ChangeDetectorRef);
  index = 0;
  imageUrl: string | null = null;
  loading = false;
  failed = false;
  get activePage(): TranscriptPageView | undefined { return this.pages[this.index]; }
  ngOnChanges(): void {
    if (this.index >= this.pages.length) this.index = 0;
    if ((this.activePage?.imageUrl || '') !== this.loadedSource) this.load();
  }
  select(index: number): void {
    if (index < 0 || index >= this.pages.length || index === this.index) return;
    this.index = index; this.load();
  }
  load(): void {
    if (this.imageStore) { void this.loadShared(); return; }
    this.request?.unsubscribe();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null; this.failed = false;
    this.loadedSource = this.activePage?.imageUrl || '';
    if (!this.loadedSource) { this.loading = false; return; }
    // Server-owned private asset routes only; no arbitrary external media URL.
    if (!/^\/files\/submissions\/[a-f0-9-]{36}\.jpg$/.test(this.loadedSource)) {
      this.failed = true; this.loading = false; return;
    }
    this.loading = true;
    this.request = this.http.get(`${environment.backendUrl.replace(/\/+$/, '')}${this.loadedSource}`, { responseType: 'blob' })
      .subscribe({ next: blob => { this.imageUrl = URL.createObjectURL(blob); this.loading = false; },
        error: () => { this.loading = false; this.failed = true; } });
  }
  private async loadShared(): Promise<void> {
    const source = this.activePage?.imageUrl || '', sequence = ++this.sharedSequence;
    if (this.sharedSource) this.imageStore!.release(this.sharedSource);
    this.sharedSource = source; this.loadedSource = source;
    this.imageUrl = null; this.failed = false; this.loading = Boolean(source);
    if (!source) return;
    try {
      const url = await this.imageStore!.acquire(source);
      if (sequence === this.sharedSequence) { this.imageUrl = url; this.loading = false; } else this.imageStore!.release(source);
    } catch {
      if (sequence === this.sharedSequence) { this.sharedSource = ''; this.loading = false; this.failed = true; }
    }
    this.changes.markForCheck();
  }
  ngOnDestroy(): void {
    this.sharedSequence++;
    if (this.imageStore) { if (this.sharedSource) this.imageStore.release(this.sharedSource); return; }
    this.request?.unsubscribe();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
  }
}
