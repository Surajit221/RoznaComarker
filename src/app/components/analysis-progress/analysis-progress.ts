import { Component, Input } from '@angular/core';

export interface ProcessingProgress {
  status: 'processing' | 'completed' | 'failed' | 'partial';
  stage: string;
  percent: number;
  message: string;
  completed: boolean;
  failed: boolean;
  active: boolean;
}

@Component({
  selector: 'app-analysis-progress',
  template: `
    @if (progress; as p) {
      @if (!p.completed || showCompleted) {
        <section class="analysis-progress" [class.failed]="p.failed" [attr.aria-busy]="p.active">
          <p class="stage" role="status" aria-live="polite" aria-atomic="true">{{ p.message }}
            @if (!p.failed && p.status !== 'partial') { <span>{{ p.percent }}%</span> }
          </p>
          @if (!p.failed && p.status !== 'partial') {
            <div class="track" [class.active]="p.active" role="progressbar" aria-label="Completed processing stages"
              aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="p.percent" [attr.aria-valuetext]="p.message">
              <span [style.width.%]="p.percent"></span>
            </div>
          }
          @if (p.active) { <p class="help">{{ preflight ? 'Reading the handwritten content. This can take a little time.' : 'Your submission is saved. Progress reflects completed stages, not an estimated completion time.' }}</p> }
        </section>
      }
    }
  `,
  styles: `
    :host { display:block; min-width:0; }
    .analysis-progress { margin:.75rem 0; padding:.85rem 1rem; border:1px solid #dce9e9; border-radius:.75rem; background:#f8fafb; color:#006d6e; overflow-wrap:anywhere; }
    .stage { display:flex; flex-wrap:wrap; justify-content:space-between; gap:.35rem 1rem; margin:0; font-size:.875rem; font-weight:600; }
    .stage span { white-space:nowrap; }
    .track { height:.4rem; margin-top:.6rem; background:#dcecec; border-radius:1rem; overflow:hidden; }
    .track span { display:block; height:100%; background:#006d6e; border-radius:inherit; }
    .track.active span { background-image:linear-gradient(110deg,transparent 25%,#ffffff66 50%,transparent 75%); background-size:200% 100%; animation:activity 2s linear infinite; }
    .help { margin:.5rem 0 0; color:#595959; font-size:.8125rem; }
    .failed { color:#b42318; border-color:#f4cbc7; }
    @keyframes activity { to { background-position:-200% 0; } }
    @media (prefers-reduced-motion:reduce) { .track.active span { animation:none; } }
  `,
})
export class AnalysisProgress {
  @Input() progress: ProcessingProgress | null = null;
  @Input() showCompleted = false;
  @Input() preflight = false;
}
