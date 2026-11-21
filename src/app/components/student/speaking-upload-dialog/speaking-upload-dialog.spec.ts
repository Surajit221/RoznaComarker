import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpEventType } from '@angular/common/http';
import { SpeakingUploadDialog, SPEAKING_UPLOAD_NOTICE } from './speaking-upload-dialog';
import { DeviceService } from '../../../services/device.service';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { AlertService } from '../../../services/alert.service';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';
import { ModalDialog } from '../../../shared/modal-dialog/modal-dialog';

const API = 'http://localhost:5000/api';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const ASSIGNMENT = { id: 'a1', title: 'Describe your town', instructions: 'Speak for two minutes about your town.', deadline: '2099-05-01T10:00:00.000Z' };
const device = (desktop: boolean) => ({ isDesktop: () => desktop, isMobile: () => !desktop, isTablet: () => false });

function setup(desktop = true) {
  TestBed.configureTestingModule({ imports: [SpeakingUploadDialog],
    providers: [...httpTestingProviders, { provide: DeviceService, useValue: device(desktop) },
      { provide: AlertService, useValue: { showToast: jasmine.createSpy('showToast') } }] });
  const fixture = TestBed.createComponent(SpeakingUploadDialog);
  fixture.componentRef.setInput('assignment', ASSIGNMENT);
  fixture.componentRef.setInput('limits', LIMITS);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  return fixture;
}
const recording = (name = 'answer.mp3') => new File([new Uint8Array(20)], name, { type: 'audio/mpeg' });

describe('SpeakingUploadDialog', () => {
  let fixture: ComponentFixture<SpeakingUploadDialog>;
  let dialog: SpeakingUploadDialog;
  let http: HttpTestingController;
  let unsaved: UnsavedWorkRegistry;
  const root = () => document.body;
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === label) ?? null;
  beforeEach(() => {
    fixture = setup();
    dialog = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    unsaved = TestBed.inject(UnsavedWorkRegistry);
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  it('shows the assignment, the approved notice and the limits line, with the existing upload classes', () => {
    const panel = root().querySelector('.student-upload-panel')!;
    expect(panel.textContent).toContain('Describe your town');
    expect(panel.textContent).toContain('Speak for two minutes about your town.');
    expect(panel.textContent).toContain(SPEAKING_UPLOAD_NOTICE);
    expect(SPEAKING_UPLOAD_NOTICE).toBe('Your recording is saved with this assignment so your teacher can listen to it. It is turned into text by a speech-to-text '
      + 'service and marked with AI to help your teacher. Only you and your teacher can play it.');
    expect(panel.querySelector('.upload-section-heading')!.textContent).toContain('MP3, M4A, WebM, Ogg or WAV · Maximum 40 MB · Up to 3 minutes');
    expect(panel.querySelector('.upload-modal-header h2')!.textContent!.trim()).toBe('Upload Recording');
    expect(panel.querySelector('.upload-modal-eyebrow')!.textContent!.trim()).toBe('Speaking assignment');
    expect(button('Upload Recording')).toBeNull();
  });

  it('uploads with progress; registers unsaved work while uploading; emits the saved submission', () => {
    const uploaded: unknown[] = [];
    dialog.uploaded.subscribe(value => uploaded.push(value));
    dialog.onFile(recording());
    fixture.detectChanges();
    button('Upload Recording')!.click();
    fixture.detectChanges();
    expect(unsaved.has('speaking-upload')).toBeTrue();
    const req = http.expectOne(`${API}/speaking/a1`);
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^[\w-]{16,80}$/);
    req.event({ type: HttpEventType.UploadProgress, loaded: 10, total: 20 });
    fixture.detectChanges();
    const bar = root().querySelector('[role=progressbar]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(root().textContent).toContain('Uploading recording…');
    req.flush({ success: true, data: { id: 's1', assignmentId: 'a1' } }, { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(uploaded).toEqual([{ id: 's1', assignmentId: 'a1' }]);
    expect(unsaved.has('speaking-upload')).toBeFalse();
  });

  it('a refusal shows the fixed message (never the server text); the same file is retried with the same key, another file gets a new key', () => {
    dialog.onFile(recording());
    dialog.upload();
    const first = http.expectOne(`${API}/speaking/a1`);
    const key = first.request.headers.get('Idempotency-Key');
    first.flush({ success: false, code: 'AUDIO_TOO_SHORT', message: 'SERVER TEXT /srv/app' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    const alert = root().querySelector('.student-upload-panel [role=alert]')!;
    expect(alert.textContent!.trim()).toBe('This recording is shorter than 5 seconds. Please record a longer answer and upload it again.');
    expect(root().textContent).not.toContain('SERVER TEXT');
    expect(unsaved.has('speaking-upload')).toBeFalse();
    dialog.upload();
    const again = http.expectOne(`${API}/speaking/a1`);
    expect(again.request.headers.get('Idempotency-Key')).toBe(key);
    again.flush({ success: false, code: 'AUDIO_TOO_SHORT' }, { status: 422, statusText: 'Unprocessable' });
    dialog.onFile(recording('other.mp3'));
    dialog.upload();
    const other = http.expectOne(`${API}/speaking/a1`);
    expect(other.request.headers.get('Idempotency-Key')).not.toBe(key);
    other.flush({ success: true, data: { id: 's1' } });
  });

  it('cancel during an upload aborts it, clears the unsaved work and closes; it cannot be dismissed by the backdrop meanwhile', () => {
    let closed = 0;
    dialog.closed.subscribe(() => closed++);
    dialog.onFile(recording());
    dialog.upload();
    fixture.detectChanges();
    const req = http.expectOne(`${API}/speaking/a1`);
    expect(dialog.uploading).toBeTrue();
    const modal = fixture.debugElement.query(el => el.componentInstance instanceof ModalDialog).componentInstance as ModalDialog;
    expect(modal.dismissible).toBeFalse();
    dialog.cancel();
    fixture.detectChanges();
    expect(modal.dismissible).toBeTrue();
    expect(req.cancelled).toBeTrue();
    expect(unsaved.has('speaking-upload')).toBeFalse();
    expect(closed).toBe(1);
  });

  it('replacing: says the new recording replaces the current one', () => {
    fixture.componentRef.setInput('replacing', true);
    fixture.detectChanges();
    expect(root().querySelector('.student-upload-panel')!.textContent).toContain('Your new recording replaces the current one.');
    expect(root().querySelector('.upload-modal-header h2')!.textContent!.trim()).toBe('Replace Recording');
  });
});

describe('SpeakingUploadDialog on a phone (bottom sheet)', () => {
  it('uses the bottom sheet and full-width sheet actions', () => {
    const fixture = setup(false);
    const sheet = document.body.querySelector('.student-sheet-content')!;
    expect(sheet).not.toBeNull();
    expect(sheet.querySelector('.student-sheet-actions')).not.toBeNull();
    expect(document.body.querySelector('.student-upload-panel')).toBeNull();
    fixture.destroy();
  });
});
