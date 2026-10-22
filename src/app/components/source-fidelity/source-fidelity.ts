import { Component, Input, Output, EventEmitter } from '@angular/core';
import { HumanSourceReview } from './human-source-review';
export type SourceFidelity = {
  mode: string; status: 'ASTRA_PROVISIONAL' | 'MODEL_AGREED' | 'OCR_UNCERTAIN' | 'PROVIDER_FAILED' | 'SOURCE_UNREADABLE' | 'HUMAN_REVIEW_REQUIRED' | 'HUMAN_VERIFIED';
  humanReview?: {required:boolean;total:number;resolved:number;unresolved:number;unavailable:number};
  transcriptExact: string; transcriptSha256?: string; version?: string; assessmentAllowed: boolean;
  pages: Array<{ fileId: string; pageNumber: number; textExact: string; status: string; disagreementCount: number; verificationStage?:string }>;
};
@Component({
  selector: 'app-source-fidelity',
  imports:[HumanSourceReview],
  template: `@if (source) {
    <section class="source-card" aria-label="Exact source transcription">
      <h2>Exact source transcription</h2>
      @if (source.mode === 'astra_human_confirm') {
        <p role="status">{{ source.assessmentAllowed ? 'Source transcription verified by your teacher.' : 'Source transcription is awaiting teacher verification.' }}</p>
      } @else {
      <p role="status"><strong>{{ source.status }}</strong> · {{ disagreements }} disagreement diagnostics</p>
      @if (source.status === 'MODEL_AGREED') {
        <p>Both independent model readings agree. This is not human verification.</p>
      } @else if (source.status === 'HUMAN_VERIFIED') {
        <p>Blocking source regions were explicitly human-verified. Other source spans retain their model provenance.</p>
      } @else if (source.status === 'HUMAN_REVIEW_REQUIRED' && source.humanReview?.resolved) {
        <p>Source review required. Confirmed spans retain human provenance; remaining spans are provisional. Corrections and scoring are blocked.</p>
      } @else {
        <p>Source review required. This is the provisional Astra reading. Corrections and scoring are blocked.</p>
      }
      }
      @if (!source.assessmentAllowed && submissionId) { <app-human-source-review [submissionId]="submissionId" [mandatoryFullPage]="source.mode === 'astra_human_confirm'" (sourceChanged)="sourceChanged.emit($event)" /> }
      @if (!source.assessmentAllowed && !submissionId) { <p>Your teacher must confirm unresolved handwriting before assessment continues.</p> }
      @for (page of source.pages; track $index) {
        <h3>Page {{ $index + 1 }} · {{ page.status }}</h3>
        @if (page.verificationStage === 'PAGE_HUMAN_VERIFIED') { <p>The entire active page transcript was explicitly human-verified.</p> }
        <div class="source-text" [textContent]="page.textExact"></div>
      } @empty { <div class="source-text" [textContent]="source.transcriptExact"></div> }
    </section>
  }`,
  styles: [`:host{display:block;min-width:0}.source-card{background:white;border:1px solid #d1e4e3;border-radius:1rem;padding:clamp(1rem,3vw,1.5rem);margin:1rem 0;color:#263b3b;max-width:100%;min-width:0}.source-card h2{font-size:1.25rem;font-weight:700}.source-card h3{font-weight:600;margin-top:1rem}.source-card p{margin:.5rem 0}.source-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-family:inherit}`]
})
export class SourceFidelityComponent {
  @Input() source: SourceFidelity | null | undefined;
  @Input() submissionId: string | undefined;
  @Output() sourceChanged=new EventEmitter<SourceFidelity>();
  get disagreements(): number { return this.source?.pages.reduce((n,p) => n + p.disagreementCount, 0) || 0; }
}
