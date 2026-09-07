import { initializeApp, getApp, getApps } from "firebase/app";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// IMPORTANT: Replace these with your actual Firebase project credentials
// For better security, store these values in your .env.local file
const firebaseConfig = {
  apiKey: "AIzaSyBCExJBpPmAdwhVGK4xxNbDXn_VZq6WTb4",
  authDomain: "wassim-school.firebaseapp.com",
  projectId: "wassim-school",
  storageBucket: "wassim-school.firebasestorage.app",
  messagingSenderId: "19540998343",
  appId: "1:19540998343:web:d4da29156c436eadc466e2",
  measurementId: "G-GB1M184E06"
};

// Initialize Firebase
// This check prevents re-initializing the app on hot reloads in development
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const storage = getStorage(app);

export { app, storage };
