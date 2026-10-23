import { environment } from './environment.local-shadow';
describe('isolated localhost guest configuration', () => {
  it('uses only the isolated loopback backend for every API alias', () => {
    for (const key of ['apiUrl', 'backendUrl', 'API_URL', 'apiBaseUrl', 'UPLOADS_URL'] as const) {
      expect(new URL(environment[key]).origin).toBe('http://127.0.0.1:5001');
    }
    expect(environment.FRONTEND_URL).toBe('http://localhost:4200');
  });
  it('does not configure the shared Firebase project or payment key', () => {
    expect(environment.firebase.projectId).toBe('local-shadow-offline');
    expect(environment.firebase.authDomain).toBe('localhost');
    expect(environment.stripePublishableKey).toBe('');
  });
});
