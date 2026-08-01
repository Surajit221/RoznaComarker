const backendOrigin = 'http://localhost:5000';

export const environment = {
  production: false,
  adaptivePracticeFixtureEnabled: false,

  apiUrl: `${backendOrigin}/api`,
  backendUrl: backendOrigin,

  API_URL: `${backendOrigin}/api`,

  UPLOADS_URL: `${backendOrigin}/uploads`,

  FRONTEND_URL: 'http://localhost:4200',

  apiBaseUrl: `${backendOrigin}/api`,

  firebase: {
    apiKey: 'AIzaSyAFT9-mTYIg6YUX6W6-Yn4I_FM4eJVOcgM',

    authDomain: 'rozna-comaker.firebaseapp.com',

    projectId: 'rozna-comaker',

    storageBucket: 'rozna-comaker.appspot.com',

    messagingSenderId: '705201289510',

    appId: '1:705201289510:web:e41bae6f26f915e66da9e7',
  },
};
