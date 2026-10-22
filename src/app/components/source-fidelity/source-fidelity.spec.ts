import { TestBed } from '@angular/core/testing';
import { SourceFidelityComponent, SourceFidelity } from './source-fidelity';
describe('exact source display',()=>{
  const value: SourceFidelity={mode:'astra_verified',status:'MODEL_AGREED',assessmentAllowed:true,
    transcriptExact:'  sence\nSocial ,free\n<script>alert(1)</script>',pages:[]};
  it('preserves whitespace and line breaks as inert text, never HTML',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.componentInstance.source=value;f.detectChanges();
    expect(f.nativeElement.querySelector('.source-text').textContent).toBe(value.transcriptExact);
    expect(f.nativeElement.querySelector('script')).toBeNull();
    expect(getComputedStyle(f.nativeElement.querySelector('.source-text')).whiteSpace).toBe('pre-wrap');
    expect(f.nativeElement.textContent).toContain('not human verification');
  });
  it('shows provisional reading and review required without scoring',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.componentInstance.source={...value,status:'OCR_UNCERTAIN',assessmentAllowed:false,
      pages:[{fileId:'a',pageNumber:1,textExact:'sence',status:'OCR_UNCERTAIN',disagreementCount:2}]};f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Source review required');
    expect(f.nativeElement.textContent).toContain('provisional Astra');expect(f.nativeElement.textContent).toContain('2 disagreement');
    expect(f.nativeElement.querySelector('.source-text').textContent).toBe('sence');
  });
  it('does not change legacy rendering when absent',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.detectChanges();expect(f.nativeElement.querySelector('section')).toBeNull();
  });
  it('urgent student view is read-only with a clear teacher verification status',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.componentInstance.source={...value,mode:'astra_human_confirm',status:'HUMAN_REVIEW_REQUIRED',assessmentAllowed:false};f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Source transcription is awaiting teacher verification.');
    expect(f.nativeElement.textContent).not.toContain('disagreement diagnostics');expect(f.nativeElement.querySelector('app-human-source-review')).toBeNull();
  });
  it('distinguishes complete page human authority from mapped-region provenance',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.componentInstance.source={...value,status:'HUMAN_VERIFIED',pages:[
      {fileId:'a',pageNumber:1,textExact:'literal',status:'HUMAN_VERIFIED',disagreementCount:0,verificationStage:'PAGE_HUMAN_VERIFIED'}]};
    f.detectChanges();expect(f.nativeElement.textContent).toContain('entire active page transcript was explicitly human-verified');
  });
  it('wraps long source lines in a narrow mobile viewport',()=>{
    const f=TestBed.createComponent(SourceFidelityComponent);f.componentInstance.source={...value,transcriptExact:'x'.repeat(300)};
    f.nativeElement.style.width='280px';f.detectChanges();
    const text=f.nativeElement.querySelector('.source-text');
    expect(getComputedStyle(text).overflowWrap).toBe('anywhere');
    expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth + 1);
  });
});
