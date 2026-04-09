// Firebase configuration
// Replace these values with your actual Firebase project configuration
// Get these from: Firebase Console -> Project Settings -> Your Apps -> SDK Setup
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDdfocDdDGIpVp8WYjruKzaYfUXnUR0v8c",
  authDomain: "synergy-reports-277c9.firebaseapp.com",
  projectId: "synergy-reports-277c9",
  storageBucket: "synergy-reports-277c9.firebasestorage.app",
  messagingSenderId: "250328120389",
  appId: "1:250328120389:web:7294cf88c1d8ffa3e7f72c",
  measurementId: "G-QCNT46QRH6"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
