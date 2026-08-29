import { Router } from 'express';
import { z } from 'zod';
import admin from 'firebase-admin';
import { getDrive, getSheets, getServiceAccountEmail, getOAuth2Client } from '../config/google.ts';
import { getFirestore, getStorageBucketName } from '../config/firebase.ts';

export const googleRouter = Router();

const getOAuthClientForUser = async (userId: string) => {
  const userDoc = await getFirestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData || !userData.googleRefreshToken) {
    console.warn(`User ${userId} does not have a googleRefreshToken. Falling back to Service Account.`);
    return undefined;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: userData.googleRefreshToken
  });
  return oauth2Client;
};

const SetupUserSchema = z.object({
  userId: z.string().min(1, "User ID is required")
});

const UploadImageSchema = z.object({
  base64: z.string().min(1, "Base64 data is required"),
  name: z.string().optional(),
  folderId: z.string().optional()
});

const SaveRecordSchema = z.object({
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  folderId: z.string().optional(),
  record: z.object({
    id: z.string().optional(),
    sellerName: z.string(),
    phoneNumber: z.string(),
    address: z.string(),
    sellerPhoto: z.string().optional(),
    idCardPhoto: z.string().optional(),
    brand: z.string(),
    model: z.string(),
    imei1: z.string(),
    imei2: z.string().optional(),
    deviceImg1: z.string().optional(),
    deviceImg2: z.string().optional(),
    signature: z.string().optional(),
    receiptImage: z.string().optional(),
    imeiStatus: z.string().optional(),
    riskLevel: z.string().optional(),
    deviceStatus: z.string().optional()
  })
});

googleRouter.get('/debug-auth', (req, res) => {
  console.log('[DEBUG] Hit /api/google/debug-auth');
  const oauth2Client = getOAuth2Client();
  const redirectUri = (oauth2Client as any)._redirectUri || (oauth2Client as any).redirectUri;
  res.json({
    env_APP_URL: process.env.APP_URL,
    generated_redirectUri: redirectUri,
    clientId: process.env.GOOGLE_CLIENT_ID ? 'Loaded' : 'Missing',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Loaded' : 'Missing'
  });
});

googleRouter.get('/auth-url', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      state: userId as string
    });
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

googleRouter.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).json({ error: 'Code and State are required' });

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens.refresh_token) {
      console.warn('No refresh token returned. User might have already consented.');
    }

    // Save tokens to Firestore
    const updateData: any = {
      isGoogleConnected: true,
      googleAccessToken: tokens.access_token,
      lastAuthUpdate: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (tokens.refresh_token) {
      updateData.googleRefreshToken = tokens.refresh_token;
    }

    // Get user info to save email
    try {
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials(tokens);
      const oauth2 = admin.auth(); // We'll just use the userId to get email from Firebase Auth
      const userRecord = await oauth2.getUser(userId as string);
      updateData.email = userRecord.email;
    } catch (authErr) {
      console.warn('[OAuth Callback] Could not fetch user email:', authErr);
    }

    const db = getFirestore();
    if (!userId || userId === 'undefined') {
      throw new Error('Invalid User ID received in OAuth state.');
    }

    try {
      await db.collection('users').doc(userId as string).set(updateData, { merge: true });
      console.log(`[OAuth Callback] Successfully saved tokens for ${userId}`);
    } catch (dbErr: any) {
      console.error('[OAuth Callback] Firestore Error:', dbErr.message);
      throw new Error(`Firestore Error: ${dbErr.message}`);
    }

    // Redirect back to frontend
    const frontendUrl = (process.env.APP_URL || 'http://localhost:3005').replace(/\/api.*$/, '');
    res.redirect(`${frontendUrl}/setup?connected=true`);
  } catch (error: any) {
    console.error('OAuth Callback Error:', error);
    const frontendUrl = (process.env.APP_URL || 'http://localhost:3005').replace(/\/api.*$/, '');
    res.redirect(`${frontendUrl}/setup?error=${encodeURIComponent(error.message)}`);
  }
});

