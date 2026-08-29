import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

import { initFirebase, getFirestore } from './server/config/firebase.ts';
import { getDrive, getOAuth2Client } from './server/config/google.ts';
import admin from 'firebase-admin';

// Import Routes
import { googleRouter } from './server/routes/google.ts';
import { paystackRouter } from './server/routes/paystack.ts';
import { imeiRouter } from './server/routes/imei.ts';
import { subscriptionRouter } from './server/routes/subscription.ts';
import { marketRouter } from './server/routes/market.ts';

console.log('>>> SERVER RELOADED AT:', new Date().toISOString());
console.log('[DEBUG] Server Start - APP_URL:', process.env.APP_URL);




async function startServer() {
  await initFirebase();

  const app = express();
  const PORT = process.env.PORT || 3005;

  app.use(express.json({ limit: '50mb' }));

  // Mount modular routes
  app.use('/api/google', googleRouter);
  app.use('/api/paystack', paystackRouter);
  app.use('/api/subscription', subscriptionRouter);
  app.use('/api/market', marketRouter);
  app.use('/api', imeiRouter);

  app.get('/api/ping', (req, res) => res.send('pong'));
  app.get('/api/test-proxy', (req, res) => {
    console.log('[DEBUG] Test proxy hit');
    res.send('API Proxy is alive');
  });

  // Global request logging for debugging
  app.use((req, res, next) => {
    if (req.url.includes('drive-image') || req.url.startsWith('/api')) {
      console.log(`[DEBUG-GLOBAL] ${req.method} ${req.url}`);
    }
    next();
  });

  // Catch any URL that looks like a drive image proxy
  app.get(/.*drive-image.*/, async (req, res) => {
    try {
      const url = req.url;
      const fileId = req.params[0] || req.url.split('/').pop()?.split('?')[0];
      const userId = req.query.userId;
      
      console.log(`[Proxy-Wildcard] Match! URL: ${url}, fileId: ${fileId}, userId: ${userId}`);

      if (!userId || typeof userId !== 'string') {
        console.error('[Proxy-Direct] No userId');
        return res.status(400).send('User ID is required');
      }

      const db = getFirestore();
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData?.googleRefreshToken) {
         console.error(`[Proxy-Direct] No refresh token for user ${userId}`);
         return res.status(401).send('Google Drive not connected');
      }

      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: userData.googleRefreshToken });
      
      const drive = getDrive(oauth2Client);
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      const contentType = response.headers['content-type'] || 'image/jpeg';
      console.log(`[Proxy-Direct] Serving ${fileId} as ${contentType}`);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      response.data.on('error', (err) => {
        console.error('[Proxy-Direct] Stream Error:', err);
        if (!res.headersSent) res.status(500).send('Streaming error');
      }).pipe(res);

    } catch (error: any) {
      console.error('[Proxy-Direct] Global Error:', error.message);
      // gRPC error codes (e.g. 14 = UNAVAILABLE) are NOT valid HTTP status codes.
      // Map known gRPC codes to HTTP equivalents, otherwise default to 500.
      const grpcToHttp: Record<number, number> = {
        1: 499,  // CANCELLED
        2: 500,  // UNKNOWN
        3: 400,  // INVALID_ARGUMENT
        4: 504,  // DEADLINE_EXCEEDED
        5: 404,  // NOT_FOUND
        6: 409,  // ALREADY_EXISTS
        7: 403,  // PERMISSION_DENIED
        8: 429,  // RESOURCE_EXHAUSTED
        9: 400,  // FAILED_PRECONDITION
        10: 409, // ABORTED
        11: 400, // OUT_OF_RANGE
        12: 501, // UNIMPLEMENTED
        13: 500, // INTERNAL
        14: 503, // UNAVAILABLE
        15: 500, // DATA_LOSS
        16: 401, // UNAUTHENTICATED
      };
      const httpStatus = (typeof error.code === 'number' && grpcToHttp[error.code])
        ? grpcToHttp[error.code]
        : (typeof error.code === 'number' && error.code >= 100 && error.code < 600 ? error.code : 500);
      if (!res.headersSent) res.status(httpStatus).send(error.message);
    }

  });

  app.get('/api/config-check', async (req, res) => {
    let hasValidGoogle = false;
    try {
      hasValidGoogle = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {}

    let userRecordCount = null;
    let userIdFound = false;
    const userId = req.query.userId as string;

    if (userId) {
      try {
        const db = getFirestore();
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          userRecordCount = userDoc.data()?.recordCount;
          userIdFound = true;
        }
      } catch (e) {
        console.error('Config-check Firestore error:', e.message);
      }
    }

    const config = {
      hasGoogleCreds: hasValidGoogle,
      hasPaystackKey: !!process.env.PAYSTACK_SECRET_KEY,
      hasAppUrl: !!process.env.APP_URL,
      serverVersion: 'v3-debug-count',
      debug: {
        userId,
        userIdFound,
        userRecordCount
      }
    };
    res.json(config);
  });

  // Moved to top for priority
  // Remote the redundant direct route from the old position

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Guard: skip Vite for API routes so Express handles them
    app.use((req, res, next) => {
      if (req.url.startsWith('/api')) {
        return next();
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
}

startServer().catch(console.error);
