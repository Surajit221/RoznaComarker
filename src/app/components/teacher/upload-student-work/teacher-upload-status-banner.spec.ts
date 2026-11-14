import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TeacherUploadApiService, type TeacherUploadItem } from '../../../api/teacher-upload-api.service';
import { TeacherUploadStatusBanner } from './teacher-upload-status-banner';
import { uploadFailureReason } from './teacher-upload-status';

// FIX 3: the submission page never goes blank for work the teacher uploaded: it shows the status, the reason and Retry marking.
describe('TeacherUploadStatusBanner', () => {
  let fixture: ComponentFixture<TeacherUploadStatusBanner>;
  const item = (over: Partial<TeacherUploadItem> = {}): TeacherUploadItem => ({ submissionId: 's1', name: 'Sam Lee', email: 'sam@example.com', account: 'guest',
    uploadedByTeacher: true, pages: 1, status: 'uploaded', emailStatus: 'none', emailSentAt: null, emailFailedAt: null, uploadedAt: '2026-11-11T10:00:00.000Z', ...over });
  const api = { list: jasmine.createSpy('list'), retry: jasmine.createSpy('retry') };
  const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); fixture.detectChanges(); } };
  const dom = () => fixture.nativeElement as HTMLElement;

  async function create(items: TeacherUploadItem[], submissionId = 's1') {
    api.list.and.resolveTo({ items, credits: { available: 1 } });
    await TestBed.configureTestingModule({ imports: [TeacherUploadStatusBanner], providers: [{ provide: TeacherUploadApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(TeacherUploadStatusBanner);
    fixture.componentRef.setInput('assignmentId', 'a1');
    fixture.componentRef.setInput('submissionId', submissionId);
    fixture.detectChanges(); await settle();
  }
  beforeEach(() => { api.list.calls.reset(); api.retry.calls.reset(); jasmine.clock().install(); });
  afterEach(() => { fixture?.destroy(); jasmine.clock().uninstall(); TestBed.resetTestingModule(); });

  it('shows nothing for a student-submitted piece of work or a finished one', async () => {
    await create([item({ submissionId: 'other' })]);
    expect(dom().querySelector('[data-teacher-upload-status]')).toBeNull();
    TestBed.resetTestingModule();
    await create([item({ status: 'marked' })]);
    expect(dom().querySelector('[data-teacher-upload-status]')).toBeNull();
  });

  for (const [status, label, text] of [['uploaded', 'Uploaded', 'Marking will start'], ['reading', 'Reading', 'Reading the handwriting'],
    ['processing', 'Marking', 'Corrections and marking are running'], ['waiting_credits', 'Waiting for credits', 'no assessment credits left'],
    ['failed', 'Marking failed', 'took too long to answer']] as const) {
    it(`${status}: chip "${label}", a plain description, and Retry marking`, async () => {
      await create([item({ status, failureCode: status === 'failed' ? 'AI_PROVIDER_TIMEOUT' : undefined })]);
      const box = dom().querySelector('[data-teacher-upload-status]')!;
      expect(box.getAttribute('data-status')).toBe(status);
      expect(box.querySelector('.tu-status__chip')!.textContent!.trim()).toBe(label);
      expect(box.querySelector('[role="status"]')!.textContent).toContain(text);
      expect(box.textContent).toContain('Sam Lee');
      expect(box.querySelector('[data-teacher-upload-retry]')).not.toBeNull();
    });
  }

  it('polls while the work is in progress and stops once it is finished', async () => {
    await create([item({ status: 'reading' })]);
    expect(api.list).toHaveBeenCalledTimes(1);
    api.list.and.resolveTo({ items: [item({ status: 'marked' })], credits: { available: 1 } });
    jasmine.clock().tick(15000); await settle();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(dom().querySelector('[data-teacher-upload-status]')).toBeNull();
    jasmine.clock().tick(60000); await settle();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('Retry marking restarts and shows the new status; a live run says it is already running; a refusal is explained', async () => {
    await create([item({ status: 'failed', failureCode: 'OCR_IMAGE_UNREADABLE' })]);
    api.retry.and.resolveTo({ alreadyRequested: false, item: item({ status: 'uploaded' }) });
    api.list.and.resolveTo({ items: [item({ status: 'uploaded' })], credits: { available: 1 } });
    dom().querySelector<HTMLButtonElement>('[data-teacher-upload-retry]')!.click(); await settle();
    expect(api.retry).toHaveBeenCalledOnceWith('a1', 's1');
    expect(dom().querySelector('[data-teacher-upload-status]')!.getAttribute('data-status')).toBe('uploaded');
    expect(dom().textContent).toContain('Marking restarted');
    api.retry.and.resolveTo({ alreadyRequested: true, item: item({ status: 'uploaded' }) });
    dom().querySelector<HTMLButtonElement>('[data-teacher-upload-retry]')!.click(); await settle();
    expect(dom().textContent).toContain('Marking is already running.');
    api.retry.and.rejectWith(new HttpErrorResponse({ status: 402, error: { code: 'INSUFFICIENT_CREDITS', message: 'You have no assessment credits left. Add credits to retry marking.' } }));
    dom().querySelector<HTMLButtonElement>('[data-teacher-upload-retry]')!.click(); await settle();
    expect(dom().querySelector('[role="alert"]')!.textContent).toContain('no assessment credits left');
  });

  it('reasons come from safe codes only', () => {
    expect(uploadFailureReason('OCR_IMAGE_UNREADABLE')).toContain('could not be read');
    expect(uploadFailureReason('ASSESSMENT_STALLED')).toContain('did not restart');
    expect(uploadFailureReason('SOMETHING_ELSE')).toBe('Marking stopped because of a problem on our side.');
    expect(uploadFailureReason(undefined)).toBe('Marking stopped because of a problem on our side.');
  });
});
