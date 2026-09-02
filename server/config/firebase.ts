import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs/promises';
import path from 'path';

let firestoreDb: admin.firestore.Firestore | null = null;
let storageBucketName = '';

export async function initFirebase() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      // PowerShell ConvertTo-Json double-escapes \n inside strings (\\n).
      // Fix that before parsing so JSON.parse doesn't throw on the private key.
      const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        .replace(/\\\\n/g, '\\n')   // \\n → \n  (double-escaped newlines)
        .replace(/\\\\t/g, '\\t');  // \\t → \t  (double-escaped tabs, just in case)
      const serviceAccount = JSON.parse(rawJson);
      
      let config: any = {};
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        const configData = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(configData);
      } catch (e) {
        console.log('No firebase-applet-config.json found, using defaults');
      }

      const projectId = serviceAccount.project_id;
      
      if (config.projectId && config.projectId !== projectId) {
        console.warn(`[Firebase] Project ID mismatch: Config has ${config.projectId}, but Service Account is for ${projectId}. Using ${projectId}.`);
      }

      console.log(`[Firebase] Initializing for project: ${projectId}`);
      if (config.firestoreDatabaseId) {
        console.log(`[Firebase] Target Database: ${config.firestoreDatabaseId}`);
      }

      if (!admin.apps.length) {
        storageBucketName = process.env.FIREBASE_STORAGE_BUCKET || config.storageBucket || `${projectId}.appspot.com`;
        
        // Fallback guess just in case .appspot.com isn't the one
        if (!process.env.FIREBASE_STORAGE_BUCKET && config.storageBucket) {
           storageBucketName = config.storageBucket;
        }

        console.log(`[Firebase] Initializing with Storage Bucket: ${storageBucketName}`);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: projectId,
          storageBucket: storageBucketName
        });
      }
      
      if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)') {
        console.log(`[Firebase] Using database: ${config.firestoreDatabaseId}`);
        firestoreDb = getAdminFirestore(admin.app(), config.firestoreDatabaseId);
      } else {
        console.log('[Firebase] Using (default) database.');
        firestoreDb = getAdminFirestore();
      }
    } catch (e: any) {
      console.error('[Firebase] Critical Initialization Error:', e.message);
      if (e.stack) console.error(e.stack);
      // Final attempt at default if everything else failed
      try {
        if (admin.apps.length) {
          firestoreDb = getAdminFirestore();
          console.log('[Firebase] Emergency fallback to (default) database.');
        }
      } catch (finalErr) {}
    }
  } else {
    console.warn('[Firebase] GOOGLE_SERVICE_ACCOUNT_JSON is missing from .env');
  }
}

export const getFirestore = () => {
  if (!firestoreDb) throw new Error('Firestore not initialized. Ensure GOOGLE_SERVICE_ACCOUNT_JSON is set.');
  return firestoreDb;
};

export const getStorageBucketName = () => storageBucketName;
