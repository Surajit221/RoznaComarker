import { NgZone } from '@angular/core';
import { TestBed, fakeAsync, tick, type ComponentFixture } from '@angular/core/testing';
import { SpeakingRecorder, MEDIA_RECORDING, type MediaRecording, type PracticeRecording } from './speaking-recorder';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { DeviceService } from '../../../services/device.service';

/** A fake MediaRecorder: start() records, stop() hands over one chunk of the chosen type, then onstop. */
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly mimeType: string) {}
  start(): void { this.state = 'recording'; }
  stop(): void { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) }); this.onstop?.(); }
}

function fakeMedia({ supported = true, types = ['audio/webm;codecs=opus', 'audio/webm'], deny = '' } = {}) {
  const track = { stop: jasmine.createSpy('stop') };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let recorder: FakeRecorder | null = null;
  const media: MediaRecording = {
    supported: () => supported,
    getUserMedia: jasmine.createSpy('getUserMedia').and.callFake(() => (deny ? Promise.reject(Object.assign(new Error('x'), { name: deny })) : Promise.resolve(stream))),
    isTypeSupported: (type: string) => types.includes(type),
    create: (_stream: MediaStream, mimeType?: string) => { recorder = new FakeRecorder(mimeType || 'audio/webm'); return recorder as unknown as MediaRecorder; }
  };
  return { media, track, recorder: () => recorder };
}

function setup(fake = fakeMedia(), inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ imports: [SpeakingRecorder], providers: [{ provide: MEDIA_RECORDING, useValue: fake.media },
    { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } }] });
  const fixture = TestBed.createComponent(SpeakingRecorder);
  fixture.componentRef.setInput('maxSeconds', 30);
  fixture.componentRef.setInput('minSeconds', 5);
  fixture.componentRef.setInput('maxFileBytes', 20 * 1024 * 1024);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  const emitted: (PracticeRecording | null)[] = [];
  fixture.componentInstance.recordingChange.subscribe(value => emitted.push(value));
  return { fixture, emitted, ...fake };
}
const button = (fixture: ComponentFixture<SpeakingRecorder>, label: RegExp) =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find(b => label.test(b.textContent || '')) ?? null;
const text = (fixture: ComponentFixture<SpeakingRecorder>) => (fixture.nativeElement as HTMLElement).textContent || '';

