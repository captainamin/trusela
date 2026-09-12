import { Router } from 'express';
import axios from 'axios';
import admin from 'firebase-admin';
import { z } from 'zod';
import { getFirestore } from '../config/firebase.ts';
import { requireAuth, authenticatedUid, AuthenticatedRequest } from '../middleware/auth.ts';

export const paystackRouter = Router();
paystackRouter.use(requireAuth);

const InitializeSchema = z.object({
  email: z.string().email("Invalid email address"),
  amount: z.number().positive("Amount must be positive"),
  metadata: z.record(z.string(), z.any()).optional()
});

const VerifyActivateSchema = z.object({
  reference: z.string().min(1, "Reference is required"),
  userId: z.string().min(1, "User ID is required")
});

paystackRouter.post('/initialize', async (req: AuthenticatedRequest, res) => {
  try {
    const { email, amount, metadata } = InitializeSchema.parse(req.body);
    const userId = authenticatedUid(req);
    if (req.auth?.email && email.toLowerCase() !== req.auth.email.toLowerCase()) {
      return res.status(403).json({ error: 'Payment email must match the authenticated account' });
    }
    
    if (!process.env.PAYSTACK_SECRET_KEY) {
      throw new Error('PAYSTACK_SECRET_KEY is missing in Secrets.');
    }
    if (!process.env.APP_URL) {
      throw new Error('APP_URL is missing in Secrets. This is required for the payment callback.');
    }

    const baseUrl = process.env.APP_URL.endsWith('/') 
      ? process.env.APP_URL.slice(0, -1) 
      : process.env.APP_URL;

    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount: Math.round(Number(amount) * 100), // Ensure integer kobo
      callback_url: `${baseUrl}/subscription/callback`,
      metadata: { ...metadata, userId }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
    });
    res.json(response.data);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Paystack Initialize Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to initialize Paystack payment', 
      details: error.response?.data?.message || 'Internal error' 
    });
  }
});

paystackRouter.post('/verify-and-activate', async (req: AuthenticatedRequest, res) => {
  try {
    const { reference } = VerifyActivateSchema.parse(req.body);
    const userId = authenticatedUid(req);
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const txData = response.data.data;
    if (txData.status === 'success') {
      const userDoc = await getFirestore().collection('users').doc(userId).get();
      const accountEmail = userDoc.data()?.email || req.auth?.email;
      const paidEmail = txData.customer?.email;
      if (accountEmail && paidEmail && accountEmail.toLowerCase() !== paidEmail.toLowerCase()) {
        return res.status(403).json({ error: 'Payment does not belong to the authenticated account' });
      }
      if (txData.metadata?.userId && txData.metadata.userId !== userId) {
        return res.status(403).json({ error: 'Payment account mismatch' });
      }
      const plan = txData.metadata?.plan || txData.metadata?.planType || 'basic';
      if (!['basic', 'manager'].includes(plan)) {
        return res.status(400).json({ error: 'Unsupported subscription plan' });
      }
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const updateSubscription = async (db: admin.firestore.Firestore) => {
        await db.runTransaction(async (transaction) => {
          const paymentRef = db.collection('processedPayments').doc(reference);
          const paymentDoc = await transaction.get(paymentRef);
          if (paymentDoc.exists) return;
          transaction.update(db.collection('users').doc(userId), {
          subscriptionStatus: 'active',
          planType: plan,
          maxSalesPersons: plan === 'manager' ? 3 : 0,
          lastPaymentAt: now.toISOString(),
          subscriptionEndsAt: thirtyDaysLater.toISOString(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          transaction.set(paymentRef, {
            userId,
            reference,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
      };

      try {
        await updateSubscription(getFirestore());
      } catch (error: any) {
        if (error.code === 5 || (error.message && error.message.includes('NOT_FOUND'))) {
          console.warn('[Firebase] Named database not found in Paystack verify, falling back to default.');
          await updateSubscription(admin.firestore());
        } else {
          throw error;
        }
      }
      
      res.json({ success: true, plan });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Paystack Verify/Activate Error:', error.message);
    res.status(500).json({ error: 'Failed to verify and activate subscription' });
  }
});

paystackRouter.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Paystack Verify Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to verify Paystack payment', 
      details: error.response?.data?.message || 'Internal error' 
    });
  }
});
