import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { UnsplashService, UnsplashImage } from '../../../services/unsplash.service';

@Component({
  selector: 'app-unsplash-image-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './unsplash-image-modal.html',
  styleUrl: './unsplash-image-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnsplashImageModal implements OnChanges, OnDestroy {
  @Input() show = false;
  @Output() showChange = new EventEmitter<boolean>();
  @Output() imageSelected = new EventEmitter<string>();

  private readonly unsplashService = inject(UnsplashService);
  private readonly cdr = inject(ChangeDetectorRef);

  searchQuery = '';
  images: UnsplashImage[] = [];
  isLoading = false;
  error: string | null = null;

  /** Fixed array for skeleton cards so *ngFor doesn't recalculate */
  readonly skeletonItems = Array(12).fill(0);

  /** Quick-search suggestion chips */
  readonly suggestions = [
    'Education',
    'Science',
    'Mathematics',
    'History',
    'Biology',
    'English',
    'Technology',
    'Nature',
  ];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnChanges(): void {
    if (this.show) {
      // Pre-warm common topics so first click feels instant
      this.unsplashService.prewarm();
    }
  }

  ngOnDestroy(): void {
    this.clearDebounce();
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /** Called on every keystroke — debounces 400 ms then fires search */
  onSearchInput(): void {
    this.clearDebounce();
    const q = this.searchQuery.trim();
    if (!q) {
      this.error = null;
      return;
    }
    this.debounceTimer = setTimeout(() => this.performSearch(), 400);
  }

  /** Called on Enter key or Search button click — searches immediately */
  searchImages(): void {
    this.clearDebounce();
    this.performSearch();
  }

  /** Search a suggestion chip */
  searchSuggestion(topic: string): void {
    this.searchQuery = topic;
    this.clearDebounce();
    this.performSearch();
  }

  private async performSearch(): Promise<void> {
    const q = this.searchQuery.trim();
    if (!q) {
      this.error = 'Please enter a search term';
      this.cdr.markForCheck();
      return;
    }

    console.time(`[UNSPLASH MODAL] Search "${q}"`);
    const t0 = performance.now();

    this.isLoading = true;
    this.error = null;
    this.images = [];
    this.cdr.markForCheck();

    try {
      const response = await firstValueFrom(this.unsplashService.searchImages(q, 12));
      this.images = response.data ?? [];

      const elapsed = Math.round(performance.now() - t0);
      console.timeEnd(`[UNSPLASH MODAL] Search "${q}"`);
      console.log(`[UNSPLASH MODAL] Rendered ${this.images.length} images in ${elapsed} ms`);

      if (this.images.length === 0) {
        this.error = `No images found for "${q}". Try a different keyword.`;
      }
    } catch (err: any) {
      console.error('[UNSPLASH MODAL] Search error:', err);
      this.error =
        err?.error?.message ?? err?.message ?? 'Failed to search images. Please try again.';
      this.images = [];
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ── Selection & close ────────────────────────────────────────────────────

  selectImage(imageUrl: string): void {
    console.log('[UNSPLASH MODAL] Image selected:', imageUrl);
    this.imageSelected.emit(imageUrl);
    this.close();
  }

  close(): void {
    this.clearDebounce();
    this.show = false;
    this.showChange.emit(false);
    this.searchQuery = '';
    this.images = [];
    this.error = null;
    this.isLoading = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('uim-backdrop')) {
      this.close();
    }
  }

  trackById(_: number, img: UnsplashImage): string {
    return img.id;
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
