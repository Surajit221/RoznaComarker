import { Component, Input } from '@angular/core';
import { ImagePreflightResult } from '../../services/image-preflight.service';
import { AnalysisProgress } from '../analysis-progress/analysis-progress';

@Component({
  selector: 'app-image-quality-checklist',
  imports: [AnalysisProgress],
  template: `
    <section aria-label="Image requirements" class="checklist" [attr.aria-busy]="checking">
      <p class="heading">Image requirements</p>
      @if (checking) {
        @if (!handwritingChecking) {
          <p>{{ queued ? 'Waiting for the previous file check...' : 'Preparing image...' }}</p>
          <div class="reading-progress" role="progressbar" aria-label="Preparing image and checking quality"><span></span></div>
        }
      }
      @if (result) {
        <ul>
          @for (check of result.checks; track check.id) {
            <li [class.passed]="check.status === 'pass'" [class.failed]="check.status === 'fail'">
              <i class="bx" [class.bx-check-circle]="check.status === 'pass'"
                [class.bx-x-circle]="check.status === 'fail'"
                [class.bx-info-circle]="check.status === 'unavailable'" aria-hidden="true"></i>
              <div><span class="label">{{ check.label }} — {{ check.status === 'pass' ? 'Passed' :
                check.id === 'handwritingReadability' ? (check.status === 'checking' ? 'Checking' : check.status === 'fail' ? 'Needs a clearer image' : 'Temporarily unavailable') :
                check.status === 'fail' ? 'Needs attention' : check.required ? 'Could not check' : 'Check yourself' }}</span>
                @if (check.id === 'handwritingReadability' && handwritingChecking) {
                  <span class="reading-spinner" aria-hidden="true"></span>
                } @else if (check.id !== 'handwritingReadability' || check.status === 'pass' || !result.processingProgress) {
                  <p>{{ check.message }}</p>
                }
              </div>
            </li>
          }
        </ul>
      }
      @if (result?.processingProgress) {
        <app-analysis-progress [progress]="result?.processingProgress || null" [showCompleted]="true" [preflight]="true" />
      } @else if (handwritingChecking) {
        <div class="reading-progress" role="progressbar" aria-label="Checking handwriting readability">
          <span></span>
        </div>
        <p class="reading-stage" role="status" aria-live="polite" aria-atomic="true">{{ stageMessage }}</p>
        <p class="reading-help">You can leave this open while we check, or cancel to choose another image.</p>
      }
      @if (!result?.processingProgress && result?.sourceReadStatus !== 'FAILED_SERVICE' && result?.sourceReadStatus !== 'FAILED_IMAGE') { <p class="status" role="status" aria-live="polite" aria-atomic="true">{{ checking ? (handwritingChecking ? 'Checking handwriting readability...' : queued ? 'Waiting to check this file...' : 'Checking image quality...') :
        error ? error : result?.sourceReadStatus === 'FAILED_SERVICE' ? (result?.message || 'Handwriting verification is temporarily unavailable. Please try again.') : result?.ready ? (result?.sourceReadStatus === 'PASSED' ? 'Image checks complete. Ready to submit.' : 'Basic image checks passed. Review the items marked Check yourself before uploading.') :
        'Image needs attention. Retry the check or replace this photo.' }}</p> }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .checklist { background: #f8fafb; border: 1px solid #e7e7e7; border-radius: .75rem; padding: .75rem; font-size: .8125rem; color: #595959; overflow-wrap: anywhere; }
    .heading, .label, .status { font-weight: 600; }
    .heading { margin: 0 0 .5rem; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
    li { display: flex; gap: .5rem; align-items: start; }
    i { font-size: 1rem; flex: 0 0 auto; margin-top: .125rem; }
    p { margin: .125rem 0 0; }
    .passed { color: #006d6e; } .failed { color: #b42318; }
    .status { margin-top: .75rem; border-top: 1px solid #e7e7e7; padding-top: .5rem; }
    .reading-spinner { display: inline-block; width: .8rem; height: .8rem; margin-left: .4rem; vertical-align: middle; border: 2px solid #cce5e5; border-top-color: #006d6e; border-radius: 50%; animation: reading-spin 1s linear infinite; }
    .reading-progress { height: .25rem; margin-top: .75rem; overflow: hidden; border-radius: 1rem; background: #dcecec; }
    .reading-progress span { display: block; height: 100%; width: 35%; border-radius: inherit; background: #006d6e; animation: reading-slide 2s ease-in-out infinite; }
    .reading-stage { margin-top: .5rem; color: #006d6e; font-weight: 600; }
    .reading-help { margin-top: .25rem; }
    @keyframes reading-spin { to { transform: rotate(360deg); } }
    @keyframes reading-slide { from { transform: translateX(-110%); opacity: .5; } to { transform: translateX(390%); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .reading-spinner, .reading-progress span { animation: none; } }
  `,
})
export class ImageQualityChecklist {
  @Input() result?: ImagePreflightResult;
  @Input() checking = false;
  @Input() queued = false;
  @Input() error?: string;
  get stageMessage(): string { return this.handwritingChecking ? 'Image checks passed. Reading handwriting...' : ''; }

  get handwritingChecking(): boolean {
    return this.checking && this.result?.sourceReadStatus === 'CHECKING';
  }

}
