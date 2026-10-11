import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { AuthService } from './auth.service';
import { httpTestingProviders } from '../../testing/standalone-test-providers';
import { authErrorMessage } from './auth-error.util';

describe('AuthService new password boundary', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [...httpTestingProviders, { provide: Auth, useValue: { currentUser: null } }],
  }));

  it('rejects weak signup passwords even when the form is bypassed', async () => {
    const auth = TestBed.inject(AuthService);
    await expectAsync(auth.signupWithEmail('person@example.test', 'abc'))
      .toBeRejectedWith(jasmine.objectContaining({ code: 'auth/password-does-not-meet-requirements' }));
  });

  it('maps provider policy errors to safe, actionable copy', () => {
    for (const code of ['auth/weak-password', 'auth/password-does-not-meet-requirements']) {
      expect(authErrorMessage({ code }, 'signup')).toBe('Your password does not meet the security requirements.');
    }
  });
});
