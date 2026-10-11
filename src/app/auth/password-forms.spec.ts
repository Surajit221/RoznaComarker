import { TestBed } from '@angular/core/testing';
import { MyProfilePages } from '../pages/teachers/my-profile-pages/my-profile-pages';
import { MyProfileStudentPages } from '../pages/students/my-profile-student-pages/my-profile-student-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders } from '../../testing/standalone-test-providers';

for (const componentType of [MyProfilePages, MyProfileStudentPages]) {
  describe(`${componentType.name} new password requirements`, () => {
    beforeEach(() => TestBed.configureTestingModule({
      imports: [componentType],
      providers: [...routedComponentProviders(), ...httpTestingProviders, ...authenticatedUserProviders('teacher')],
    }));

    function setup(width = 1280) {
      const fixture = TestBed.createComponent<MyProfilePages | MyProfileStudentPages>(componentType);
      const component = fixture.componentInstance;
      spyOn(component, 'ngOnInit').and.resolveTo();
      (component.device as any).width.set(width);
      component.activeTab = 'security';
      fixture.detectChanges();
      return { fixture, component, element: fixture.nativeElement as HTMLElement };
    }

    for (const width of [360, 768, 1280]) {
      it(`renders the shared checklist, labelled inputs and eye toggle at ${width}px`, () => {
        const { fixture, element } = setup(width);
        expect(element.querySelectorAll('app-password-requirements').length).toBe(1);
        const input = element.querySelector<HTMLInputElement>('[formControlName="newPassword"]')!;
        expect(element.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
        expect(element.querySelector(`#${input.getAttribute('aria-describedby')}`)).toBeTruthy();
        expect(input.autocomplete).toBe('new-password');
        expect(input.type).toBe('password');
        const eye = input.parentElement!.querySelector('button')!;
        expect(eye.type).toBe('button');
        expect(eye.tabIndex).toBe(0);
        eye.click();
        fixture.detectChanges();
        expect(input.type).toBe('text');
        expect(eye.getAttribute('aria-label')).toBe('Hide password');
        eye.click();
        fixture.detectChanges();
        expect(input.type).toBe('password');
      });
    }

    it('accepts any nonempty current password but requires a compliant matching new password', () => {
      const { fixture, component, element } = setup();
      component.securityForm.setValue({ currentPassword: 'old', newPassword: 'Abcdef1!', confirmPassword: 'different' });
      fixture.detectChanges();
      expect(component.securityForm.controls.currentPassword.valid).toBeTrue();
      expect(component.securityForm.hasError('passwordMismatch')).toBeTrue();
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
      expect(element.textContent).not.toContain('Passwords do not match.');
      component.securityForm.controls.confirmPassword.markAsTouched();
      fixture.detectChanges();
      expect(element.textContent).toContain('Passwords do not match.');
      component.securityForm.controls.confirmPassword.setValue('Abcdef1!');
      fixture.detectChanges();
      expect(component.securityForm.valid).toBeTrue();
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeFalse();
      component.securityForm.controls.newPassword.setValue('abcdefgh');
      component.securityForm.controls.confirmPassword.setValue('abcdefgh');
      fixture.detectChanges();
      expect(component.securityForm.invalid).toBeTrue();
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    });

    it('prevents direct weak-password submission without clearing the fields', async () => {
      const { component } = setup();
      component.securityForm.setValue({ currentPassword: 'old', newPassword: 'abc', confirmPassword: 'abc' });
      await component.onUpdatePassword();
      expect(component.isUpdatingPassword).toBeFalse();
      expect(component.securityForm.controls.newPassword.value).toBe('abc');
      expect(component.securityForm.controls.newPassword.touched).toBeTrue();
    });
  });
}