googleRouter.get('/diagnostics', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    let bucketExists = false;
    let bucketName = getStorageBucketName();
    let bucketError = null;
    let canMakePublic = null;
    
    try {
      if (bucketName) {
        const bucket = admin.storage().bucket(bucketName);
        const [exists] = await bucket.exists();
        bucketExists = exists;
        
        if (exists) {
          try {
            const testFile = bucket.file('diagnostics_test.txt');
            await testFile.save('test', { metadata: { contentType: 'text/plain' } });
            try {
              await testFile.makePublic();
              canMakePublic = true;
            } catch (pErr: any) {
              console.warn('[Diagnostics] Could not make test file public:', pErr.message);
              canMakePublic = false;
            }
            await testFile.delete().catch(() => {});
          } catch (sErr: any) {
            bucketError = `Permission Denied: ${sErr.message}`;
          }
        }
      }
      let firestoreDb = getFirestore();
      console.log(`[Firebase] Using configured Firestore database.`);
      
      // Test the connection
      try {
        await firestoreDb.collection('_health').doc('check').set({ lastInit: new Date() }, { merge: true });
        console.log('[Firebase] Connection Test Success.');
      } catch (hErr: any) {
        console.error('[Firebase] Connection Test Failed:', hErr.message);
      }
    } catch (e: any) {
      bucketError = e.message;
    }

    res.json({
      email: creds.client_email || 'Not configured',
      projectId: creds.project_id || 'Not configured',
      storageBucket: bucketName || 'Not configured',
      bucketExists,
      bucketError,
      canMakePublic,
      isServiceAccountConfigured: !!creds.client_email,
      troubleshooting: {
        important: "These diagnostics are for the BACKGROUND SERVICE ACCOUNT, not your personal OAuth connection.",
        storageRole: "Ensure Service Account has 'Storage Object Admin' role.",
        publicAccess: canMakePublic === false ? "Uniform Bucket-Level Access might be enabled." : "Should be working."
      }
    });
  } catch (e) {
    res.json({ email: 'Invalid JSON', projectId: 'Invalid JSON' });
  }
});

