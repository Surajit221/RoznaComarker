import { environment } from './environment.prod';

describe('production URL configuration', () => {
  it('uses the canonical localhost deployment origins', () => {
    expect(environment.apiUrl).toBe('http://localhost:5000/api');
    expect(environment.backendUrl).toBe('http://localhost:5000');
    expect(environment.API_URL).toBe('http://localhost:5000/api');
    expect(environment.apiBaseUrl).toBe('http://localhost:5000/api');
    expect(environment.UPLOADS_URL).toBe('http://localhost:5000/uploads');
    expect(environment.FRONTEND_URL).toBe('http://localhost:4200');
  });

  it('appends the API prefix exactly once', () => {
    expect(`${environment.apiUrl}/assignments/my`).toBe(
      'http://localhost:5000/api/assignments/my'
    );
    expect(`${environment.API_URL}/assignments/my`).not.toContain('/api/api/');
  });

  it('uses localhost for local development', () => {
    expect(JSON.stringify(environment)).toContain('localhost');
  });
});
