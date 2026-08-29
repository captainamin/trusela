import { Router } from 'express';
import { z } from 'zod';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { getFirestore } from '../config/firebase.ts';

export const subscriptionRouter = Router();

// Help Helper: SHA-256 Hashing
function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Help Helper: Key Generator
function generateRandomKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'TS';
  for (let block = 0; block < 5; block++) {
    let blockStr = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      blockStr += chars[bytes[i] % chars.length];
    }
    key += '-' + blockStr;
  }
  return key;
}

// Help Helper: Verify Admin Role
const verifyAdmin = async (userId: string) => {
  if (!userId) throw new Error('User ID is required');
  const db = getFirestore();
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userDoc.exists || userData?.role !== 'admin') {
    throw new Error('Access denied: Admin role required');
  }
  return userData;
};

// Input Validation Schemas
const UpdatePlanSchema = z.object({
  planId: z.enum(['monthly', 'quarterly', 'yearly', 'lifetime']),
  name: z.string().min(1, 'Name is required'),
  durationDays: z.number().int().min(1, 'Duration must be at least 1 day'),
  price: z.number().min(0, 'Price cannot be negative'),
  userId: z.string().min(1, 'User ID is required')
});

const GenerateKeysSchema = z.object({
  planId: z.enum(['monthly', 'quarterly', 'yearly', 'lifetime']),
  quantity: z.number().int().min(1).max(1000),
  batchName: z.string().min(3, 'Batch name must be at least 3 characters'),
  userId: z.string().min(1, 'User ID is required')
});

