import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingAudioPlayer } from './speaking-audio-player';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api';

describe('SpeakingAudioPlayer (native controls; audio loaded through the signed-in client)', () => {
  let fixture: ComponentFixture<SpeakingAudioPlayer>;
  let http: HttpTestingController;
  let revoked: string[];
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SpeakingAudioPlayer], providers: [...httpTestingProviders] });
    fixture = TestBed.createComponent(SpeakingAudioPlayer);
    http = TestBed.inject(HttpTestingController);
    revoked = [];
    spyOn(URL, 'createObjectURL').and.returnValues('blob:one', 'blob:two', 'blob:three');
    spyOn(URL, 'revokeObjectURL').and.callFake((url: string) => { revoked.push(url); });
  });
  const root = () => fixture.nativeElement as HTMLElement;
  const start = (inputs: Record<string, unknown>) => { for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v); fixture.detectChanges(); };

  it('shows a loading state, then the native player with its label and length', fakeAsync(() => {
    start({ submissionId: 's1', label: 'Recording by Ana', durationSeconds: 75 });
    expect(root().querySelector('[role=status]')!.textContent).toContain('Loading the recording…');
    http.expectOne(`${API}/audio/submissions/s1/media`).flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    flushMicrotasks(); fixture.detectChanges();
    const audio = root().querySelector('audio')!;
    expect(audio.hasAttribute('controls')).toBeTrue();
    expect(audio.getAttribute('src')).toBe('blob:one');
    expect(audio.getAttribute('aria-label')).toBe('Recording by Ana');
    expect(root().textContent).toContain('Length: 1:15');
    expect(root().textContent).not.toContain('Download recording');
  }));

  it('a failed load shows fixed text and can be tried again', fakeAsync(() => {
    start({ submissionId: 's1' });
    http.expectOne(`${API}/audio/submissions/s1/media`).flush(new Blob(['{"code":"NOT_FOUND","message":"SERVER TEXT"}'], { type: 'application/json' }), { status: 404, statusText: 'Not Found' });
    flushMicrotasks(); fixture.detectChanges();
    expect(root().querySelector('[role=alert]')!.textContent).toContain("The recording couldn't be loaded.");
    expect(root().textContent).not.toContain('SERVER TEXT');
    (root().querySelector('[role=alert] button') as HTMLButtonElement).click();
    http.expectOne(`${API}/audio/submissions/s1/media`).flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    flushMicrotasks(); fixture.detectChanges();
    expect(root().querySelector('audio')).not.toBeNull();
  }));

  it('no audio kept: says so and asks for nothing', () => {
    start({ submissionId: 's1', available: false });
    http.expectNone(`${API}/audio/submissions/s1/media`);
    expect(root().textContent).toContain('The recording is no longer available.');
  });

  it('teacher: Download recording fetches the download route; every object URL is revoked (on change and on destroy)', fakeAsync(() => {
    start({ submissionId: 's1', downloadable: true });
    http.expectOne(`${API}/audio/submissions/s1/media`).flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    flushMicrotasks(); fixture.detectChanges();
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    [...root().querySelectorAll('button')].find(b => b.textContent!.includes('Download recording'))!.click();
    http.expectOne(`${API}/audio/submissions/s1/download`).flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    flushMicrotasks();
    expect(click).toHaveBeenCalled();
    expect(revoked).toContain('blob:two');
    fixture.componentRef.setInput('submissionId', 's2');
    fixture.detectChanges();
    expect(revoked).toContain('blob:one');
    http.expectOne(`${API}/audio/submissions/s2/media`).flush(new Blob(['ID3'], { type: 'audio/mpeg' }));
    flushMicrotasks();
    fixture.destroy();
    expect(revoked).toContain('blob:three');
  }));
});
