import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassStudentPages } from './detail-my-class-student-pages';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { AuthService } from '../../../../auth/auth.service';
import { of, Subject } from 'rxjs';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

describe('DetailMyClassStudentPages', () => {
  let component: DetailMyClassStudentPages;
  let fixture: ComponentFixture<DetailMyClassStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassStudentPages],
      providers: [
        ...routedHttpTestProviders({ classId: 'class-1' }),
        { provide: AuthService, useValue: { getBackendJwt: () => null } },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires confirmation before opening the existing uploader for another draft', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true
    }];
    const alert = (component as any).alert;
    const confirm = spyOn(alert, 'showConfirm').and.resolveTo(false);

    await component.openUpload('assignment-1');
    expect(confirm).toHaveBeenCalledWith(
      'Submit another draft?',
      'Your new draft will replace the current version used for grading and will be processed again.',
      'Submit New Draft',
      'Cancel'
    );
    expect(component.showDialog).toBeFalse();
    expect(component.openSheet).toBeFalse();
  });

  it('does not open the uploader when another draft is disabled', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: false
    }];
    const warning = spyOn((component as any).alert, 'showWarning');

    await component.openUpload('assignment-1');

    expect(warning).toHaveBeenCalled();
    expect(component.selectedAssignmentId).toBeNull();
  });

  it('guides the student to Adaptive Learning while the current practice is incomplete', async () => {
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true,
      requireAdaptiveBeforeResubmission: true, adaptiveResubmissionSatisfied: false
    }];
    const warning = spyOn((component as any).alert, 'showWarning');
    const navigate = spyOn((component as any).router, 'navigate');

    await component.openUpload('assignment-1');

    expect(warning).toHaveBeenCalledWith(
      'Complete Adaptive Learning first',
      'Complete Adaptive Learning for your current draft before submitting another draft.'
    );
    expect(navigate).toHaveBeenCalled();
  });

  it('hides the resubmit action and shows the adaptive requirement while incomplete', () => {
    component.isLoading = false;
    component.assignments = [{
      id: 'assignment-1', title: 'Essay', dueDate: '', submitted: 1, total: 1,
      status: 'completed', showMarksToStudent: true, allowResubmission: true,
      requireAdaptiveBeforeResubmission: true, adaptiveResubmissionSatisfied: false
    }];
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Complete Adaptive Learning before another draft.');
    expect(text).not.toContain('Submit Another Draft');
  });

  it('maps current completed and no-weakness adaptive states as eligible', async () => {
    const submissionApi = (component as any).submissionApi;
    const adaptiveApi = (component as any).adaptivePracticeApi;
    spyOn(submissionApi, 'getMySubmissionByAssignmentId').and.resolveTo({ _id: 'submission-1' });
    const session = spyOn(adaptiveApi, 'getSession');
    const assignment = { _id: 'assignment-1', title: 'Essay', allowResubmission: true,
      requireAdaptiveBeforeResubmission: true } as any;

    session.and.returnValue(of({ state: 'ready', session: null, progress: { completed: true } }));
    expect((await (component as any).mapAssignment(assignment)).adaptiveResubmissionSatisfied).toBeTrue();

    session.and.returnValue(of({ state: 'no-weaknesses', session: null }));
    expect((await (component as any).mapAssignment(assignment)).adaptiveResubmissionSatisfied).toBeTrue();
  });

  it('shows a safe connectivity message for status-zero assignment failures', async () => {
    component.classId = 'class-1';
    component.isLoading = false;
    spyOn((component as any).assignmentApi, 'getMyAssignments').and.rejectWith(
      new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', url: 'https://backend.example/api/assignments/my' })
    );

    await component.loadAssignments();

    expect(component.errorModal.message).toBe('Unable to reach the server. Check your connection and try again.');
    expect(component.errorModal.message).not.toContain('https://');
  });

  it('shows 429 for assignment loading without calling the server unreachable', async () => {
    component.classId = 'class-1';
    component.isLoading = false;
    spyOn((component as any).assignmentApi, 'getMyAssignments').and.rejectWith(
      new HttpErrorResponse({ status: 429, statusText: 'Too Many Requests' }));
    await component.loadAssignments();
    expect(component.errorModal.message).toContain('Too many requests');
    expect(component.errorModal.message).not.toContain('Unable to reach');
  });

  it('preserves selected files and blocks double upload after a 429', async () => {
    const file = new File(['essay'], 'essay.txt', { type: 'text/plain' });
    component.selectedAssignmentId = 'assignment-1';
    component.selectedFiles = [file];
    component.isLoading = false;
    const pending = new Subject<any>();
    const submit = spyOn((component as any).uploadApi, 'submitSubmissionFiles').and.returnValue(pending.asObservable());
    const first = component.uploadFiles();
    await component.uploadFiles();
    expect(submit).toHaveBeenCalledTimes(1);
    pending.error(new HttpErrorResponse({ status: 429,
      headers: new HttpHeaders({ 'Retry-After': '60' }) }));
    await first;
    expect(component.selectedFiles).toEqual([file]);
    expect(component.uploadProgressPercent).toBeNull();
    expect(component.isLoading).toBeFalse();
    expect(component.errorModal.message).toContain('Too many requests');

    const retryPending = new Subject<any>();
    submit.and.returnValue(retryPending.asObservable());
    const retry = component.uploadFiles();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.calls.mostRecent().args[0]).toEqual([file]);
    retryPending.error(new HttpErrorResponse({ status: 429 }));
    await retry;
    expect(component.selectedFiles).toEqual([file]);
  });

  it('keeps mobile Upload Image separate from Submit and leaves PDF browsing available', () => {
    Object.assign(component.device, {
      isDesktop: () => false,
      isMobile: () => true,
      isTablet: () => false
    });
    component.openSheet = true;
    component.selectedAssignmentId = 'assignment-1';
    component.isLoading = false;
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector('.student-sheet-actions') as HTMLElement;
    expect(actions).toBeTruthy();
    const buttons = Array.from(actions.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Upload Image', 'Submit', 'Cancel']);
    expect(buttons[1].disabled).toBeTrue();
    const imagePicker = component.uploadFormSheet!.imageInput.nativeElement;
    const browsePicker = component.uploadFormSheet!.fileInput.nativeElement;
    expect(browsePicker.accept).toContain('application/pdf');
    const pickerClick = spyOn(imagePicker, 'click');
    const submit = spyOn(component, 'uploadFiles');

    buttons[0].click();
    expect(pickerClick).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();

    component.onFilesSelected([new File(['essay'], 'essay.jpg', { type: 'image/jpeg' })]);
    fixture.detectChanges();
    expect(buttons[1].disabled).toBeFalse();
    buttons[1].click();
    expect(submit).toHaveBeenCalledTimes(1);
    buttons[2].click();
    expect(component.openSheet).toBeFalse();
  });

  it('fits mobile submission controls and long filenames at 375, 390, and 430px', () => {
    Object.assign(component.device, {
      isDesktop: () => false,
      isMobile: () => true,
      isTablet: () => false
    });
    component.openSheet = true;
    component.isLoading = false;
    const file = new File(['essay'], 'a-very-long-essay-filename-that-must-not-push-the-controls-off-screen.jpg',
      { type: 'image/jpeg' });
    component.selectedFiles = [file];
    component.uploadProgressPercent = 100;
    component.uploadErrorMessage = 'Too many requests. Please wait before trying again.';
    fixture.detectChanges();
    component.uploadFormSheet!.files = [{ file, name: file.name, size: file.size }];
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('.student-sheet-content') as HTMLElement;
    const actions = sheet.querySelector('.student-sheet-actions') as HTMLElement;
    expect(sheet.textContent).toContain('Creating submission...');
    for (const width of [375, 390, 430]) {
      sheet.style.width = `${width}px`;
      sheet.style.boxSizing = 'border-box';
      expect(sheet.scrollWidth).withContext(`${width}px sheet overflow`).toBeLessThanOrEqual(sheet.clientWidth);
      for (const button of Array.from(actions.querySelectorAll('button'))) {
        expect(button.getBoundingClientRect().height).withContext(`${width}px touch target`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