describe('SpeakingRecorder', () => {
  afterEach(() => TestBed.inject(UnsavedWorkRegistry).clear('speaking-coach-recording'));

  it('records in the browser: the record button is a toggle, the timer runs, the page counts as having unsaved work', fakeAsync(() => {
    const { fixture, media } = setup();
    const record = button(fixture, /Start recording/)!;
    expect(record.getAttribute('aria-pressed')).toBe('false');
    record.click(); tick(); fixture.detectChanges();
    expect(media.getUserMedia).toHaveBeenCalled();
    const stop = button(fixture, /Stop recording/)!;
    expect(stop.getAttribute('aria-pressed')).toBe('true');
    expect(text(fixture)).toContain('Recording');
    tick(3000); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="timer"]')!.textContent).toContain('0:03');
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-recording')).toBeTrue();
    fixture.destroy();
  }));

  it('stop: one recording (webm), its length, a player to listen back; the microphone is released', fakeAsync(() => {
    const { fixture, emitted, track } = setup();
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    tick(8000); fixture.detectChanges();
    button(fixture, /Stop recording/)!.click(); tick(); fixture.detectChanges();
    const last = emitted[emitted.length - 1]!;
    expect(last.filename).toBe('practice.webm');
    expect(last.blob.type).toBe('audio/webm');
    expect(last.durationSeconds).toBe(8);
    expect(last.source).toBe('microphone');
    expect(track.stop).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('audio')).toBeTruthy();
    expect(button(fixture, /Record again/)).toBeTruthy();
    fixture.destroy();
  }));

  it('the browser ends a recording outside Angular (MediaRecorder onstop, later): the page still updates by itself', fakeAsync(() => {
    const fake = fakeMedia();
    const { fixture } = setup(fake);
    fixture.autoDetectChanges(true);
    button(fixture, /Start recording/)!.click(); tick();
    tick(6000);
    // As in Chrome: the stop event arrives later, from outside Angular's zone.
    const recorder = fake.recorder()!;
    const zone = TestBed.inject(NgZone);
    recorder.stop = function stop(this: FakeRecorder) {
      this.state = 'inactive';
      zone.runOutsideAngular(() => setTimeout(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) }); this.onstop?.(); }, 50));
    };
    button(fixture, /Stop recording/)!.click(); tick(100);
    expect(button(fixture, /Record again/)).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('audio')).toBeTruthy();
    fixture.destroy();
  }));

  it('stops by itself at the task\'s longest recording', fakeAsync(() => {
    const { fixture, emitted } = setup(fakeMedia(), { maxSeconds: 10 });
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    tick(10500); fixture.detectChanges();
    expect(emitted[emitted.length - 1]!.durationSeconds).toBe(10);
    expect(text(fixture)).toContain('the longest recording for this task');
    fixture.destroy();
  }));

  it('too short: refused with a message, nothing emitted, no unsaved work left', fakeAsync(() => {
    const { fixture, emitted } = setup();
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    tick(2000);
    button(fixture, /Stop recording/)!.click(); tick(); fixture.detectChanges();
    expect(emitted.filter(Boolean)).toEqual([]);
    expect(text(fixture)).toContain('Record at least 5 seconds');
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-recording')).toBeFalse();
    fixture.destroy();
  }));

  it('Safari (MP4 only): an .m4a recording', fakeAsync(() => {
    const { fixture, emitted } = setup(fakeMedia({ types: ['audio/mp4'] }));
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    tick(6000);
    button(fixture, /Stop recording/)!.click(); tick(); fixture.detectChanges();
    expect(emitted[emitted.length - 1]!.filename).toBe('practice.m4a');
    expect(emitted[emitted.length - 1]!.blob.type).toBe('audio/mp4');
    fixture.destroy();
  }));

  it('microphone blocked: a fixed message and the upload instead', fakeAsync(() => {
    const { fixture } = setup(fakeMedia({ deny: 'NotAllowedError' }));
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    expect(text(fixture)).toContain('Microphone access was blocked');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-speaking-upload-picker')).toBeTruthy();
    fixture.destroy();
  }));

  it('no recording in this browser: the upload only, with a note', () => {
    const { fixture } = setup(fakeMedia({ supported: false }));
    expect(button(fixture, /Start recording/)).toBeNull();
    expect(text(fixture)).toContain('Recording in the browser is not available here');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-speaking-upload-picker')).toBeTruthy();
  });

  it('a chosen file is passed on as the recording', () => {
    const { fixture, emitted } = setup();
    const file = new File([new Uint8Array(10)], 'answer.mp3', { type: 'audio/mpeg' });
    fixture.componentInstance.onFile(file);
    expect(emitted[emitted.length - 1]).toEqual({ blob: file, filename: 'answer.mp3', durationSeconds: null, source: 'file' });
  });

  it('reset after sending: no player, nothing pending, null emitted', fakeAsync(() => {
    const { fixture, emitted } = setup();
    button(fixture, /Start recording/)!.click(); tick(); fixture.detectChanges();
    tick(7000);
    button(fixture, /Stop recording/)!.click(); tick(); fixture.detectChanges();
    fixture.componentInstance.reset(); fixture.detectChanges();
    expect(emitted[emitted.length - 1]).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('audio')).toBeNull();
    expect(TestBed.inject(UnsavedWorkRegistry).has('speaking-coach-recording')).toBeFalse();
    fixture.destroy();
  }));

  it('disabled: the record button cannot be used', () => {
    const { fixture } = setup(fakeMedia(), { disabled: true });
    expect(button(fixture, /Start recording/)!.disabled).toBeTrue();
  });
});
