/**
 * One-time Admin Seed Script
 * Usage: node scripts/seed-admin.js
 *
 * This writes the admin user record to Firestore.
 * When fomra.digital26@gmail.com logs in, AuthContext will find this record
 * (by email query), grant admin role, and migrate it to a UID-based doc.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDdfocDdDGIpVp8WYjruKzaYfUXnUR0v8c",
  authDomain: "synergy-reports-277c9.firebaseapp.com",
  projectId: "synergy-reports-277c9",
  storageBucket: "synergy-reports-277c9.firebasestorage.app",
  messagingSenderId: "250328120389",
  appId: "1:250328120389:web:7294cf88c1d8ffa3e7f72c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ADMIN_EMAIL = 'fomra.digital26@gmail.com';
// Document key: email with dots and @ replaced (consistent with AdminPanel logic)
const emailKey = ADMIN_EMAIL.replace(/\./g, '_').replace(/@/g, '_at_');

async function seedAdmin() {
  try {
    await setDoc(doc(db, 'users', emailKey), {
      email: ADMIN_EMAIL,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ Admin user seeded successfully!`);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Role:  admin`);
    console.log('\n⚠️  Make sure this user exists in Firebase Authentication.');
    console.log('   Go to: Firebase Console → Authentication → Add User');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error writing to Firestore:', err.message);
    process.exit(1);
  }
}

seedAdmin();