const ActivateKeySchema = z.object({
  activationKey: z.string().regex(/^TS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Invalid key format'),
  userId: z.string().min(1, 'User ID is required'),
  username: z.string().email('Invalid email address')
});

const RevokeKeySchema = z.object({
  keyHash: z.string().min(1, 'Key hash is required'),
  userId: z.string().min(1, 'User ID is required')
});

// Default Plans Initializer
const DEFAULT_PLANS = [
  { id: 'monthly', name: 'Monthly Plan', durationDays: 30, price: 3000 },
  { id: 'quarterly', name: 'Quarterly Plan', durationDays: 90, price: 8000 },
  { id: 'yearly', name: 'Yearly Plan', durationDays: 365, price: 30000 },
  { id: 'lifetime', name: 'Lifetime Plan', durationDays: 99999, price: 100000 }
];

async function ensurePlansInitialized(db: admin.firestore.Firestore) {
  const plansColl = db.collection('subscriptionPlans');
  const snap = await plansColl.limit(1).get();
  if (snap.empty) {
    console.log('[Subscription] Initializing default plans in Firestore...');
    const batch = db.batch();
    for (const plan of DEFAULT_PLANS) {
      const docRef = plansColl.doc(plan.id);
      batch.set(docRef, {
        name: plan.name,
        durationDays: plan.durationDays,
        price: plan.price,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
  }
}

// 1. Get Configurable Plans
subscriptionRouter.get('/plans', async (req, res) => {
  try {
    const db = getFirestore();
    await ensurePlansInitialized(db);
    
    const snap = await db.collection('subscriptionPlans').get();
    const plans: any[] = [];
    snap.forEach(doc => {
      plans.push({ id: doc.id, ...doc.data() });
    });
    
    res.json({ success: true, plans });
  } catch (error: any) {
    console.error('Fetch Plans Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch subscription plans', details: error.message });
  }
});

// 2. Update Plan Settings (Admin Only)
subscriptionRouter.post('/plans/update', async (req, res) => {
  try {
    const { planId, name, durationDays, price, userId } = UpdatePlanSchema.parse(req.body);
    await verifyAdmin(userId);
    
    const db = getFirestore();
    await db.collection('subscriptionPlans').doc(planId).set({
      name,
      durationDays,
      price,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Subscription] Plan ${planId} updated by admin ${userId}`);
    res.json({ success: true, message: `Plan ${name} updated successfully` });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    res.status(500).json({ error: error.message || 'Failed to update plan' });
  }
});

// 3. Generate Activation Keys (Admin Only)
subscriptionRouter.post('/generate-keys', async (req, res) => {
  try {
    const { planId, quantity, batchName, userId } = GenerateKeysSchema.parse(req.body);
    await verifyAdmin(userId);

    const db = getFirestore();
    
    // Retrieve the target plan details
    const planDoc = await db.collection('subscriptionPlans').doc(planId).get();
    if (!planDoc.exists) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }
    const planData = planDoc.data()!;
    const durationDays = planData.durationDays;
    const price = planData.price;

    const rawKeys: string[] = [];
    const keyObjects: any[] = [];
    const generatedDate = new Date().toISOString();
    
    // Generate secure keys and their hashes
    for (let i = 0; i < quantity; i++) {
      const rawKey = generateRandomKey();
      const hash = sha256(rawKey);
      
      rawKeys.push(rawKey);
      keyObjects.push({
        keyId: hash.substring(0, 8).toUpperCase(),
        batchId: batchName,
        activationKeyHash: hash,
        plan: planId,
        durationDays,
        price,
        status: 'unused',
        generatedDate,
        activatedBy: null,
        activatedByUsername: null,
        activatedDate: null,
        expiryDate: null,
        createdBy: userId
      });
    }

    // Write keys to Firestore in batches of 500
    const keysColl = db.collection('activationKeys');
    let batch = db.batch();
    let count = 0;

    for (const keyObj of keyObjects) {
      const docRef = keysColl.doc(keyObj.activationKeyHash);
      batch.set(docRef, keyObj);
      count++;

      if (count === 500) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    console.log(`[Subscription] Generated ${quantity} keys for plan ${planId} in batch ${batchName}`);
    
    // Return raw keys *only once* in the generation response
    res.json({
      success: true,
      batchId: batchName,
      plan: planId,
      keys: rawKeys
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    res.status(500).json({ error: error.message || 'Failed to generate keys' });
  }
});

// 4. List Activation Keys (Admin Only)
subscriptionRouter.get('/list-keys', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    await verifyAdmin(userId);

    const db = getFirestore();
    let query: admin.firestore.Query = db.collection('activationKeys');

    // Optional Filters
    const plan = req.query.plan as string;
    const status = req.query.status as string;
    const batchId = req.query.batch as string;
    const search = req.query.search as string;

    if (plan) query = query.where('plan', '==', plan);
    if (status) query = query.where('status', '==', status);
    if (batchId) query = query.where('batchId', '==', batchId);

    // Only use orderBy when no inequality/equality filters are applied (avoids Firestore composite index requirement)
    const hasFilters = !!(plan || status || batchId);
    const finalQuery = hasFilters ? query.limit(2000) : query.orderBy('generatedDate', 'desc').limit(2000);

    const snap = await finalQuery.get();
    const keys: any[] = [];
    
    snap.forEach(doc => {
      const data = doc.data();
      // Client-side text search (on short KeyId, batch, or activatedByUsername)
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch = 
          (data.keyId && data.keyId.toLowerCase().includes(searchLower)) ||
          (data.batchId && data.batchId.toLowerCase().includes(searchLower)) ||
          (data.activatedByUsername && data.activatedByUsername.toLowerCase().includes(searchLower));
        
        if (!matchesSearch) return;
      }
      keys.push(data);
    });

    // Sort client-side by generatedDate descending when filters were applied
    if (hasFilters) {
      keys.sort((a, b) => (b.generatedDate || '').localeCompare(a.generatedDate || ''));
    }

    res.json({ success: true, keys });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list keys' });
  }
});

// 5. Revoke Activation Key (Admin Only)
subscriptionRouter.post('/revoke-key', async (req, res) => {
  try {
    const { keyHash, userId } = RevokeKeySchema.parse(req.body);
    await verifyAdmin(userId);

    const db = getFirestore();
    const keyRef = db.collection('activationKeys').doc(keyHash);
    const keyDoc = await keyRef.get();

    if (!keyDoc.exists) {
      return res.status(404).json({ error: 'Activation key not found' });
    }

    const keyData = keyDoc.data()!;
    if (keyData.status !== 'unused') {
      return res.status(400).json({ error: `Cannot revoke key. Current status: ${keyData.status}` });
    }

    await keyRef.update({
      status: 'revoked',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Subscription] Key ${keyData.keyId} revoked by admin ${userId}`);
    res.json({ success: true, message: 'Key successfully revoked' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    res.status(500).json({ error: error.message || 'Failed to revoke key' });
  }
});

// 6. Activate Subscription Key (User Endpoint)
subscriptionRouter.post('/activate-key', async (req, res) => {
  try {
    const { activationKey, userId, username } = ActivateKeySchema.parse(req.body);
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    
    const db = getFirestore();
    const hash = sha256(activationKey);
    const keyRef = db.collection('activationKeys').doc(hash);
    
    await db.runTransaction(async (transaction) => {
      const keyDoc = await transaction.get(keyRef);
      if (!keyDoc.exists) {
        throw new Error('Invalid activation key');
      }

      const keyData = keyDoc.data()!;
      if (keyData.status === 'revoked') {
        throw new Error('This activation key has been revoked');
      }
      if (keyData.status === 'expired') {
        throw new Error('This activation key has expired');
      }
      if (keyData.status === 'used') {
        throw new Error('This activation key has already been used');
      }

      // Fetch User record to compute expiry extensions
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('User record not found');
      }
      const userData = userDoc.data()!;

      let newExpiry = new Date();
      const planDuration = keyData.durationDays;
      const isLifetime = keyData.plan === 'lifetime';

      if (userData.subscriptionStatus === 'active' && userData.subscriptionExpiry) {
        // Extend from current active expiry date
        const currentExpiry = new Date(userData.subscriptionExpiry);
        if (currentExpiry > new Date()) {
          newExpiry = currentExpiry;
        }
      }

      if (!isLifetime) {
        newExpiry.setDate(newExpiry.getDate() + planDuration);
      }

      const expiryStr = isLifetime ? 'lifetime' : newExpiry.toISOString();
      const lastActivationDate = new Date().toISOString();

      // 1. Update User Subscription
      transaction.update(userRef, {
        subscriptionPlan: keyData.plan,
        subscriptionStatus: isLifetime ? 'lifetime' : 'active',
        subscriptionExpiry: isLifetime ? null : expiryStr,
        lastActivationDate,
        planType: keyData.plan === 'lifetime' ? 'manager' : keyData.plan, // map standard/manager
        maxSalesPersons: (keyData.plan === 'manager' || isLifetime) ? 3 : 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Update Activation Key
      transaction.update(keyRef, {
        status: 'used',
        activatedBy: userId,
        activatedByUsername: username,
        activatedDate: lastActivationDate,
        expiryDate: isLifetime ? 'lifetime' : expiryStr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Write Security Audit Log
      const logRef = db.collection('activationLogs').doc();
      transaction.set(logRef, {
        logId: logRef.id,
        keyId: keyData.keyId,
        userId,
        username,
        ip,
        timestamp: lastActivationDate,
        action: 'activate'
      });
    });

    console.log(`[Subscription] User ${userId} (${username}) successfully activated key ${activationKey.substring(0,7)}...`);
    res.json({ success: true, message: 'Subscription activated successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Activation Error:', error.message);
    res.status(400).json({ error: error.message || 'Failed to activate key' });
  }
});

// 7. Get Dashboard Statistics (Admin Only)
subscriptionRouter.get('/stats', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    await verifyAdmin(userId);

    const db = getFirestore();
    const keysSnap = await db.collection('activationKeys').get();
    
    let totalKeys = 0;
    let unusedKeys = 0;
    let usedKeys = 0;
    let expiredKeys = 0;
    let revokedKeys = 0;
    
    let revenuePotential = 0;
    let revenueActivated = 0;

    keysSnap.forEach(doc => {
      const data = doc.data();
      totalKeys++;
      const price = Number(data.price) || 0;

      if (data.status === 'unused') {
        unusedKeys++;
        revenuePotential += price;
      } else if (data.status === 'used') {
        usedKeys++;
        revenueActivated += price;
        revenuePotential += price;
      } else if (data.status === 'expired') {
        expiredKeys++;
      } else if (data.status === 'revoked') {
        revokedKeys++;
      }
    });

    res.json({
      success: true,
      stats: {
        totalKeys,
        unusedKeys,
        usedKeys,
        expiredKeys,
        revokedKeys,
        revenuePotential,
        revenueActivated
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch statistics' });
  }
});
