import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // 1. Check by UID first (normal case)
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role || 'user');
          } else {
            // 2. Fall back to email-based lookup (admin-invited users or seeded admins)
            const emailKey = user.email.replace(/\./g, '_').replace(/@/g, '_at_');
            const emailDocRef = doc(db, 'users', emailKey);
            const emailDoc = await getDoc(emailDocRef);
            if (emailDoc.exists()) {
              const role = emailDoc.data().role || 'user';
              // Migrate the doc to UID-based key for future logins
              await setDoc(doc(db, 'users', user.uid), { ...emailDoc.data(), uid: user.uid });
              await deleteDoc(emailDocRef);
              setUserRole(role);
            } else {
              // 3. Also check by email field query (legacy support)
              const q = query(collection(db, 'users'), where('email', '==', user.email));
              const qs = await getDocs(q);
              if (!qs.empty) {
                const role = qs.docs[0].data().role || 'user';
                await setDoc(doc(db, 'users', user.uid), { ...qs.docs[0].data(), uid: user.uid });
                setUserRole(role);
              } else {
                // Hardcoded fallback to bootstrap admin
                if (user.email === 'fomra.digital26@gmail.com') {
                  setUserRole('admin');
                  // Attempt to seed silently
                  setDoc(doc(db, 'users', user.uid), { email: user.email, role: 'admin', uid: user.uid }).catch(console.error);
                } else {
                  setUserRole('user');
                }
              }
            }
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
          if (user.email === 'fomra.digital26@gmail.com') {
             setUserRole('admin');
          } else {
             setUserRole('user');
          }
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    isAdmin: userRole === 'admin',
    login,
    logout,
    resetPassword,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
