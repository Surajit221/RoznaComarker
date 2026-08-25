import { authErrorMessage } from './auth-error.util';

describe('authErrorMessage', () => {
  it('maps Firebase signup errors without exposing raw provider text', () => {
    expect(authErrorMessage({ code: 'auth/email-already-in-use', message: 'Firebase: internal detail' }, 'signup'))
      .toContain('already exists');
  });

  it('maps invalid credentials to a neutral login message', () => {
    expect(authErrorMessage({ code: 'auth/user-not-found' }, 'login'))
      .toBe('The email or password is incorrect.');
  });

  it('maps throttled backend responses', () => {
    expect(authErrorMessage({ status: 429 }, 'verification')).toContain('Too many attempts');
  });
});
