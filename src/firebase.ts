import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { 
  initializeFirestore, 
  persistentLocalCache,
} from 'firebase/firestore';
import rawConfig from '../firebase-applet-config.json';

// Extract the custom Firestore database ID and build a clean Firebase config
// (initializeApp only accepts standard Firebase config fields)
const { firestoreDatabaseId, ...firebaseConfig } = rawConfig;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Pass the custom database ID as the third argument so Firestore
// connects to the correct named database instead of '(default)'
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache() },
  firestoreDatabaseId
);
