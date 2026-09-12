import type { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  auth?: admin.auth.DecodedIdToken;
}

function tokenFromRequest(req: Request): string | undefined {
  const header = req.header('authorization');
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

/** Verify the Firebase ID token and reject any client userId that is not the token UID. */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // OAuth redirects cannot carry an Authorization header. The callback authenticates
  // its signed state independently in google.ts.
  if (req.path === '/callback') return next();

  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.auth = decoded;

    const suppliedIds: unknown[] = [
      req.body?.userId,
      req.query.userId,
      req.params.userId
    ];
    if (suppliedIds.some(id => id !== undefined && id !== decoded.uid)) {
      return res.status(403).json({ error: 'User ID does not match authenticated user' });
    }
    next();
  } catch (error: any) {
    console.warn('[Auth] Firebase ID token rejected:', error.code || error.message);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function authenticatedUid(req: AuthenticatedRequest): string {
  if (!req.auth?.uid) throw new Error('Authentication required');
  return req.auth.uid;
}

export function createOAuthState(uid: string): string {
  const payload = Buffer.from(JSON.stringify({
    uid,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000
  })).toString('base64url');
  const secret = process.env.OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('OAuth state secret is not configured');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string): string {
  const [payload, signature] = state.split('.');
  const secret = process.env.OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!payload || !signature || !secret) throw new Error('Invalid OAuth state');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Invalid OAuth state');
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!parsed.uid || !parsed.nonce || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
    throw new Error('Invalid or expired OAuth state');
  }
  return parsed.uid;
}

export function createMediaSignature(uid: string, fileId: string, expires: number): string {
  const secret = process.env.MEDIA_URL_SECRET || process.env.OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('Media URL secret is not configured');
  return crypto.createHmac('sha256', secret).update(`${uid}:${fileId}:${expires}`).digest('base64url');
}

export function verifyMediaSignature(uid: string, fileId: string, expires: string, signature: string): boolean {
  const expiry = Number(expires);
  if (!Number.isSafeInteger(expiry) || expiry < Date.now()) return false;
  const expected = createMediaSignature(uid, fileId, expiry);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireAuthOrSignedMedia(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { userId, expires, signature } = req.query;
  const fileId = req.path.split('/').filter(Boolean).pop();
  if (
    typeof userId === 'string' &&
    typeof expires === 'string' &&
    typeof signature === 'string' &&
    fileId &&
    verifyMediaSignature(userId, fileId, expires, signature)
  ) {
    return next();
  }
  return requireAuth(req, res, next);
}
