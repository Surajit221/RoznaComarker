const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
  ? window.location.origin
  : '';

export const environment = {

    production: true,

    apiUrl: origin,

    API_URL: `${origin}/api`,

    UPLOADS_URL: `${origin}/uploads`,

    FRONTEND_URL: origin,

    apiBaseUrl: `${origin}/api`,

    firebase: {

        apiKey: "AIzaSyAFT9-mTYIg6YUX6W6-Yn4I_FM4eJVOcgM",

        authDomain: "rozna-comaker.firebaseapp.com",

        projectId: "rozna-comaker",

        storageBucket: "rozna-comaker.appspot.com",

        messagingSenderId: "705201289510",

        appId: "1:705201289510:web:e41bae6f26f915e66da9e7"

    }



};

