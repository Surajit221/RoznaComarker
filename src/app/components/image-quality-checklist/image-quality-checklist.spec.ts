import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ImageQualityChecklist } from './image-quality-checklist';
import type { ImagePreflightResult } from '../../services/image-preflight.service';
describe('ImageQualityChecklist progress',()=>{
  const pending:ImagePreflightResult={ready:false,basicChecksPassed:true,sourceReadRequired:true,sourceReadStatus:'CHECKING',
    checks:[{id:'handwritingReadability',label:'Handwriting readability',required:true,status:'checking'}],
    processingProgress:{status:'processing',stage:'source',percent:60,message:'Reading handwriting and verifying readability',active:true,completed:false,failed:false}};
  it('shows indeterminate preparation before any server result',()=>{
    const fixture=TestBed.createComponent(ImageQualityChecklist);
    fixture.componentRef.setInput('checking',true);fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Preparing image');expect(fixture.nativeElement.textContent).not.toContain('%');
    fixture.componentRef.setInput('queued',true);fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Waiting for the previous file');
  });
  it('uses the server percentage without elapsed-time stage guesses or duplicate checklist',fakeAsync(()=>{
    const fixture=TestBed.createComponent(ImageQualityChecklist);
    fixture.componentRef.setInput('checking',true);fixture.componentRef.setInput('result',pending);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('60');
    expect(fixture.nativeElement.querySelectorAll('ul')).toHaveSize(1);
    tick(120000);fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('60%');
    expect(fixture.nativeElement.textContent).not.toContain('crossed-out');fixture.destroy();
  }));
  for(const status of ['PASSED','FAILED_IMAGE','FAILED_SERVICE'] as const)it('preserves check result and stops activity for '+status,()=>{
    const fixture=TestBed.createComponent(ImageQualityChecklist),passed=status==='PASSED';
    const message=passed?'The handwriting can be read for assessment.':status==='FAILED_IMAGE'?'Please upload a clearer image.':'Verification is temporarily unavailable.';
    fixture.componentRef.setInput('checking',false);fixture.componentRef.setInput('result',{...pending,ready:passed,sourceReadStatus:status,message,
      checks:[{...pending.checks[0],status:passed?'pass':status==='FAILED_IMAGE'?'fail':'unavailable',message}],
      processingProgress:{status:passed?'completed':'failed',stage:passed?'completed':'failed',percent:passed?100:60,message:passed?'Ready to submit':message,active:false,completed:passed,failed:!passed}});fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message);
    expect(fixture.nativeElement.querySelector('.reading-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe('false');
    expect(fixture.nativeElement.textContent).toContain(passed?'100%':message);
    if(!passed)expect(fixture.nativeElement.textContent).not.toContain('100%');
  });
});
