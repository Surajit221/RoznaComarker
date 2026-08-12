import {
  clearPrivateAuthStorage,
  decodeBackendJwt,
  isBackendJwtUsable,
  readUsableBackendJwt
} from './backend-token.util';

function token(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${encoded}.signature`;
}

describe('backend token storage boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps an unexpired backend token and decodes its role', () => {
    const value = token({ role: 'teacher', exp: Math.floor(Date.now() / 1000) + 60 });
    localStorage.setItem('backend_jwt', value);
    expect(isBackendJwtUsable(value)).toBeTrue();
    expect(readUsableBackendJwt()).toBe(value);
    expect(decodeBackendJwt(value)?.role).toBe('teacher');
  });

  it('rejects and removes expired or malformed backend tokens', () => {
    const expired = token({ role: 'teacher', exp: Math.floor(Date.now() / 1000) - 1 });
    localStorage.setItem('backend_jwt', expired);
    expect(readUsableBackendJwt()).toBeNull();
    expect(localStorage.getItem('backend_jwt')).toBeNull();
    localStorage.setItem('backend_jwt', 'malformed');
    expect(readUsableBackendJwt()).toBeNull();
  });

  it('logout storage cleanup removes private auth keys but preserves harmless preferences', () => {
    for (const key of ['backend_jwt', 'token', 'authToken', 'role', 'intended_role']) {
      localStorage.setItem(key, 'private');
    }
    sessionStorage.setItem('token', 'private');
    sessionStorage.setItem('authToken', 'private');
    localStorage.setItem('theme', 'dark');

    clearPrivateAuthStorage();

    expect(localStorage.getItem('backend_jwt')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(localStorage.getItem('intended_role')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
