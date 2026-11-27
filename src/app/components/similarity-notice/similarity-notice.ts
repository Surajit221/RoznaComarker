import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { SimilarityNoticeService } from '../../services/similarity-notice.service';

/** The similarity notice line on the essay upload form (student and guest). Nothing at all while the feature is off. Text by interpolation. */
@Component({
  selector: 'app-similarity-notice',
  template: `@if (text) { <p class="similarity-notice" role="note"><span aria-hidden="true">ⓘ </span>{{ text }}</p> }`,
  styles: [`.similarity-notice { margin: 8px 0 0; font-size: 0.8125rem; line-height: 1.45; color: var(--color-text-muted, #4b5563); }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimilarityNotice implements OnInit {
  private readonly notice = inject(SimilarityNoticeService);
  private readonly cdr = inject(ChangeDetectorRef);
  text = '';

  async ngOnInit(): Promise<void> {
    const notice = await this.notice.load();
    if (!notice) return;
    this.text = notice.text;
    this.notice.markShown(notice.version);
    this.cdr.markForCheck();
  }
}
