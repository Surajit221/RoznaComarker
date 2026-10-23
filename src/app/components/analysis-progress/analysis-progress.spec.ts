import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AnalysisProgress, type ProcessingProgress } from './analysis-progress';
const state=(overrides:Partial<ProcessingProgress>={}):ProcessingProgress=>({status:'processing',stage:'corrections',percent:50,
  message:'Analyzing writing corrections',active:true,failed:false,completed:false,...overrides});
describe('AnalysisProgress',()=>{
  it('wraps safely at a narrow mobile width',()=>{
    const fixture=TestBed.createComponent(AnalysisProgress);
    fixture.nativeElement.style.display='block';fixture.nativeElement.style.width='280px';
    fixture.componentRef.setInput('progress',state({message:'Reading handwriting and verifying the submitted writing carefully'}));fixture.detectChanges();
    const panel=fixture.nativeElement.querySelector('section') as HTMLElement;
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth+1);
  });
  it('renders the server stage immediately and never advances on elapsed time',fakeAsync(()=>{
    const fixture=TestBed.createComponent(AnalysisProgress);
    fixture.componentRef.setInput('progress',state({stage:'evaluation',percent:80,message:'Calculating the score and rubric'}));fixture.detectChanges();
    const bar=()=>fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar().getAttribute('aria-valuenow')).toBe('80');expect(bar().getAttribute('aria-valuemin')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('100');
    expect(fixture.nativeElement.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');
    tick(120000);fixture.detectChanges();expect(bar().getAttribute('aria-valuenow')).toBe('80');
    fixture.componentRef.setInput('progress',state({stage:'feedback',percent:95,message:'Preparing feedback'}));fixture.detectChanges();
    expect(bar().getAttribute('aria-valuenow')).toBe('95');expect(fixture.nativeElement.textContent).toContain('Preparing feedback');
    fixture.destroy();
  }));
  it('completed results have no artificial processing sequence or progress card',()=>{
    const fixture=TestBed.createComponent(AnalysisProgress);
    fixture.componentRef.setInput('progress',state({status:'completed',completed:true,active:false,percent:100}));fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
  it('terminal and partial states never keep an active bar or claim 100%',()=>{
    const fixture=TestBed.createComponent(AnalysisProgress);
    for(const status of ['partial','failed'] as const){
      fixture.componentRef.setInput('progress',state({status,active:false,failed:status==='failed',message:'Some details are unavailable'}));fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe('false');
      expect(fixture.nativeElement.textContent).not.toContain('100%');
    }
  });
});
