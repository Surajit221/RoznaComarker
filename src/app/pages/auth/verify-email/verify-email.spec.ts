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
});
