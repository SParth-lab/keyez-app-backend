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

// Get Firebase Messaging instance
const getMessaging = () => {
  if (!firebaseApp) {
    console.warn('Firebase not initialized, messaging unavailable');
    return null;
  }
  return admin.messaging();
};

// Send push notification using FCM
const sendPushNotification = async (tokens, notification, data = {}) => {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      throw new Error('Firebase messaging not available');
    }

    // Ensure tokens is an array
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    
    if (tokenArray.length === 0) {
      throw new Error('No FCM tokens provided');
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        notificationId: data.notificationId || '',
        type: data.type || 'system',
        priority: data.priority || 'normal'
      },
      tokens: tokenArray
    };

    const response = await messaging.sendMulticast(message);
    
    console.log(`✅ Push notification sent successfully:`, {
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokenArray.length
    });

    return {
      success: true,
      response,
      successCount: response.successCount,
      failureCount: response.failureCount,
      results: response.responses
    };

  } catch (error) {
    console.error('❌ Failed to send push notification:', error);
    return {
      success: false,
      error: error.message,
      successCount: 0,
      failureCount: Array.isArray(tokens) ? tokens.length : 1
    };
  }
};

// Send notification to a single token
const sendNotificationToToken = async (token, notification, data = {}) => {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      throw new Error('Firebase messaging not available');
    }

    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        notificationId: data.notificationId || '',
        type: data.type || 'system',
        priority: data.priority || 'normal'
      },
      token: token
    };

    const response = await messaging.send(message);
    
    console.log(`✅ Push notification sent to token: ${token.substring(0, 20)}...`);
    return {
      success: true,
      messageId: response,
      token
    };

  } catch (error) {
    console.error(`❌ Failed to send notification to token ${token.substring(0, 20)}...:`, error);
    return {
      success: false,
      error: error.message,
      token
    };
  }
};

// Verify FCM token validity
const verifyFcmToken = async (token) => {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      return { valid: false, error: 'Firebase messaging not available' };
    }

    // Try to send a dry-run message to verify token
    const message = {
      notification: {
        title: 'Token Verification',
        body: 'This is a test notification'
      },
      token: token,
      dryRun: true
    };

    await messaging.send(message);
    return { valid: true };

  } catch (error) {
    console.warn(`Invalid FCM token: ${token.substring(0, 20)}...`, error.message);
    return { valid: false, error: error.message };
  }
};

module.exports = {
  initializeFirebase,
  getFirebaseAdmin,
  getFirestore,
  getDatabase,
  getAuth,
  getMessaging,
  sendPushNotification,
  sendNotificationToToken,
  verifyFcmToken
}; 