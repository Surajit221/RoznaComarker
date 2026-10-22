import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ImageQualityChecklist } from './image-quality-checklist';
import { ImagePreflightResult } from '../../services/image-preflight.service';

describe('ImageQualityChecklist loading feedback', () => {
  let fixture: ComponentFixture<ImageQualityChecklist>;
  const pending: ImagePreflightResult = {
    ready: false, basicChecksPassed: true, sourceReadRequired: true, sourceReadStatus: 'CHECKING',
    checks: [{ id: 'handwritingReadability', label: 'Handwriting readability', required: true, status: 'checking' }],
  };
  const text = () => fixture.nativeElement.textContent as string;
  function start() {
    fixture.componentRef.setInput('checking', true);
    fixture.componentRef.setInput('result', pending);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageQualityChecklist] });
    fixture = TestBed.createComponent(ImageQualityChecklist);
  });

  it('uses preparing/queued hints without claiming handwriting has started', () => {
    fixture.componentRef.setInput('checking', true); fixture.detectChanges();
    expect(text()).toContain('Preparing image...');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
    fixture.componentRef.setInput('queued', true); fixture.detectChanges();
    expect(text()).toContain('Waiting for the previous file check...');
    expect(text()).not.toContain('Image checks passed');
  });

  it('shows an accessible indeterminate teal loader and no percentage or internal details', () => {
    start();
    const progress = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(progress.getAttribute('aria-label')).toBe('Checking handwriting readability');
    expect(progress.hasAttribute('aria-valuenow')).toBeFalse();
    expect(fixture.nativeElement.querySelector('.reading-spinner')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe('true');
    expect(fixture.nativeElement.querySelector('.reading-stage').getAttribute('aria-live')).toBe('polite');
    expect(text()).toContain('Image checks passed. Reading handwriting...');
    expect(text()).toContain('Checking handwriting readability...');
    expect(text()).not.toMatch(/%|OpenRouter|GPT|Astra|schema|hash/);
  });

  it('changes display hints slowly without claiming completed inference stages', fakeAsync(() => {
    start(); tick(4999); fixture.detectChanges();
    expect(text()).toContain('Image checks passed. Reading handwriting...');
    tick(1); fixture.detectChanges(); expect(text()).toContain('Reading handwriting carefully...');
    tick(15000); fixture.detectChanges(); expect(text()).toContain('Checking handwriting, edits, and crossed-out text...');
    tick(25000); fixture.detectChanges(); expect(text()).toContain('Still checking. Detailed handwriting can take a little longer.');
    tick(120000); fixture.detectChanges(); expect(text()).toContain('Still checking.');
  }));

  for (const status of ['PASSED', 'FAILED_IMAGE', 'FAILED_SERVICE'] as const) {
    it('immediately stops and clears all timers on ' + status, fakeAsync(() => {
      const schedule = spyOn(window, 'setTimeout').and.callThrough();
      start(); const clear = spyOn(window, 'clearTimeout').and.callThrough();
      const stageHandles = schedule.calls.all().filter(call => [5000, 20000, 45000].includes(Number(call.args[1]))).map(call => call.returnValue);
      const message = status === 'PASSED' ? 'The handwriting can be read for assessment.' : status === 'FAILED_IMAGE'
        ? 'Some handwriting could not be read confidently. Please upload a clearer image.'
        : 'Handwriting verification is temporarily unavailable. Please try again.';
      fixture.componentRef.setInput('result', { ...pending, ready: status === 'PASSED', sourceReadStatus: status,
        checks: [{ ...pending.checks[0], status: status === 'PASSED' ? 'pass' : status === 'FAILED_IMAGE' ? 'fail' : 'unavailable', message }] });
      fixture.componentRef.setInput('checking', false); fixture.detectChanges();
      expect(stageHandles.length).toBe(3);
      stageHandles.forEach(handle => expect(clear).toHaveBeenCalledWith(handle));
      expect(fixture.nativeElement.querySelector('[role="progressbar"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.reading-spinner')).toBeNull();
      expect(fixture.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe('false');
      expect(text()).toContain(message);
      expect(text()).toContain(status === 'PASSED' ? 'Image checks complete. Ready to submit.' : status === 'FAILED_IMAGE' ? 'Needs a clearer image' : 'Temporarily unavailable');
      if (status === 'FAILED_SERVICE') expect(text()).not.toContain('clearer image');
      tick(60000); expect(fixture.componentInstance.stageMessage).toBe('');
    }));
  }

  it('does not restart timers when another pending result arrives', fakeAsync(() => {
    start(); tick(10000);
    fixture.componentRef.setInput('result', { ...pending }); fixture.detectChanges();
    expect(text()).toContain('Reading handwriting carefully...');
    tick(10000); fixture.detectChanges(); expect(text()).toContain('Checking handwriting, edits, and crossed-out text...');
    fixture.destroy();
  }));

  it('clears timers on destroy and starts a replacement with fresh display time', fakeAsync(() => {
    start(); tick(5000);
    const clear = spyOn(window, 'clearTimeout').and.callThrough();
    fixture.destroy(); expect(clear).toHaveBeenCalledTimes(3);
    tick(60000);
    fixture = TestBed.createComponent(ImageQualityChecklist); start();
    expect(text()).toContain('Image checks passed. Reading handwriting...');
    fixture.destroy();
  }));
});
