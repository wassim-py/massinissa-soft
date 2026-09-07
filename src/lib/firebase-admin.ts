import admin from 'firebase-admin';

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// Only attempt to initialize if the app doesn't already exist AND the key is provided
if (!admin.apps.length) {
  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
    } catch (error) {
      console.error('Firebase admin initialization error: Could not parse service account key.', error);
    }
  } else {
    console.warn('Firebase admin initialization skipped: FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set.');
  }
}

// Safely export storage, it will be null if initialization failed
const adminStorage = admin.apps.length ? admin.storage() : null;

export { adminStorage };
