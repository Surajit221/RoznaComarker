import { Component, Input } from '@angular/core';
import { ImagePreflightResult } from '../../services/image-preflight.service';

@Component({
  selector: 'app-image-quality-checklist',
  template: `
    <section aria-label="Image requirements" class="checklist">
      <p class="heading">Image requirements</p>
      @if (checking) {
        <p>Checking orientation, resolution and exposure...</p>
      } @else if (result) {
        <ul>
          @for (check of result.checks; track check.id) {
            <li [class.passed]="check.status === 'pass'" [class.failed]="check.status === 'fail'">
              <i class="bx" [class.bx-check-circle]="check.status === 'pass'"
                [class.bx-x-circle]="check.status === 'fail'"
                [class.bx-info-circle]="check.status === 'unavailable'" aria-hidden="true"></i>
              <div><span class="label">{{ check.label }} — {{ check.status === 'pass' ? 'Passed' :
                check.status === 'fail' ? 'Needs attention' : check.required ? 'Could not check' : 'Check yourself' }}</span>
                <p>{{ check.message }}</p>
              </div>
            </li>
          }
        </ul>
      }
      <p class="status" role="status" aria-live="polite" aria-atomic="true">{{ checking ? 'Checking image quality...' :
        error ? error : result?.ready ? 'Basic image checks passed. Review the items marked Check yourself before uploading.' :
        'Image needs attention. Retry the check or replace this photo.' }}</p>
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
  `,
})
export class ImageQualityChecklist {
  @Input() result?: ImagePreflightResult;
  @Input() checking = false;
  @Input() error?: string;
}
