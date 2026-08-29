import { google } from 'googleapis';

export const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = (process.env.APP_URL || 'http://localhost:3005').replace(/\/$/, '');
  const redirectUri = `${baseUrl}/api/google/callback`;
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};


let googleAuth: any = null;

export const getGoogleAuth = () => {
  if (googleAuth) return googleAuth;
  
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsJson) {
    // If no service account, we rely purely on OAuth2 per request
    return null;
  }

  try {
    const creds = JSON.parse(credsJson);
    googleAuth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });
    return googleAuth;
  } catch (err: any) {
    console.warn('Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    return null;
  }
};

export const getServiceAccountEmail = () => {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    return creds.client_email || 'unknown';
  } catch (e) {
    return 'unknown';
  }
};

export const getSheets = (auth?: any) => google.sheets({ version: 'v4', auth: auth || getGoogleAuth() });
export const getDrive = (auth?: any) => google.drive({ version: 'v3', auth: auth || getGoogleAuth() });
