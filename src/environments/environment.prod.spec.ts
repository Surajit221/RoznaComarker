import { environment } from './environment.prod';

describe('production URL configuration', () => {
  it('uses the canonical HTTPS deployment origins', () => {
    expect(environment.apiUrl).toBe('https://comarkerback.roznahub.com');
    expect(environment.API_URL).toBe('https://comarkerback.roznahub.com/api');
    expect(environment.apiBaseUrl).toBe('https://comarkerback.roznahub.com/api');
    expect(environment.UPLOADS_URL).toBe('https://comarkerback.roznahub.com/uploads');
    expect(environment.FRONTEND_URL).toBe('https://comarkers.roznahub.com');
  });

  it('appends the API prefix exactly once', () => {
    expect(`${environment.apiUrl}/api/assignments/my`).toBe(
      'https://comarkerback.roznahub.com/api/assignments/my'
    );
    expect(`${environment.API_URL}/assignments/my`).not.toContain('/api/api/');
  });
});
