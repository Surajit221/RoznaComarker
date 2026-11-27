import { Injectable, inject } from '@angular/core';
import { SimilarityApiService } from '../api/similarity-api.service';

/**
 * The essay similarity notice for the upload pages (student and guest). Loaded once; null while the feature is off. The version the page
 * actually showed is sent with the upload (similarityNoticeVersion), so the server stores only a notice that was on screen.
 */
@Injectable({ providedIn: 'root' })
export class SimilarityNoticeService {
  private readonly api = inject(SimilarityApiService);
  private pending: Promise<{ version: string; text: string } | null> | null = null;
  private shown: string | null = null;

  load(): Promise<{ version: string; text: string } | null> {
    this.pending ||= this.api.notice().catch(() => null);
    return this.pending;
  }
  markShown(version: string): void { this.shown = version; }
  /** The version on screen, or null: the upload sends it only then. */
  get shownVersion(): string | null { return this.shown; }
  /** Adds the shown version to an upload form (nothing when no notice was shown). */
  appendTo(form: FormData): void { if (this.shown) form.append('similarityNoticeVersion', this.shown); }
}
