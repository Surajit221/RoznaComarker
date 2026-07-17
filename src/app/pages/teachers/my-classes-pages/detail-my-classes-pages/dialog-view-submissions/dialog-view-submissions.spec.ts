import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SubmissionApiService, type BackendSubmission } from '../../../../../api/submission-api.service';
import { AlertService } from '../../../../../services/alert.service';
import { DeviceService } from '../../../../../services/device.service';
import { DialogViewSubmissions } from './dialog-view-submissions';

describe('DialogViewSubmissions loading states', () => {
  let component: DialogViewSubmissions;
  let fixture: ComponentFixture<DialogViewSubmissions>;
  let resolveRequest: (value: BackendSubmission[]) => void;
  let rejectRequest: () => void;
  const api = {
    getSubmissionsByAssignment: jasmine.createSpy().and.callFake(() => new Promise<BackendSubmission[]>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    })),
  };

  beforeEach(async () => {
    api.getSubmissionsByAssignment.calls.reset();
    await TestBed.configureTestingModule({
      imports: [DialogViewSubmissions],
      providers: [
        { provide: SubmissionApiService, useValue: api },
        { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
        { provide: AlertService, useValue: { showError: jasmine.createSpy() } },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogViewSubmissions);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('assignmentId', 'assignment-a');
    fixture.detectChanges();
  });

  it('opens in loading state with three skeleton rows', () => {
    expect(component.modalState).toBe('loading');
    expect(fixture.nativeElement.querySelectorAll('.submission-skeleton-row').length).toBe(3);
  });

  it('shows the empty state only after a successful empty response', async () => {
    resolveRequest([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.modalState).toBe('empty');
    expect(fixture.nativeElement.textContent).toContain('No submissions have been received yet.');
  });

  it('replaces a failed request with a contained retry state', async () => {
    rejectRequest();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.modalState).toBe('error');
    expect(fixture.nativeElement.querySelector('.modal-state--error button')).toBeTruthy();
  });

  it('does not start duplicate requests for the same assignment while loading', () => {
    void component.load();
    expect(api.getSubmissionsByAssignment).toHaveBeenCalledTimes(1);
  });
});
