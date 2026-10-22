// Offline guest-only localhost setup. No real Firebase project/provider credentials.
const backendOrigin = 'http://127.0.0.1:5001';
export const environment = {
  production: false,
  adaptivePracticeFixtureEnabled: false,
  apiUrl: `${backendOrigin}/api`, backendUrl: backendOrigin,
  API_URL: `${backendOrigin}/api`, apiBaseUrl: `${backendOrigin}/api`,
  UPLOADS_URL: `${backendOrigin}/uploads`, FRONTEND_URL: 'http://localhost:4200',
  stripePublishableKey: '',
  firebase: { apiKey: 'offline-local-shadow-not-a-real-key', authDomain: 'localhost',
    projectId: 'local-shadow-offline', storageBucket: 'local-shadow-offline.invalid',
    messagingSenderId: '000000000000', appId: 'offline-local-shadow' }
};
