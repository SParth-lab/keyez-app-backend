const admin = require('firebase-admin');

let firebaseApp = null;

const initializeFirebase = async () => {
  try {
    // Check if Firebase is already initialized
    if (firebaseApp) {
      console.log('Firebase already initialized');
      return firebaseApp;
    }

    // Check if Firebase environment variables are configured
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.log('⚠️  Firebase not configured - skipping initialization');
      console.log('   To enable Firebase, set FIREBASE_PROJECT_ID in .env file');
      return null;
    }

    // Firebase service account configuration
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY ? 
        process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    // Initialize Firebase Admin SDK
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    });

    console.log('Firebase Admin SDK initialized successfully');
    
    return firebaseApp;

  } catch (error) {
    console.error('Firebase initialization failed:', error);
    console.log('⚠️  Firebase features will be disabled');
    return null;
  }
};

// Get Firebase Admin instance
const getFirebaseAdmin = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp;
};

// Get Firestore instance
const getFirestore = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp.firestore();
};

// Get Realtime Database instance
const getDatabase = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp.database();
};

// Get Auth instance
const getAuth = () => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp.auth();
};

module.exports = {
  initializeFirebase,
  getFirebaseAdmin,
  getFirestore,
  getDatabase,
  getAuth
}; 