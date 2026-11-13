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

  it('places the existing Google action before email and omits Apple', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const google = form.querySelector('.google-button') as HTMLButtonElement;
    expect(google.textContent).toContain('Continue with Google');
    expect(form.querySelector('.login-divider')?.textContent).toContain('OR');
    expect(form.querySelector('input[type="email"]')).toBeTruthy();
    expect(form.querySelector('input[type="password"]')).toBeTruthy();
    expect(form.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(form.textContent).toContain('Forgot Password?');
    expect(form.textContent).toContain('Sign Up');
    expect(form.innerHTML).not.toContain('ic_apple');
    const email = form.querySelector('input[type="email"]') as HTMLInputElement;
    expect(google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const handler = spyOn(component, 'onGoogleLogin');
    google.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('shows the Rubrilo brand and heading, and no old brand anywhere on the page', () => {
    const root = fixture.nativeElement as HTMLElement;
    // The brand is ONE image: the supplied horizontal logo (icon + name), alt "Rubrilo", at its own 512x164 ratio.
    const logo = root.querySelector('header.login-brand img') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe('logo_and_icon/logo/rubrilo-logo-horizontal-fullcolor@512w.png');
    expect(logo.alt).toBe('Rubrilo');
    expect([logo.getAttribute('width'), logo.getAttribute('height')]).toEqual(['512', '164']);
    expect(root.querySelector('.login-brand__name')).toBeNull();
    expect(root.innerHTML).not.toContain('rubrilo-symbol');
    // The header sits outside the content container, so the logo aligns with the page edge, not the container.
    expect(logo.closest('.login-container')).toBeNull();
    const title = root.querySelector('h1') as HTMLElement;
    expect(title.textContent?.replace(/\s+/g, ' ')).toContain('Supercharged Marking! Just a Few Clicks Away!');
    expect(title.querySelector('.login-title__accent')?.textContent).toBe('Marking!');
    expect(root.innerHTML).not.toMatch(/rozna/i);
    expect(root.textContent).not.toMatch(/\bRH\b/);
  });

  it('labels every field and gives the password toggle an accessible name and state', () => {
    const root = fixture.nativeElement as HTMLElement;
    for (const id of ['email', 'password']) expect(root.querySelector(`label[for="${id}"]`)).withContext(id).toBeTruthy();
    // The original design labels the checkbox by wrapping it in its <label>.
    expect(root.querySelector('#remember')?.closest('label')?.textContent).toContain('Remember Me');
    expect((root.querySelector('#email') as HTMLInputElement).placeholder).toBe('Enter your email');
    expect((root.querySelector('#password') as HTMLInputElement).placeholder).toBe('Password');
    const toggle = root.querySelector('button[aria-controls="password"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click(); fixture.detectChanges();
    expect((root.querySelector('#password') as HTMLInputElement).type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps every control wired to the existing handlers and form controls', () => {
    const root = fixture.nativeElement as HTMLElement;
    const submit = spyOn(component, 'onSubmit').and.resolveTo();
    const signup = spyOn(component, 'onSignup').and.resolveTo();
    const forgot = spyOn(component, 'openForgotPassword');
    (root.querySelector('#remember') as HTMLInputElement).click();
    expect(component.loginForm.value.remember).toBeTrue();
    const forgotButton = [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Forgot Password?') as HTMLButtonElement;
    forgotButton.click();
    expect(forgot).toHaveBeenCalledTimes(1);
    (root.querySelector('.login-actions .signup-action') as HTMLButtonElement).click();
    expect(signup).toHaveBeenCalledTimes(1);
    const login = root.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(login.textContent).toContain('Login');
    login.click();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the original login card design inside the new layout', () => {
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('.login-card') as HTMLElement;
    for (const cls of ['bg-white', 'rounded-[30px]', 'border-4', 'border-[#E2E2E2]', 'shadow-[0px_10px_0_#E2E2E2]', 'p-6']) expect(card.classList).withContext(cls).toContain(cls);
    expect(card.querySelectorAll('input.input-text').length).toBe(2);
    const login = card.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(login.classList).toContain('btn-primary');
    expect(login.querySelector('.bx')).toBeNull();
    expect(login.textContent?.trim()).toBe('Login');
    const forgot = [...card.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Forgot Password?') as HTMLButtonElement;
    expect(forgot.className).toContain('text-[#EE4E4E]');
    expect(forgot.className).toContain('underline');
    expect(card.querySelector('.login-actions .signup-action')?.textContent?.trim()).toBe('Sign Up');
    expect(card.textContent).not.toContain("Don't have an account?");
    expect(card.querySelector('.bx-envelope, .bx-lock-alt, .bx-right-arrow-alt')).toBeNull();
  });

  it('shows the student photo with alt text and no overlay cards on top of it', () => {
    const visual = fixture.nativeElement.querySelector('.login-visual') as HTMLElement;
    expect(visual.getAttribute('aria-hidden')).toBeNull();
    const img = visual.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('img/login/student-desk.png');
    expect(img.alt).toBe('Student writing an essay with AI feedback on screen');
    expect(img.getAttribute('width')).toBe('1536');
    expect(img.getAttribute('height')).toBe('1024');
    expect(visual.querySelector('source[type="image/webp"]')?.getAttribute('srcset')).toBe('img/login/student-desk.webp');
    // The image already contains the Submitted Essay and AI Feedback cards: nothing is drawn over it.
    expect(visual.querySelectorAll('img').length).toBe(1);
    expect(visual.textContent?.trim()).toBe('');
    expect(fixture.nativeElement.innerHTML).not.toContain('student-desk.svg');
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
