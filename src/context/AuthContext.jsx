import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { DEFAULT_SETTINGS, MANAGER_ROLES, MEMBER_ROLES } from '../lib/constants.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function mergeSettings(s) {
  const base = { ...DEFAULT_SETTINGS, ...(s || {}) };
  base.thresholds = { ...DEFAULT_SETTINGS.thresholds, ...(s?.thresholds || {}) };
  base.questionPoints = { ...DEFAULT_SETTINGS.questionPoints, ...(s?.questionPoints || {}) };
  if (!Array.isArray(base.criteria) || !base.criteria.length) base.criteria = DEFAULT_SETTINGS.criteria;
  if (!base.topics || !Object.keys(base.topics).length) base.topics = DEFAULT_SETTINGS.topics;
  return base;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = đang kiểm tra
  const [profile, setProfile] = useState(null);
  const [rawSettings, setRawSettings] = useState(null);
  const [needSetup, setNeedSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const creating = useRef(false);

  useEffect(() => {
    let unsubProfile = () => {};
    let unsubSettings = () => {};
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      unsubProfile();
      unsubSettings();
      setUser(u);
      setProfile(null);
      setNeedSetup(false);
      setError('');
      if (!u) {
        setLoading(false);
        return;
      }
      setLoading(true);
      unsubSettings = onSnapshot(
        doc(db, 'settings', 'app'),
        (s) => setRawSettings(s.exists() ? s.data() : null),
        () => {}
      );
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        async (snap) => {
          if (snap.exists()) {
            setProfile({ id: snap.id, ...snap.data() });
            setNeedSetup(false);
            setLoading(false);
            return;
          }
          if (creating.current) return;
          creating.current = true;
          try {
            const st = await getDoc(doc(db, 'settings', 'app'));
            if (!st.exists()) {
              // Hệ thống chưa được khởi tạo → người đầu tiên đăng nhập trở thành Tổ trưởng
              setNeedSetup(true);
              setLoading(false);
            } else {
              await setDoc(doc(db, 'users', u.uid), {
                name: u.displayName || u.email.split('@')[0],
                email: u.email,
                photoURL: u.photoURL || '',
                role: 'pending',
                createdAt: serverTimestamp(),
              });
            }
          } catch (e) {
            setError(e.message);
            setLoading(false);
          } finally {
            creating.current = false;
          }
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        }
      );
    });
    return () => {
      unsubAuth();
      unsubProfile();
      unsubSettings();
    };
  }, []);

  async function bootstrap({ schoolName, groupName, departmentName, subject, name }) {
    const u = auth.currentUser;
    const batch = writeBatch(db);
    batch.set(doc(db, 'settings', 'app'), {
      ...DEFAULT_SETTINGS,
      schoolName,
      groupName,
      departmentName,
      subject,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', u.uid), {
      name: name || u.displayName || u.email.split('@')[0],
      email: u.email,
      photoURL: u.photoURL || '',
      role: 'leader',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  const value = useMemo(() => {
    const role = profile?.role;
    return {
      user,
      profile,
      settings: mergeSettings(rawSettings),
      loading: user === undefined || loading,
      error,
      needSetup,
      bootstrap,
      isMember: MEMBER_ROLES.includes(role),
      isManager: MANAGER_ROLES.includes(role),
      isLeader: role === 'leader',
      me: profile ? { uid: profile.id, name: profile.name } : null,
      logout: () => signOut(auth),
    };
  }, [user, profile, rawSettings, loading, error, needSetup]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
