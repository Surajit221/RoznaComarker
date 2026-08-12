import { environment } from './environment.prod';

describe('production URL configuration', () => {
  it('uses the canonical HTTPS production origins', () => {
    expect(environment.apiUrl).toBe('https://comarkerback.roznahub.com/api');
    expect(environment.backendUrl).toBe('https://comarkerback.roznahub.com');
    expect(environment.API_URL).toBe('https://comarkerback.roznahub.com/api');
    expect(environment.apiBaseUrl).toBe('https://comarkerback.roznahub.com/api');
    expect(environment.UPLOADS_URL).toBe('https://comarkerback.roznahub.com/uploads');
    expect(environment.FRONTEND_URL).toBe('https://comarkers.roznahub.com');
  });

  it('appends the API prefix exactly once', () => {
    expect(`${environment.apiUrl}/assignments/my`).toBe(
      'https://comarkerback.roznahub.com/api/assignments/my'
    );
    expect(`${environment.API_URL}/assignments/my`).not.toContain('/api/api/');
  });

  it('does not contain a localhost production fallback', () => {
    expect(JSON.stringify(environment)).not.toContain('localhost');
  });
});
