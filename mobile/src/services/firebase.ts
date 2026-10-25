import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFunctions } from 'firebase/functions';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
import type { Budget } from '../domain/budget';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);
export function firebaseApp() {
  if (!firebaseConfigured) throw new Error('Add Firebase configuration to mobile/.env first.');
  return getApps().length ? getApp() : initializeApp(config);
}
export async function ensureFirebaseUser() {
  const app = firebaseApp();
  let auth;
  try {
    const nativePersistence = (FirebaseAuth as typeof FirebaseAuth & { getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence }).getReactNativePersistence;
    auth = FirebaseAuth.initializeAuth(app, { persistence: Platform.OS === 'web' ? FirebaseAuth.browserLocalPersistence : nativePersistence ? nativePersistence(AsyncStorage) : FirebaseAuth.inMemoryPersistence });
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/already-initialized') throw e;
    auth = FirebaseAuth.getAuth(app);
  }
  await auth.authStateReady();
  return auth.currentUser ?? (await FirebaseAuth.signInAnonymously(auth)).user;
}
export const firebaseFunctions = () => {
  const localUrl = process.env.EXPO_PUBLIC_NESSIE_BACKEND_URL?.trim();
  if (localUrl) {
    const url = new URL(localUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS tunnel URL for the phone backend connection.');
    return getFunctions(firebaseApp(), localUrl.replace(/\/$/, ''));
  }
  return getFunctions(firebaseApp(), process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1');
};
export async function saveCloudSnapshot(budget: Budget) {
  const app = firebaseApp();
  const user = await ensureFirebaseUser();
  await setDoc(doc(getFirestore(app), 'users', user.uid, 'budgets', 'current'), budget);
  return user.uid;
}