googleRouter.post('/setup-user', async (req, res) => {
  try {
    const { userId } = SetupUserSchema.parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    if (!auth) {
      throw new Error('Google Drive not connected. Please connect your account first to use Automatic Setup.');
    }
    const drive = getDrive(auth);
    const sheets = getSheets(auth);
    
    console.log(`[Setup] Starting OAuth setup for user: ${userId}`);
    
    // 1. Create Folder in User's Drive
    console.log('[Setup] Step 1: Creating Drive folder...');
    let folderId;
    try {
      const folderResponse = await drive.files.create({
        requestBody: {
          name: `Trusela_Records`,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folderResponse.data.id;
      console.log(`[Setup] Step 1 Success: Folder ID ${folderId}`);
    } catch (driveErr: any) {
       throw new Error(`Folder creation failed: ${driveErr.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Create Sheet in User's Drive
    console.log('[Setup] Step 2: Creating Spreadsheet...');
    let spreadsheetId;
    try {
      const sheetResponse = await drive.files.create({
        requestBody: {
          name: `Trusela_Database`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [folderId!],
        },
        fields: 'id',
      });
      spreadsheetId = sheetResponse.data.id;
      console.log(`[Setup] Step 2 Success: Spreadsheet ID ${spreadsheetId}`);
    } catch (sheetErr: any) {
      console.error('[Setup] Step 2 Failed:', sheetErr.response?.data?.error || sheetErr.message);
      throw new Error(`Spreadsheet creation failed: ${sheetErr.response?.data?.error?.message || sheetErr.message}`);
    }

    // 3. Add Headers to Sheet
    console.log('[Setup] Step 3: Adding headers to sheet...');
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId!,
        range: 'Sheet1!A1:U1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'ID', 'Seller Name', 'Phone Number', 'Address', 'Seller Photo URL', 'ID Card Photo URL',
            'Device Brand', 'Device Model', 'IMEI 1', 'IMEI 2',
            'Device Image 1 URL', 'Device Image 2 URL', 'Date', 'Timestamp',
            'IMEI Status', 'Risk Level', 'Device Status',
            'Buyer Name', 'Buyer Phone', 'Buyer Address', 'Signature URL'
          ]],
        },
      });
      console.log('[Setup] Step 3 Success: Headers added.');
    } catch (headerErr: any) {
      throw new Error(`Failed to add headers.`);
    }

    res.json({ spreadsheetId, folderId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Setup Error Final:', error.message);
    res.status(500).json({ 
      error: 'Google API Setup Failed', 
      details: error.message 
    });
  }
});

// Save the completed setup to Firestore using Admin SDK (bypasses security rules)
googleRouter.post('/save-setup', async (req, res) => {
  try {
    const { userId, spreadsheetId, folderId, dealerInfo } = req.body;
    if (!userId || !spreadsheetId || !folderId) {
      return res.status(400).json({ error: 'Missing required fields: userId, spreadsheetId, folderId' });
    }

    console.log(`[Save Setup] Debug - userId: ${userId}, spreadsheetId: ${spreadsheetId}`);
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    console.log(`[Save Setup] Debug - userDoc fetched. Is snapshot? ${!!userDoc.id}. Exists? ${userDoc.exists}`);
    
    if (typeof (userDoc as any).exists === 'function') {
      console.warn('[Save Setup] CRITICAL: userDoc.exists IS A FUNCTION. This is unexpected for Admin SDK.');
    }

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const payload: any = {
      spreadsheetId,
      folderId,
      ...(dealerInfo || {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Ensure email is saved if possible
    try {
      const userRecord = await admin.auth().getUser(userId);
      payload.email = userRecord.email;
    } catch (e) {}

    if (!userDoc.exists) {
      console.log(`[Save Setup] Creating NEW user document for: ${userId}`);
      // New user — set all fields
      await userRef.set({
        ...payload,
        subscriptionStatus: 'trial',
        trialEndsAt,
        recordCount: 0,
        createdAt: new Date().toISOString(),
      });
    } else {
      console.log(`[Save Setup] Updating EXISTING user document for: ${userId}`);
      // Existing user — merge/update. Ensure recordCount is initialized if missing.
      const existingData = userDoc.data();
      if (existingData && existingData.recordCount === undefined) {
        payload.recordCount = 0;
      }
      await userRef.set(payload, { merge: true });
    }

    console.log(`[Save Setup] Successfully saved setup for user: ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Save Setup] Error:', error.message);
    res.status(500).json({ error: 'Failed to save setup', details: error.message });
  }
});

googleRouter.post('/update-profile', async (req, res) => {
  try {
    const { userId, ...profileData } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const db = getFirestore();
    await db.collection('users').doc(userId).set({
      ...profileData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[Update Profile] Successfully updated profile for user: ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Update Profile] Error:', error.message);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

googleRouter.post('/upload-image', async (req, res) => {
  try {
    const { base64, name, userId } = z.intersection(UploadImageSchema, z.object({ userId: z.string() })).parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    const drive = getDrive(auth);

    const mimeType = base64.split(';')[0].split(':')[1] || 'image/jpeg';
    const buffer = Buffer.from(base64.split(',')[1], 'base64');
    
    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileName = `uploads/${Date.now()}_${name || 'image.jpg'}`;

    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink, thumbnailLink',
    });

    const fileId = file.data.id;
    if (fileId) {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    }

    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    res.json({ url: directUrl });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Upload Image Error:', error);
    res.status(500).json({ 
      error: 'Failed to upload image to Google Drive',
      details: error.message
    });
  }
});

googleRouter.post('/save-record', async (req, res) => {
  try {
    const { spreadsheetId, folderId, record, userId } = z.intersection(SaveRecordSchema, z.object({ userId: z.string().min(1) })).parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    const drive = getDrive(auth);

    const uploadImage = async (base64: string, name: string) => {
      if (!base64 || !base64.includes('base64,')) return '';
      try {
        const mimeType = base64.split(';')[0].split(':')[1] || 'image/jpeg';
        const buffer = Buffer.from(base64.split(',')[1], 'base64');
        const { Readable } = await import('stream');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const file = await drive.files.create({
          requestBody: { name: `rec_${Date.now()}_${name}`, parents: [folderId].filter(Boolean) as string[] },
          media: { mimeType, body: stream },
          fields: 'id, webViewLink, webContentLink, thumbnailLink',
        });

        if (file.data.id) {
          await drive.permissions.create({
            fileId: file.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
          });
        }
        return `https://drive.google.com/uc?export=view&id=${file.data.id}`;
      } catch (uploadErr: any) {
        throw new Error(`Failed to upload ${name}: ${uploadErr.message}`);
      }
    };

    // Detect Sheet Name
    let sheetName = 'Sheet1';
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';
    } catch (e: any) {
      console.warn('[Sheets] Sheet detection failed, defaulting to Sheet1:', e.message);
    }
    
    // Idempotency Check
    const uniqueRecordId = record.id || Date.now().toString();
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
      });
      const existingIds = existing.data.values || [];
      if (existingIds.some(row => row[0] === uniqueRecordId)) {
        return res.json({ success: true, message: 'Already synced' });
      }
    } catch (e: any) {}
    
    let sellerPhotoUrl = '';
    let idCardPhotoUrl = '';
    let deviceImg1Url = '';
    let deviceImg2Url = '';
    let signatureUrl = '';
    let receiptUrl = '';

    const uploadPromises = [];
    if (record.sellerPhoto) uploadPromises.push(uploadImage(record.sellerPhoto, 'seller.jpg').then(url => sellerPhotoUrl = url));
    if (record.idCardPhoto) uploadPromises.push(uploadImage(record.idCardPhoto, 'idcard.jpg').then(url => idCardPhotoUrl = url));
    if (record.deviceImg1) uploadPromises.push(uploadImage(record.deviceImg1, 'device1.jpg').then(url => deviceImg1Url = url));
    if (record.deviceImg2) uploadPromises.push(uploadImage(record.deviceImg2, 'device2.jpg').then(url => deviceImg2Url = url));
    if (record.signature) uploadPromises.push(uploadImage(record.signature, 'signature.png').then(url => signatureUrl = url));
    if (record.receiptImage) uploadPromises.push(uploadImage(record.receiptImage, 'receipt.png').then(url => receiptUrl = url));

    await Promise.all(uploadPromises);

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          uniqueRecordId, 
          record.sellerName || '', 
          record.phoneNumber || '', 
          record.address || '', 
          sellerPhotoUrl, 
          idCardPhotoUrl,
          record.brand || '', 
          record.model || '', 
          record.imei1 || '', 
          record.imei2 || '',
          deviceImg1Url, 
          deviceImg2Url, 
          dateStr, 
          timeStr,
          record.imeiStatus || 'NEW', 
          record.riskLevel || 'LOW', 
          record.deviceStatus || 'IN_STOCK',
          '', // Buyer Name
          '', // Buyer Phone
          '', // Buyer Address
          signatureUrl
        ]],
      },
    });

    // Increment record count in Firestore (Backend/Admin SDK)
    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);
    
    // Use Transaction or Set with Merge to ensure recordCount exists and is a number
    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const currentCount = doc.exists ? (Number(doc.data()?.recordCount) || 0) : 0;
        t.set(userRef, { 
          recordCount: currentCount + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    } catch (dbErr: any) {
      console.error('[Firestore] Increment failed:', dbErr.message);
    }

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Save Record Error:', error.message);
    res.status(500).json({ error: 'Failed to save record', details: error.message });
  }
});

