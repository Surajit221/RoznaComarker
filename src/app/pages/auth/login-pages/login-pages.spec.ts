import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPages } from './login-pages';
import { routedComponentProviders, signedOutUserProviders } from '../../../../testing/standalone-test-providers';

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
});
