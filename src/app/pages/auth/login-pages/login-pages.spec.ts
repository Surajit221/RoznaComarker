import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPages } from './login-pages';
import { routedComponentProviders, signedOutUserProviders } from '../../../../testing/standalone-test-providers';
import { AuthService } from '../../../auth/auth.service';

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
  });
});
