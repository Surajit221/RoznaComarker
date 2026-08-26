import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { PostAuthNavigationService } from '../../../auth/post-auth-navigation.service';
import { VerifyEmail } from './verify-email';

describe('VerifyEmail', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let postAuth: jasmine.SpyObj<PostAuthNavigationService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj('AuthService', ['pendingVerificationEmail', 'completeEmailVerification',
      'resendVerificationEmail', 'logout']);
    postAuth = jasmine.createSpyObj('PostAuthNavigationService', ['navigate']);
    auth.pendingVerificationEmail.and.resolveTo('person@example.test');
    postAuth.navigate.and.resolveTo(true);
    await TestBed.configureTestingModule({ imports: [VerifyEmail], providers: [provideRouter([]),
      { provide: AuthService, useValue: auth }, { provide: PostAuthNavigationService, useValue: postAuth }] })
      .compileComponents();
  });

  it('reloads verification state and warns while still unverified', async () => {
    auth.completeEmailVerification.and.resolveTo(null);
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    await component.checkVerification();
    expect(auth.completeEmailVerification).toHaveBeenCalledTimes(1);
    expect(component.error).toContain('not verified yet');
    expect(component.error).toContain('Spam or Junk');
  });

  it('continues through the existing post-auth resolver after verification', async () => {
    const response = { success: true, token: 'jwt', user: { id: '1', email: 'person@example.test', role: null } };
    auth.completeEmailVerification.and.resolveTo(response);
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    await component.checkVerification();
    expect(postAuth.navigate).toHaveBeenCalledWith(response.user);
  });

  it('prevents resend during cooldown and supports resend after it expires', async () => {
    auth.resendVerificationEmail.and.resolveTo('person@example.test');
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    component.cooldown = 10;
    await component.resend();
    expect(auth.resendVerificationEmail).not.toHaveBeenCalled();
    component.cooldown = 0;
    await component.resend();
    expect(auth.resendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(component.cooldown).toBe(60);
    component.ngOnDestroy();
  });

  it('does not start a cooldown when resend delivery fails', async () => {
    auth.resendVerificationEmail.and.rejectWith({ code: 'auth/network-request-failed' });
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    component.cooldown = 0;
    await component.resend();
    expect(component.cooldown).toBe(0);
    expect(component.error).toContain('connection');
  });

  it('shows Spam/Junk guidance and the remaining cooldown in the page', async () => {
    const fixture = TestBed.createComponent(VerifyEmail);
    fixture.componentInstance.cooldown = 42;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Check your Spam or Junk folder');
    expect(fixture.nativeElement.textContent).toContain('Resend available in 42s');
  });

  it('shows responsive loading labels and disables both verification actions', () => {
    const fixture = TestBed.createComponent(VerifyEmail);
    fixture.componentInstance.checking = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking verification...');
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('shows Spam/Junk guidance after a successful resend', async () => {
    auth.resendVerificationEmail.and.resolveTo('person@example.test');
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    component.cooldown = 0;
    await component.resend();
    expect(component.message).toContain('Spam/Junk');
    component.ngOnDestroy();
  });

  it('uses action-focused wording for a partial-signup delivery warning', async () => {
    history.replaceState({ verificationDeliveryWarning: true }, '');
    const fixture = TestBed.createComponent(VerifyEmail);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.error).toContain('Resend verification email button below');
    expect(fixture.componentInstance.error).toContain('Spam or Junk');
    history.replaceState({}, '');
  });
});
