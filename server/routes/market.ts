import { Router } from 'express';
import { z } from 'zod';
import admin from 'firebase-admin';
import { getDrive, getSheets, getOAuth2Client } from '../config/google.ts';
import { getFirestore } from '../config/firebase.ts';
import { Readable } from 'stream';
import { requireAuth, createMediaSignature } from '../middleware/auth.ts';

export const marketRouter = Router();
marketRouter.use(requireAuth);

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

const SetupMarketSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  marketName: z.string().min(1, "Market name is required")
});

marketRouter.post('/setup-market', async (req, res) => {
  try {
    const { userId, marketName } = SetupMarketSchema.parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    if (!auth) {
      throw new Error('Google Drive not connected. Please connect your account first to use Automatic Setup.');
    }
    const drive = getDrive(auth);
    const sheets = getSheets(auth);
    
    console.log(`[Market Setup] Starting OAuth setup for market admin: ${userId}`);
    
    // 1. Create Market Root Folder in User's Drive
    console.log('[Market Setup] Step 1: Creating Drive folder...');
    let folderId;
    try {
      const folderResponse = await drive.files.create({
        requestBody: {
          name: `Trusela_Market_${marketName.replace(/\s+/g, '_')}`,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folderResponse.data.id;
      console.log(`[Market Setup] Step 1 Success: Folder ID ${folderId}`);
    } catch (driveErr: any) {
       throw new Error(`Folder creation failed: ${driveErr.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Create Sheet in User's Drive
    console.log('[Market Setup] Step 2: Creating Spreadsheet...');
    let spreadsheetId;
    try {
      const sheetResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `${marketName} Database`,
          },
          sheets: [
            { properties: { title: 'Members' } },
            { properties: { title: 'Officials' } },
            { properties: { title: 'RevenueTypes' } },
            { properties: { title: 'RevenueCollections' } },
            { properties: { title: 'Tasks' } },
            { properties: { title: 'Reports' } },
            { properties: { title: 'AuditLogs' } }
          ]
        },
        fields: 'spreadsheetId',
      });
      spreadsheetId = sheetResponse.data.spreadsheetId;
      console.log(`[Market Setup] Step 2 Success: Spreadsheet ID ${spreadsheetId}`);
      
      // Move spreadsheet to the new folder
      await drive.files.update({
        fileId: spreadsheetId!,
        addParents: folderId!,
        removeParents: 'root',
        fields: 'id, parents'
      });
      
    } catch (sheetErr: any) {
      console.error('[Market Setup] Step 2 Failed:', sheetErr.message);
      throw new Error(`Spreadsheet creation failed: ${sheetErr.message}`);
    }

    // 3. Add Headers to Sheets
    console.log('[Market Setup] Step 3: Adding headers to sheets...');
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId!,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            {
              range: 'Members!A1:N1',
              values: [['Member ID', 'Full Name', 'Phone Number', 'Business Name', 'Business Type', 'Shop Number', 'Address', 'Photo URL', 'QR Code', 'Registration Date', 'Status', 'Created By', 'Assigned Revenue Types', 'Is Principal Owner']]
            },
            {
              range: 'Officials!A1:H1',
              values: [['Official ID', 'Full Name', 'Rank', 'Department', 'Official Number', 'Photo URL', 'Status', 'Official Type']]
            },
            {
              range: 'RevenueTypes!A1:G1',
              values: [['Revenue Type ID', 'Name', 'Amount', 'Frequency', 'Description', 'Status', 'Receipt Prefix']]
            },
            {
              range: 'RevenueCollections!A1:J1',
              values: [['Receipt Number', 'Member ID', 'Official ID', 'Revenue Type', 'Amount', 'Date', 'Time', 'GPS', 'Photo URL', 'Signature URL']]
            },
            {
              range: 'Tasks!A1:J1',
              values: [['Task ID', 'Title', 'Description', 'Priority', 'Assigned Official', 'Due Date', 'Status', 'Created Date', 'Completed Date', 'Category']]
            },
            {
              range: 'AuditLogs!A1:H1',
              values: [['Log ID', 'User ID', 'Role', 'Time', 'Action', 'Market ID', 'IP', 'Changes']]
            }
          ]
        }
      });
      console.log('[Market Setup] Step 3 Success: Headers added.');
    } catch (headerErr: any) {
      console.error('[Market Setup] Step 3 Failed:', headerErr.message);
      throw new Error(`Failed to add headers.`);
    }

    // Save market metadata to user document
    await getFirestore().collection('users').doc(userId).set({
      marketSpreadsheetId: spreadsheetId,
      marketFolderId: folderId
    }, { merge: true });

    res.json({ spreadsheetId, folderId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Market Setup Error Final:', error.message);
    res.status(500).json({ 
      error: 'Google API Setup Failed', 
      details: 'Request could not be completed'
    });
  }
});

marketRouter.get('/members/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    
    // We need the spreadsheetId from the user's document
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Members!A2:N',
    });

    const rows = response.data.values || [];
    const members = rows.map((row: any) => ({
      id: row[0] || '',
      fullName: row[1] || '',
      phone: row[2] || '',
      businessName: row[3] || '',
      businessType: row[4] || '',
      shopNumber: row[5] || '',
      address: row[6] || '',
      photoUrl: row[7] || '',
      qrCode: row[8] || '',
      registrationDate: row[9] || '',
      status: row[10] || '',
      createdBy: row[11] || '',
      assignedRevenueTypes: row[12] || '',
      isPrincipalOwner: row[13] ? row[13] === 'true' : true,
    }));

    res.json(members);
  } catch (error: any) {
    console.error('Fetch Members Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

const AddMemberSchema = z.object({
  userId: z.string().min(1),
  memberId: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  businessName: z.string().min(1),
  businessType: z.string().min(1),
  shopNumber: z.string().min(1),
  address: z.string().optional(),
  photoDataUrl: z.string()
    .max(12_000_000, "Photo is too large")
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/, "Only JPEG, PNG, and WebP images are supported"),
  qrCode: z.string().min(1),
  status: z.string().min(1),
  assignedRevenueTypes: z.string().optional(),
  isPrincipalOwner: z.boolean().optional()
});

marketRouter.post('/members', async (req, res) => {
  try {
    const data = AddMemberSchema.parse(req.body);
    const auth = await getOAuthClientForUser(data.userId);
    const sheets = getSheets(auth);
    const drive = getDrive(auth);
    
    const userDoc = await getFirestore().collection('users').doc(data.userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    const folderId = userDoc.data()?.marketFolderId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const membersResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Members!A2:N' });
    const rows = membersResponse.data.values || [];
    if (data.isPrincipalOwner && data.shopNumber) {
      const existingPrincipal = rows.find((r: any) => r[5] === data.shopNumber && (!r[13] || r[13] === 'true'));
      if (existingPrincipal) {
        return res.status(400).json({ error: `Shop ${data.shopNumber} already has a Principal Owner.` });
      }
    }

    // Process Base64 Image
    const base64Data = data.photoDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    if (imageBuffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'Photo is too large' });
    }
    
    const stream = new Readable();
    stream.push(imageBuffer);
    stream.push(null);

    // Upload to Google Drive
    const fileMetadata: any = {
      name: `${data.memberId}.jpg`,
    };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const driveRes = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'image/jpeg',
        body: stream
      },
      fields: 'id, webViewLink, webContentLink'
    });

    // Make the file publicly accessible so it can be viewed on ID Cards / Dashboards
    if (!driveRes.data.id) {
      return res.status(502).json({ error: 'Photo upload did not return a file ID' });
    }
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    const signature = createMediaSignature(data.userId, driveRes.data.id, expires);
    const finalPhotoUrl = `/proxy-drive-image/${driveRes.data.id}?userId=${encodeURIComponent(data.userId)}&expires=${expires}&signature=${signature}`;

    const registrationDate = new Date().toISOString().split('T')[0];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Members!A:N',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          data.memberId,
          data.fullName,
          data.phone,
          data.businessName,
          data.businessType,
          data.shopNumber,
          data.address || '',
          finalPhotoUrl,
          data.qrCode,
          registrationDate,
          data.status,
          data.userId,
          data.assignedRevenueTypes || '',
          data.isPrincipalOwner ? 'true' : 'false'
        ]]
      }
    });

    res.json({ success: true, memberId: data.memberId, photoUrl: finalPhotoUrl });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Add Member Error:', error.message);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ── Update member status or details ──────────────────────────────────────────
marketRouter.put('/members/:userId/:memberId', async (req, res) => {
  try {
    const { userId, memberId } = req.params;
    const updates = req.body; // { status?, fullName?, phone?, businessName?, businessType?, shopNumber?, address? }

    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    if (!spreadsheetId) return res.status(400).json({ error: 'Spreadsheet not found' });

    // Find the row with this memberId
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Members!A2:N' });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((r: any) => r[0] === memberId);
    if (rowIndex === -1) return res.status(404).json({ error: 'Member not found' });

    if (updates.isPrincipalOwner && updates.shopNumber) {
      const existingPrincipal = rows.find((r: any) => r[0] !== memberId && r[5] === updates.shopNumber && (!r[13] || r[13] === 'true'));
      if (existingPrincipal) {
        return res.status(400).json({ error: `Shop ${updates.shopNumber} already has a Principal Owner.` });
      }
    }

    const sheetRow = rowIndex + 2; // +2 because range starts at A2 and is 1-indexed
    const existingRow = rows[rowIndex];

    // Merge updates into existing values (columns A–L)
    const newRow = [
      existingRow[0] || memberId,            // A: id
      updates.fullName       ?? existingRow[1] ?? '',
      updates.phone          ?? existingRow[2] ?? '',
      updates.businessName   ?? existingRow[3] ?? '',
      updates.businessType   ?? existingRow[4] ?? '',
      updates.shopNumber     ?? existingRow[5] ?? '',
      updates.address        ?? existingRow[6] ?? '',
      existingRow[7] || '',                  // H: photoUrl (unchanged)
      existingRow[8] || '',                  // I: qrCode   (unchanged)
      existingRow[9] || '',                  // J: registrationDate
      updates.status         ?? existingRow[10] ?? '',
      existingRow[11] || '',                 // L: createdBy
      updates.assignedRevenueTypes ?? existingRow[12] ?? '', // M: assignedRevenueTypes
      updates.isPrincipalOwner !== undefined ? updates.isPrincipalOwner.toString() : (existingRow[13] ?? ''), // N: isPrincipalOwner
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Members!A${sheetRow}:N${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update Member Error:', error.message);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// ── Delete a member row ───────────────────────────────────────────────────────
marketRouter.delete('/members/:userId/:memberId', async (req, res) => {
  try {
    const { userId, memberId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    if (!spreadsheetId) return res.status(400).json({ error: 'Spreadsheet not found' });

    // Find the row index
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Members!A2:N' });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((r: any) => r[0] === memberId);
    if (rowIndex === -1) return res.status(404).json({ error: 'Member not found' });

    const sheetRow = rowIndex + 2;

    // Get the sheet ID for the Members tab
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const membersSheet = meta.data.sheets?.find((s: any) => s.properties?.title === 'Members');
    const sheetId = membersSheet?.properties?.sheetId ?? 0;

    // Delete the row using batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: sheetRow - 1, // 0-indexed
              endIndex: sheetRow,
            }
          }
        }]
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete Member Error:', error.message);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});



const AppendSheetSchema = z.object({
  userId: z.string().min(1),
  sheetName: z.string().min(1), // e.g., 'Tasks', 'Officials', 'RevenueCollections'
  values: z.array(z.any())
});

marketRouter.post('/sheet-append', async (req, res) => {
  try {
    const data = AppendSheetSchema.parse(req.body);
    const auth = await getOAuthClientForUser(data.userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(data.userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${data.sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [data.values]
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error(`Sheet Append Error (${req.body?.sheetName}):`, error.message);
    res.status(500).json({ error: 'Failed to append record' });
  }
});

marketRouter.get('/tasks/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Tasks!A2:J',
    });

    const rows = response.data.values || [];
    const tasks = rows.map((row: any) => ({
      id: row[0] || '',
      title: row[1] || '',
      description: row[2] || '',
      priority: row[3] || '',
      assignedTo: row[4] || '',
      dueDate: row[5] || '',
      status: row[6] || '',
      createdDate: row[7] || '',
      completedDate: row[8] || '',
      category: row[9] || ''
    }));

    res.json(tasks);
  } catch (error: any) {
    console.error('Fetch Tasks Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

marketRouter.get('/officials/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Officials!A2:H',
    });

    const rows = response.data.values || [];
    const officials = rows.map((row: any) => ({
      id: row[0] || '',
      fullName: row[1] || '',
      rank: row[2] || '',
      department: row[3] || '',
      officialNumber: row[4] || '',
      photoUrl: row[5] || '',
      status: row[6] || '',
      type: row[7] || ''
    }));

    res.json(officials);
  } catch (error: any) {
    console.error('Fetch Officials Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch officials' });
  }
});

// ── Update official status or details ─────────────────────────────────────────
marketRouter.put('/officials/:userId/:officialId', async (req, res) => {
  try {
    const { userId, officialId } = req.params;
    const updates = req.body; 

    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    if (!spreadsheetId) return res.status(400).json({ error: 'Spreadsheet not found' });

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Officials!A2:H' });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((r: any) => r[0] === officialId);
    if (rowIndex === -1) return res.status(404).json({ error: 'Official not found' });

    const sheetRow = rowIndex + 2; 
    const existingRow = rows[rowIndex];

    const newRow = [
      existingRow[0] || officialId,          // A: id
      updates.fullName       ?? existingRow[1] ?? '',
      updates.rank           ?? existingRow[2] ?? '',
      updates.department     ?? existingRow[3] ?? '',
      updates.officialNumber ?? existingRow[4] ?? '',
      existingRow[5] || '',                  // F: photoUrl
      updates.status         ?? existingRow[6] ?? '',
      updates.type           ?? existingRow[7] ?? '',
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Officials!A${sheetRow}:H${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update Official Error:', error.message);
    res.status(500).json({ error: 'Failed to update official' });
  }
});

// ── Delete an official row ───────────────────────────────────────────────────
marketRouter.delete('/officials/:userId/:officialId', async (req, res) => {
  try {
    const { userId, officialId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    if (!spreadsheetId) return res.status(400).json({ error: 'Spreadsheet not found' });

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Officials!A2:H' });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((r: any) => r[0] === officialId);
    if (rowIndex === -1) return res.status(404).json({ error: 'Official not found' });

    const sheetRow = rowIndex + 2;

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetInfo = meta.data.sheets?.find((s: any) => s.properties?.title === 'Officials');
    const sheetId = sheetInfo?.properties?.sheetId ?? 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: sheetRow - 1, 
              endIndex: sheetRow,
            }
          }
        }]
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete Official Error:', error.message);
    res.status(500).json({ error: 'Failed to delete official' });
  }
});


const AddTaskSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.string().min(1),
  assignedTo: z.string().min(1),
  dueDate: z.string().min(1),
  category: z.string().min(1)
});

marketRouter.post('/tasks', async (req, res) => {
  try {
    const data = AddTaskSchema.parse(req.body);
    const auth = await getOAuthClientForUser(data.userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(data.userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const taskId = 'TSK-' + Math.floor(100000 + Math.random() * 900000);
    const createdDate = new Date().toISOString().split('T')[0];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Tasks!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          taskId,
          data.title,
          data.description,
          data.priority,
          data.assignedTo,
          data.dueDate,
          'Pending', // default status
          createdDate,
          '',
          data.category
        ]]
      }
    });

    res.json({ success: true, taskId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Add Task Error:', error.message);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

marketRouter.get('/revenue-types/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RevenueTypes!A2:G',
    });

    const rows = response.data.values || [];
    const types = rows.map((row: any) => ({
      id: row[0] || '',
      name: row[1] || '',
      amount: Number(row[2]) || 0,
      frequency: row[3] || '',
      description: row[4] || '',
      status: row[5] || '',
      prefix: row[6] || ''
    }));

    res.json(types);
  } catch (error: any) {
    console.error('Fetch Revenue Types Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch revenue types' });
  }
});

const AddRevenueTypeSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  amount: z.number().min(0),
  frequency: z.string().min(1),
  description: z.string().optional(),
  prefix: z.string().min(1)
});

marketRouter.post('/revenue-types', async (req, res) => {
  try {
    const data = AddRevenueTypeSchema.parse(req.body);
    const auth = await getOAuthClientForUser(data.userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(data.userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const typeId = 'RT-' + Math.floor(1000 + Math.random() * 9000);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'RevenueTypes!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          typeId,
          data.name,
          data.amount,
          data.frequency,
          data.description || '',
          'Active',
          data.prefix.toUpperCase()
        ]]
      }
    });

    res.json({ success: true, typeId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Add Revenue Type Error:', error.message);
    res.status(500).json({ error: 'Failed to add revenue type' });
  }
});

marketRouter.get('/collections/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const auth = await getOAuthClientForUser(userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RevenueCollections!A2:J',
    });

    const rows = response.data.values || [];
    const collections = rows.map((row: any) => ({
      receipt: row[0] || '',
      member: row[1] || '',
      official: row[2] || '',
      type: row[3] || '',
      amount: Number(row[4]) || 0,
      date: row[5] || '',
      time: row[6] || '',
      gps: row[7] || '',
      photoUrl: row[8] || '',
      signatureUrl: row[9] || ''
    }));

    res.json(collections);
  } catch (error: any) {
    console.error('Fetch Collections Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

const AddCollectionSchema = z.object({
  userId: z.string().min(1),
  memberId: z.string().min(1),
  officialId: z.string().min(1),
  typeId: z.string().min(1),
  typeName: z.string().min(1),
  amount: z.number().min(0),
  prefix: z.string().min(1)
});

marketRouter.post('/collections', async (req, res) => {
  try {
    const data = AddCollectionSchema.parse(req.body);
    const auth = await getOAuthClientForUser(data.userId);
    const sheets = getSheets(auth);
    
    const userDoc = await getFirestore().collection('users').doc(data.userId).get();
    const spreadsheetId = userDoc.data()?.marketSpreadsheetId;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Market Spreadsheet ID not found. Please setup your market database first.' });
    }

    const receiptNumber = `${data.prefix.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'RevenueCollections!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          receiptNumber,
          data.memberId,
          data.officialId,
          data.typeName,
          data.amount,
          dateStr,
          timeStr,
          '',
          '',
          ''
        ]]
      }
    });

    res.json({ success: true, receiptNumber });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Add Collection Error:', error.message);
    res.status(500).json({ error: 'Failed to add collection' });
  }
});

const MarketSettingsSchema = z.object({
  userId: z.string().min(1),
  settings: z.object({
    name: z.string().min(1),
    address: z.string().optional(),
    registrationNumber: z.string().optional(),
    logoUrl: z.string().optional(),
    color: z.string().optional(),
    emergencyNumbers: z.string().optional()
  })
});


const UploadLogoSchema = z.object({
  userId: z.string().min(1),
  logoDataUrl: z.string().min(1)
});

marketRouter.post('/upload-logo', async (req, res) => {
  try {
    const { userId, logoDataUrl } = UploadLogoSchema.parse(req.body);
    const auth = await getOAuthClientForUser(userId);
    const drive = getDrive(auth);
    
    const userDoc = await getFirestore().collection('users').doc(userId).get();
    const folderId = userDoc.data()?.marketFolderId;
    
    const base64Data = logoDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    const stream = new Readable();
    stream.push(imageBuffer);
    stream.push(null);

    const fileMetadata: any = {
      name: `logo_${Date.now()}.jpg`,
    };
    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const driveRes = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'image/jpeg',
        body: stream
      },
      fields: 'id'
    });

    if (!driveRes.data.id) return res.status(502).json({ error: 'Logo upload did not return a file ID' });
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    const signature = createMediaSignature(userId, driveRes.data.id, expires);
    const logoUrl = `/api/drive-image/${driveRes.data.id}?userId=${encodeURIComponent(userId)}&expires=${expires}&signature=${signature}`;
    res.json({ logoUrl });
  } catch (error: any) {
    console.error('Upload Logo Error:', error.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

marketRouter.post('/settings', async (req, res) => {
  try {
    const { userId, settings } = MarketSettingsSchema.parse(req.body);
    
    await getFirestore().collection('users').doc(userId).set({
      marketSettings: settings
    }, { merge: true });
    
    res.json({ success: true, settings });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Save Market Settings Error:', error.message);
    res.status(500).json({ error: 'Failed to save market settings' });
  }
});

const SaveSetupSchema = z.object({
  userId: z.string().min(1),
  spreadsheetId: z.string().min(1),
  folderId: z.string().optional()
});

marketRouter.post('/save-setup', async (req, res) => {
  try {
    const { userId, spreadsheetId, folderId } = SaveSetupSchema.parse(req.body);
    
    await getFirestore().collection('users').doc(userId).set({
      marketSpreadsheetId: spreadsheetId,
      ...(folderId ? { marketFolderId: folderId } : {})
    }, { merge: true });
    
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: error.issues });
    }
    console.error('Save Setup Error:', error.message);
    res.status(500).json({ error: 'Failed to save database setup' });
  }
});
