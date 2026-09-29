import { TestBed } from '@angular/core/testing';
import { InviteStudentsDialog, parseInviteEmails } from './invite-students-dialog';
import { DeviceService } from '../../../services/device.service';
import { AlertService } from '../../../services/alert.service';

describe('InviteStudentsDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InviteStudentsDialog], providers: [
      { provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } },
      { provide: AlertService, useValue: { showError: jasmine.createSpy(), showSuccess: jasmine.createSpy() } }
    ] }).compileComponents();
  });

  it('accepts comma-plus-space and deduplicates normalized addresses', () => {
    expect(parseInviteEmails(' S.ALHARSHI@CSQU.EDU.OM, salahalharshi@gmail.com, s.alharshi@csqu.edu.om '))
      .toEqual({ emails: ['s.alharshi@csqu.edu.om', 'salahalharshi@gmail.com'], invalid: [], tooMany: false });
  });

  it('validates each address and shows the invalid value inline', () => {
    const fixture = TestBed.createComponent(InviteStudentsDialog);
    fixture.componentInstance.open = true;
    fixture.componentInstance.emailsControl?.setValue('valid@example.com, wrong-email');
    fixture.componentInstance.emailsControl?.markAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invalid email: wrong-email');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
  });

  it('emits exactly two normalized emails and disables sending while pending', () => {
    const fixture = TestBed.createComponent(InviteStudentsDialog);
    const component = fixture.componentInstance;
    component.open = true;
    const sent = jasmine.createSpy();
    component.invite.subscribe(sent);
    component.emailsControl?.setValue(' S.ALHARSHI@CSQU.EDU.OM, salahalharshi@gmail.com');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    expect(sent).toHaveBeenCalledOnceWith(['s.alharshi@csqu.edu.om', 'salahalharshi@gmail.com']);
    component.isSubmitting = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
    component.onSubmit();
    expect(sent).toHaveBeenCalledTimes(1);
  });
});
