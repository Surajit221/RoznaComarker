import { environment } from './environment';

describe('development URL configuration', () => {
  it('derives API and upload endpoints from the localhost backend origin', () => {
    expect(environment.production).toBeFalse();
    expect(environment.apiUrl).toBe('http://localhost:5000/api');
    expect(environment.backendUrl).toBe('http://localhost:5000');
    expect(environment.API_URL).toBe(environment.apiUrl);
    expect(environment.apiBaseUrl).toBe(environment.apiUrl);
    expect(environment.UPLOADS_URL).toBe(`${environment.backendUrl}/uploads`);
  });

  it('does not couple development to the production backend', () => {
    expect(JSON.stringify(environment)).not.toContain('comarkerback.roznahub.com');
  });
});
