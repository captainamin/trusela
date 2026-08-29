import { Router } from 'express';
import { z } from 'zod';
import admin from 'firebase-admin';
import { getFirestore } from '../config/firebase.ts';

export const imeiRouter = Router();

const validateIMEI = (imei: string) => {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

const ImeiSchema = z.object({
  imei: z.string().length(15, "IMEI must be exactly 15 digits").regex(/^\d+$/, "IMEI must contain only digits")
});

const FlagImeiSchema = ImeiSchema.extend({
  reason: z.string().min(3, "Reason must be at least 3 characters")
});

imeiRouter.post('/verify-imei', async (req, res) => {
  try {
    const { imei } = ImeiSchema.parse(req.body);

    if (!validateIMEI(imei)) {
      return res.json({ 
        status: 'INVALID', 
        risk: 'HIGH', 
        message: 'Invalid IMEI format or checksum.' 
      });
    }

    const getImeiDoc = async (db: admin.firestore.Firestore) => {
      return await db.collection('imeis').doc(imei).get();
    };

    let imeiDoc;
    try {
      imeiDoc = await getImeiDoc(getFirestore());
    } catch (error: any) {
      if (error.code === 5 || (error.message && error.message.includes('NOT_FOUND'))) {
        console.warn('[Firebase] Named database not found in verify-imei, falling back to default.');
        imeiDoc = await getImeiDoc(admin.firestore());
      } else {
        throw error;
      }
    }

    if (!imeiDoc.exists) {
      return res.json({ 
        status: 'NEW', 
        risk: 'LOW', 
        message: 'This IMEI has not been recorded before. Appears safe.' 
      });
    }

    const data = imeiDoc.data();
    if (data?.flagged) {
      return res.json({ 
        status: 'FLAGGED', 
        risk: 'HIGH', 
        message: `DANGER: This IMEI is flagged as ${data.reason || 'suspicious'}.` 
      });
    }

    return res.json({ 
      status: 'FOUND', 
      risk: data?.count > 2 ? 'MEDIUM' : 'LOW', 
      message: `This IMEI has been seen ${data?.count} times before.` 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('IMEI Verify Error:', error.message);
    res.status(500).json({ error: 'Failed to verify IMEI' });
  }
});

imeiRouter.post('/save-imei', async (req, res) => {
  try {
    const { imei } = ImeiSchema.parse(req.body);
    
    const saveToDb = async (db: admin.firestore.Firestore) => {
      const imeiRef = db.collection('imeis').doc(imei);
      await db.runTransaction(async (t) => {
        const doc = await t.get(imeiRef);
        if (!doc.exists) {
          t.set(imeiRef, { count: 1, lastSeen: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          t.update(imeiRef, { 
            count: admin.firestore.FieldValue.increment(1), 
            lastSeen: admin.firestore.FieldValue.serverTimestamp() 
          });
        }
      });
    };

    try {
      await saveToDb(getFirestore());
    } catch (error: any) {
      if (error.code === 5 || (error.message && error.message.includes('NOT_FOUND'))) {
        console.warn('[Firebase] Named database not found in save-imei, falling back to default.');
        await saveToDb(admin.firestore());
      } else {
        throw error;
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('IMEI Save Error:', error.message);
    res.status(500).json({ error: 'Failed to save IMEI' });
  }
});

imeiRouter.post('/flag-imei', async (req, res) => {
  try {
    const { imei, reason } = FlagImeiSchema.parse(req.body);
    
    const flagInDb = async (db: admin.firestore.Firestore) => {
      await db.collection('imeis').doc(imei).set({ 
        flagged: true, 
        reason, 
        flaggedAt: admin.firestore.FieldValue.serverTimestamp() 
      }, { merge: true });
    };

    try {
      await flagInDb(getFirestore());
    } catch (error: any) {
      if (error.code === 5 || (error.message && error.message.includes('NOT_FOUND'))) {
        console.warn('[Firebase] Named database not found in flag-imei, falling back to default.');
        await flagInDb(admin.firestore());
      } else {
        throw error;
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('IMEI Flag Error:', error.message);
    res.status(500).json({ error: 'Failed to flag IMEI' });
  }
});