googleRouter.get('/records', async (req, res) => {
  try {
    const { spreadsheetId, userId } = req.query;
    if (!spreadsheetId || typeof spreadsheetId !== 'string') return res.status(400).json({ error: 'Missing spreadsheetId' });
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'Missing userId' });

    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);

    // Detect Sheet Name
    let sheetName = 'Sheet1';
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';
    } catch (e) {}

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A2:U`,
    });
    const rows = response.data.values || [];
    const records = rows.map(row => {
      const isNewFormat = ['LOW', 'MEDIUM', 'HIGH'].includes(row[15]?.toUpperCase() || '');
      return {
        id: row[0],
        sellerName: row[1],
        phoneNumber: row[2],
        address: row[3],
        sellerPhotoUrl: row[4],
        idCardPhotoUrl: isNewFormat ? (row[5] || '') : '',
        brand: isNewFormat ? (row[6] || '') : (row[5] || ''),
        model: isNewFormat ? (row[7] || '') : (row[6] || ''),
        imei1: isNewFormat ? (row[8] || '') : (row[7] || ''),
        imei2: isNewFormat ? (row[9] || '') : (row[8] || ''),
        deviceImg1Url: isNewFormat ? (row[10] || '') : (row[9] || ''),
        deviceImg2Url: isNewFormat ? (row[11] || '') : (row[10] || ''),
        date: isNewFormat ? (row[12] || '') : (row[11] || ''),
        timestamp: isNewFormat ? (row[13] || '') : (row[12] || ''),
        imeiStatus: (isNewFormat ? row[14] : row[13]) || 'NEW',
        riskLevel: (isNewFormat ? row[15] : row[14]) || 'LOW',
        deviceStatus: (isNewFormat ? row[16] : row[15]) || 'IN_STOCK',
        buyerName: (isNewFormat ? row[17] : row[16]) || '',
        buyerPhone: (isNewFormat ? row[18] : row[17]) || '',
        buyerAddress: (isNewFormat ? row[19] : row[18]) || '',
        signatureUrl: isNewFormat ? (row[20] || '') : (row[19] || ''),
      };
    });
    res.json(records);
  } catch (error: any) {
    console.error('Fetch Records Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

const UpdateStatusSchema = z.object({
  spreadsheetId: z.string(),
  recordId: z.union([z.string(), z.number()]),
  status: z.string(),
  buyerDetails: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional()
  }).optional()
});

googleRouter.post('/update-record-status', async (req, res) => {
  try {
    const { spreadsheetId, recordId, status, buyerDetails, userId } = z.intersection(UpdateStatusSchema, z.object({ userId: z.string() })).parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);

    // Detect Sheet Name
    let sheetName = 'Sheet1';
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';
    } catch (e: any) {
      console.warn('[Sheets] Sheet detection failed, defaulting to Sheet1:', e.message);
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:T`,
    });
    const rows = response.data.values || [];
    const recordRow = rows.find(row => row[0] === recordId.toString());

    if (!recordRow) return res.status(404).json({ error: 'Record not found' });

    const rowIndex = rows.indexOf(recordRow);
    const rowNum = rowIndex + 1;
    const isNewFormat = ['LOW', 'MEDIUM', 'HIGH'].includes(recordRow[15]?.toUpperCase() || '');
    const startCol = isNewFormat ? 'Q' : 'P';
    const endCol = isNewFormat ? 'T' : 'S';

    const values = [status];
    if (status === 'SOLD' && buyerDetails) {
      values.push(buyerDetails.name || '', buyerDetails.phone || '', buyerDetails.address || '');
    } else if (status === 'IN_STOCK') {
      values.push('', '', '');
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${startCol}${rowNum}:${endCol}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update Status Error:', error.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

googleRouter.post('/recalculate-count', async (req, res) => {
  try {
    const { userId, spreadsheetId } = req.body;
    if (!userId || !spreadsheetId) return res.status(400).json({ error: 'Missing userId or spreadsheetId' });

    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);

    // Detect Sheet Name
    let sheetName = 'Sheet1';
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      sheetName = spreadsheet.data.sheets?.[0]?.properties?.title || 'Sheet1';
    } catch (e) {}

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A2:A`,
    });
    const rows = response.data.values || [];
    const count = rows.length;

    const db = getFirestore();
    await db.collection('users').doc(userId).set({
      recordCount: count,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ success: true, count });
  } catch (error: any) {
    console.error('Recalculate Count Error:', error.message);
    res.status(500).json({ error: 'Failed to recalculate count', details: error.message });
  }
});

// Routes below are moved to server.ts or handled elsewhere

