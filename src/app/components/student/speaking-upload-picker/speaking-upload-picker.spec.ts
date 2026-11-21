import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpeakingUploadPicker } from './speaking-upload-picker';
import { DeviceService } from '../../../services/device.service';

const desktop = { isDesktop: () => true, isMobile: () => false, isTablet: () => false };

describe('SpeakingUploadPicker', () => {
  let fixture: ComponentFixture<SpeakingUploadPicker>;
  let picker: SpeakingUploadPicker;
  let chosen: (File | null)[];
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SpeakingUploadPicker], providers: [{ provide: DeviceService, useValue: desktop }] }).compileComponents();
    fixture = TestBed.createComponent(SpeakingUploadPicker);
    picker = fixture.componentInstance;
    fixture.componentRef.setInput('limits', { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 1000 });
    chosen = [];
    picker.fileChosen.subscribe(file => chosen.push(file));
    fixture.detectChanges();
  });
  const root = () => fixture.nativeElement as HTMLElement;
  const zone = () => root().querySelector<HTMLElement>('[data-speaking-dropzone]')!;
  const input = () => root().querySelector<HTMLInputElement>('input[type=file]')!;
  const choose = (file: File) => {
    const list = new DataTransfer(); list.items.add(file);
    input().files = list.files;
    input().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('the drop zone is a keyboard button with an accessible name, and the file input accepts audio only', () => {
    expect(zone().getAttribute('role')).toBe('button');
    expect(zone().getAttribute('tabindex')).toBe('0');
    expect(zone().getAttribute('aria-label')).toBe('Choose a recording: MP3, M4A, WebM, Ogg or WAV');
    expect(zone().classList).toContain('essay-dropzone');
    expect(input().accept).toContain('.mp3');
    expect(input().accept).not.toContain('.pdf');
    const click = spyOn(input(), 'click');
    zone().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    zone().dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('a valid recording: emits the checked file and shows the chosen name and size', () => {
    choose(new File([new Uint8Array(10)], 'My answer.mp3', { type: 'audio/mpeg' }));
    expect(chosen.length).toBe(1);
    expect(chosen[0]!.name).toBe('recording.mp3');
    expect(root().textContent).toContain('My answer.mp3');
    expect(root().querySelector('[role=alert]')).toBeNull();
  });

  it('an invalid file: emits null and shows the fixed message as an alert', () => {
    choose(new File(['x'], 'essay.pdf', { type: 'application/pdf' }));
    expect(chosen).toEqual([null]);
    expect(root().querySelector('[role=alert]')!.textContent!.trim()).toBe('Please upload an MP3, M4A, WebM, Ogg or WAV recording.');
  });

  it('disabled: the drop zone does nothing', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const click = spyOn(input(), 'click');
    zone().click();
    expect(click).not.toHaveBeenCalled();
    expect(zone().getAttribute('aria-disabled')).toBe('true');
  });

  it('reset() clears the choice and the message', () => {
    choose(new File(['x'], 'essay.pdf', { type: 'application/pdf' }));
    picker.reset();
    fixture.detectChanges();
    expect(root().querySelector('[role=alert]')).toBeNull();
    expect(input().value).toBe('');
  });
});
