import { ChangeDetectionStrategy, Component, OnChanges, SimpleChanges, inject, input, signal } from '@angular/core';
import { WritingModelApiService } from '../../../api/writing-model-api.service';

/**
 * The approved Improved Writing Model for the student's (or guest's) own submission, shown only when the backend says it is available:
 * otherwise nothing is rendered (feature off, not approved, not released yet, or any error). A learning reference; plain text only.
 */
@Component({
  selector: 'app-writing-model-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as model) {
      <section class="wm-card" aria-labelledby="wm-card-title" data-writing-model-card>
        <h2 id="wm-card-title" class="wm-card__title">Improved Writing Model</h2>
        <p class="wm-card__note">An improved version of your own writing, from your teacher, for you only. Compare it with your draft to see what to improve. It does not change your writing or your assessment.</p>
        <div class="wm-card__text">{{ model }}</div>
      </section>
    }`,
  styles: [`
    :host { display: block; }
    .wm-card { margin: 1.5rem 0; padding: 1.25rem 1.5rem; border: 1px solid #cfe3e3; border-radius: 1rem; background: #fff; color: #172b2b; }
    .wm-card__title { margin: 0 0 .25rem; font-size: 1.25rem; font-weight: 700; }
    .wm-card__note { margin: 0 0 .75rem; padding: .5rem .75rem; border-radius: .5rem; background: #f0fdfa; color: #134e4a; font-size: .9rem; }
    .wm-card__text { white-space: pre-line; line-height: 1.7; overflow-wrap: anywhere; }
    @media (max-width: 480px) { .wm-card { padding: 1rem; } }
  `],
})
export class WritingModelCard implements OnChanges {
  readonly submissionId = input<string | null>(null);
  /** Changes when the submission does (a new draft can make it available). */
  readonly refreshKey = input<string | number | null>(null);
  private readonly api = inject(WritingModelApiService);
  readonly text = signal<string | null>(null);
  private version = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] || changes['refreshKey']) void this.load();
  }
  private async load(): Promise<void> {
    const version = ++this.version, id = this.submissionId();
    this.text.set(null);
    if (!id) return;
    try {
      const result = await this.api.forSubmission(id);
      if (version === this.version) this.text.set(result?.available && result.text ? result.text : null);
    } catch { /* not shown: the result page works without it */ }
  }
}
