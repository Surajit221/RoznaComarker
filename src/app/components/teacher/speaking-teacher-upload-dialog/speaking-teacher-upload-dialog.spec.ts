import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SpeakingTeacherUploadDialog } from './speaking-teacher-upload-dialog';
import { SpeakingUploadPicker } from '../../student/speaking-upload-picker/speaking-upload-picker';
import { UnsavedWorkRegistry } from '../../../core/app-update/unsaved-work';
import { DeviceService } from '../../../services/device.service';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';

const BASE = 'http://localhost:5000/api/speaking/assignments/a1/teacher-uploads';
const LIMITS = { maxRecordingSeconds: 180, minDurationSeconds: 5, maxFileBytes: 41943040 };
const wav = () => new File([new Uint8Array(20)], 'recording.wav', { type: 'audio/wav' });

describe('SpeakingTeacherUploadDialog (stage 9: the essay "Upload student work" flow, for recordings)', () => {
  let fixture: ComponentFixture<SpeakingTeacherUploadDialog>;
  let dialog: SpeakingTeacherUploadDialog;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SpeakingTeacherUploadDialog],
      providers: [...httpTestingProviders, { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } }] });
    fixture = TestBed.createComponent(SpeakingTeacherUploadDialog);
    dialog = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('assignmentTitle', 'Describe your town');
    fixture.componentRef.setInput('limits', LIMITS);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());
  const root = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.replace(/\s+/g, ' ').trim() === label) ?? null;
  const type = (selector: string, value: string) => { const el = root().querySelector<HTMLInputElement>(selector)!; el.value = value; el.dispatchEvent(new Event('input')); };
  function fillAndCheck(rows: { name: string; email: string }[], answer: unknown) {
    rows.forEach((row, i) => {
      if (i > 0) { button('Add student')!.click(); fixture.detectChanges(); }
      const id = dialog.students()[i].id;
      type(`#student-name-${id}`, row.name); type(`#student-email-${id}`, row.email);
    });
    fixture.detectChanges();
    button('Next: add recordings')!.click();
    http.expectOne(`${BASE}/check`).flush({ success: true, data: answer });
    flushMicrotasks(); tick(); fixture.detectChanges();
  }
  const chooseAll = () => {
    for (const picker of fixture.debugElement.queryAll(el => el.componentInstance instanceof SpeakingUploadPicker)) (picker.componentInstance as SpeakingUploadPicker).fileChosen.emit(wav());
    fixture.detectChanges();
  };

  it('the same three steps and student sources as the essay dialog; the heading names the assignment', () => {
    expect(root().querySelector('h2')!.textContent!.trim()).toBe('Upload student recordings');
    expect(root().textContent).toContain('Describe your town');
    expect([...root().querySelectorAll('.upload-steps li')].map(li => li.textContent!.replace(/\s+/g, ' ').trim().replace(/ \(current.*\)$/, '')))
      .toEqual(['1 Students', '2 Recordings', '3 Review']);
    expect(button('Add manually')).not.toBeNull();
    expect(button('Upload a CSV')).not.toBeNull();
    expect(button('From class list')).not.toBeNull();
  });

  it('local checks first (nothing is sent for a bad row)', fakeAsync(() => {
    type(`#student-name-${dialog.students()[0].id}`, 'Ana');
    type(`#student-email-${dialog.students()[0].id}`, 'not-an-email');
    fixture.detectChanges();
    button('Next: add recordings')!.click();
    fixture.detectChanges();
    http.expectNone(`${BASE}/check`);
    expect(root().textContent).toContain('Enter a valid email address.');
  }));

  it('Save and send: one recording per student, its own key; class members are emailed, guests are saved without an email', fakeAsync(() => {
    fillAndCheck([{ name: 'Ana', email: 'ana@example.com' }, { name: 'Guest', email: 'g@example.com' }],
      { students: [{ index: 0, name: 'Ana', email: 'ana@example.com', account: 'member' }, { index: 1, name: 'Guest', email: 'g@example.com', account: 'guest' }],
        credits: { needed: 2, available: 5 } });
    expect(root().textContent).toContain('Class member');
    expect(root().textContent).toContain('Guest: saved without an email for now');
    expect(button('Next: review')!.disabled).toBeTrue();
    chooseAll();
    button('Next: review')!.click();
    http.expectOne(`${BASE}/check`).flush({ success: true, data: { students: [], credits: { needed: 2, available: 5 } } });
    flushMicrotasks(); fixture.detectChanges();
    expect(root().textContent).toContain('Credits needed: 2 · Available: 5');
    expect(root().textContent).toContain('"Save and send" emails each class member a link to their feedback when marking is finished. Guests are saved without an email for now.');
    button('Save and send')!.click();
    fixture.detectChanges();
    const uploads = http.match(BASE);
    expect(uploads.length).toBe(2);
    const fields = uploads.map(r => r.request.body as FormData);
    expect(fields.map(f => f.get('send'))).toEqual(['true', null]);
    expect(fields.every(f => (f.get('audio') as File).name === 'recording.wav')).toBeTrue();
    expect(new Set(fields.map(f => f.get('requestKey'))).size).toBe(2);
    uploads.forEach((r, i) => r.flush({ success: true, data: { item: { submissionId: `s${i}`, emailStatus: i ? 'none' : 'queued' }, duplicate: false } }));
    flushMicrotasks(); tick(); fixture.detectChanges();
    expect(root().textContent).toContain('2 saved.');
  }));

  it('no credits: the rest are not uploaded, with the fixed message (never the server text)', fakeAsync(() => {
    fillAndCheck([{ name: 'Ana', email: 'ana@example.com' }, { name: 'Ben', email: 'ben@example.com' }, { name: 'Cy', email: 'cy@example.com' },
      { name: 'Di', email: 'di@example.com' }, { name: 'Ed', email: 'ed@example.com' }],
      { students: ['ana', 'ben', 'cy', 'di', 'ed'].map((n, index) => ({ index, email: `${n}@example.com`, account: 'member' })), credits: { needed: 5, available: 5 } });
    chooseAll();
    button('Next: review')!.click();
    http.expectOne(`${BASE}/check`).flush({ success: true, data: { students: [], credits: { needed: 5, available: 5 } } });
    flushMicrotasks(); fixture.detectChanges();
    button('Save')!.click();
    fixture.detectChanges();
    const first = http.match(BASE);
    expect(first.length).toBe(4);
    first[0].flush({ success: false, code: 'INSUFFICIENT_CREDITS', message: 'RAW SERVER TEXT' }, { status: 402, statusText: 'Payment Required' });
    first.slice(1).forEach(r => r.flush({ success: true, data: { item: { submissionId: 'x' }, duplicate: false } }));
    flushMicrotasks(); tick(); fixture.detectChanges();
    http.expectNone(BASE);
    expect(root().textContent).toContain('You have no assessment credits left. Add credits to upload more recordings.');
    expect(root().textContent).not.toContain('RAW SERVER TEXT');
  }));

  it('a recording already uploaded for the student: replace it (with a warning and a confirmation before saving)', fakeAsync(() => {
    fillAndCheck([{ name: 'Ana', email: 'ana@example.com' }],
      { students: [{ index: 0, email: 'ana@example.com', account: 'member', existing: { submissionId: 's1', pages: 1 } }], credits: { needed: 1, available: 5 } });
    expect(root().textContent).toContain('A recording for this student is already uploaded.');
    expect(root().textContent).toContain('The current recording will be permanently deleted when you save.');
    chooseAll();
    button('Next: review')!.click();
    http.expectOne(`${BASE}/check`).flush({ success: true, data: { students: [], credits: { needed: 1, available: 5 } } });
    flushMicrotasks(); fixture.detectChanges();
    button('Save')!.click();
    fixture.detectChanges();
    http.expectNone(BASE);
    expect(root().querySelector('[role=alertdialog]')!.textContent).toContain('Old recordings will be permanently deleted.');
    button('Delete old recordings and save')!.click();
    fixture.detectChanges();
    const req = http.expectOne(BASE);
    expect((req.request.body as FormData).get('mode')).toBe('replace');
    req.flush({ success: true, data: { item: { submissionId: 's1' }, duplicate: false } });
    flushMicrotasks(); tick();
  }));

  it('unsaved input counts as unsaved work (navigation asks first)', () => {
    type(`#student-name-${dialog.students()[0].id}`, 'Ana');
    fixture.detectChanges();
    expect(TestBed.inject(UnsavedWorkRegistry).has('teacher-upload-speaking')).toBeTrue();
  });
});
