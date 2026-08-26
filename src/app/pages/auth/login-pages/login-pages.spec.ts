import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPages } from './login-pages';
import { routedComponentProviders, signedOutUserProviders } from '../../../../testing/standalone-test-providers';
import { AuthService } from '../../../auth/auth.service';
import { Router } from '@angular/router';
import { AlertService } from '../../../services/alert.service';

describe('LoginPages', () => {
  let component: LoginPages;
  let fixture: ComponentFixture<LoginPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPages], providers: [...routedComponentProviders(), ...signedOutUserProviders()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not render or require a role selector', () => {
    expect(component.loginForm.contains('role')).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Select Your Role');
  });

  it('opens the forgot-password dialog and rejects an invalid email', async () => {
    component.openForgotPassword();
    component.forgotEmail = 'not-an-email';
    await component.submitForgotPassword();
    fixture.detectChanges();
    expect(component.showForgotPassword).toBeTrue();
    expect(component.forgotPasswordError).toBe('Please enter a valid email address.');
  });

  it('uses a neutral success message for password reset', async () => {
    const auth = TestBed.inject(AuthService) as any;
    auth.requestPasswordReset = jasmine.createSpy().and.resolveTo();
    component.forgotEmail = ' User@Example.test ';
    await component.submitForgotPassword();
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('user@example.test');
    expect(component.forgotPasswordMessage).toContain('If an account supports password sign-in');
    expect(component.forgotPasswordMessage).toContain('Spam/Junk');
  });

  it('routes an account with failed verification delivery to the resend screen without a signup error', async () => {
    const auth = TestBed.inject(AuthService) as any;
    const router = TestBed.inject(Router);
    const alert = TestBed.inject(AlertService);
    auth.signupWithEmail = jasmine.createSpy().and.resolveTo({
      verificationRequired: true, email: 'person@example.test', deliveryWarning: true
    });
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const showError = spyOn(alert, 'showError');
    component.loginForm.patchValue({ email: 'person@example.test', password: 'secret1' });

    await component.onSignup();

    expect(navigate).toHaveBeenCalledWith(['/verify-email'], jasmine.objectContaining({
      replaceUrl: true, state: { verificationDeliveryWarning: true }
    }));
    expect(showError).not.toHaveBeenCalled();
  });

  it('prevents duplicate login submissions while the full authentication chain is pending', async () => {
    const auth = TestBed.inject(AuthService) as any;
    let resolveLogin!: (value: any) => void;
    auth.loginWithEmail = jasmine.createSpy().and.returnValue(new Promise(resolve => resolveLogin = resolve));
    component.loginForm.patchValue({ email: 'person@example.test', password: 'secret1' });

    const first = component.onSubmit();
    await component.onSubmit();
    expect(auth.loginWithEmail).toHaveBeenCalledTimes(1);
    expect(component.activeOperation).toBe('login');
    resolveLogin({ verificationRequired: true });
    await first;
  });

  it('shows stable mobile signup and login loading labels with disabled buttons', () => {
    (component.device as any).width.set(360);
    component.isLoading = true;
    component.activeOperation = 'signup';
    fixture.detectChanges();
    let buttons = Array.from(fixture.nativeElement.querySelectorAll('.auth-button')) as HTMLButtonElement[];
    expect(fixture.nativeElement.textContent).toContain('Creating account...');
    expect(buttons.every(button => button.disabled)).toBeTrue();

    component.activeOperation = 'login';
    fixture.detectChanges();
    buttons = Array.from(fixture.nativeElement.querySelectorAll('.auth-button')) as HTMLButtonElement[];
    expect(fixture.nativeElement.textContent).toContain('Logging in...');
    expect(buttons.every(button => button.disabled)).toBeTrue();
  });
});
