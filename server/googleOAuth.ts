import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from './database';
import { hashPassword } from './authCredentials';
import { getMysqlPool } from './mysqlConnector';
import type { UserProfile } from '../src/types';

const STATE_COOKIE = 'schoolcare_oauth_state';
const STATE_TTL_SECONDS = 10 * 60;
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

export interface GoogleOAuthConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function clean(value: string | undefined): string {
  return (value || '').trim().replace(/^['"]|['"]$/g, '');
}

function isPlaceholder(value: string): boolean {
  return !value || value.length < 10 || /^(my[_-]?google|your[_-]?google|change[_-]?me|replace[_-]?me|placeholder)/i.test(value);
}

/** Local default; override with GOOGLE_REDIRECT_URI for a deployed origin. */
export function defaultGoogleRedirectUri(): string {
  const configured = clean(process.env.APP_URL).replace(/\/+$/, '');
  const base = /^https?:\/\//i.test(configured)
    ? configured
    : `http://localhost:${clean(process.env.PORT) || '3010'}`;
  return `${base}/api/auth/google/callback`;
}

/** Read at request time: server.ts calls dotenv.config() after static imports. */
export function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = clean(process.env.GOOGLE_REDIRECT_URI) || defaultGoogleRedirectUri();
  return {
    enabled: !isPlaceholder(clientId) && !isPlaceholder(clientSecret) && /^https?:\/\//i.test(redirectUri),
    clientId,
    clientSecret,
    redirectUri
  };
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = googleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function cookieSuffix(): string {
  return `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function newOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieSuffix()}; Max-Age=${STATE_TTL_SECONDS}`);
}

export function readOAuthStateCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const entry = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${STATE_COOKIE}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(STATE_COOKIE.length + 1));
  } catch {
    return undefined;
  }
}

export function clearOAuthStateCookie(res: Response): void {
  const cleared = `${STATE_COOKIE}=; ${cookieSuffix()}; Max-Age=0`;
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cleared]);
  } else if (existing) {
    res.setHeader('Set-Cookie', [String(existing), cleared]);
  } else {
    res.setHeader('Set-Cookie', cleared);
  }
}

/** Constant-time comparison so state cannot be guessed by timing differences. */
export function oauthStateMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GoogleOAuthError extends Error {
  constructor(public readonly code: 'TOKEN_EXCHANGE_FAILED' | 'INVALID_ID_TOKEN' | 'UNVERIFIED_EMAIL' | 'ACCOUNT_INACTIVE' | 'DATABASE_UNAVAILABLE') {
    super(code);
    this.name = 'GoogleOAuthError';
  }
}

interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  firstName: string;
  lastName: string;
  picture: string;
}

/**
 * Exchange the one-time authorization code and verify the returned ID token
 * with Google's tokeninfo endpoint. Tokens are never logged or returned.
 */
export async function verifyGoogleCode(code: string): Promise<GoogleClaims> {
  const { clientId, clientSecret, redirectUri } = googleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  let idToken = '';
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000)
    });
    if (!tokenResponse.ok) throw new GoogleOAuthError('TOKEN_EXCHANGE_FAILED');
    const tokens = await tokenResponse.json() as { id_token?: string };
    idToken = typeof tokens.id_token === 'string' ? tokens.id_token : '';
    if (!idToken) throw new GoogleOAuthError('INVALID_ID_TOKEN');

    const infoResponse = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(15_000)
    });
    if (!infoResponse.ok) throw new GoogleOAuthError('INVALID_ID_TOKEN');
    const claims = await infoResponse.json() as {
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      exp?: string;
    };

    if (claims.aud !== clientId || !claims.sub || !claims.email) {
      throw new GoogleOAuthError('INVALID_ID_TOKEN');
    }
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
      throw new GoogleOAuthError('UNVERIFIED_EMAIL');
    }
    if (claims.exp && Number(claims.exp) < Math.floor(Date.now() / 1000)) {
      throw new GoogleOAuthError('INVALID_ID_TOKEN');
    }

    const fullName = (claims.name || claims.email.split('@')[0]).slice(0, 255);
    const firstName = (claims.given_name || fullName.split(' ')[0] || '').slice(0, 150);
    const lastName = (claims.family_name || fullName.split(' ').slice(1).join(' ') || '').slice(0, 150);
    return {
      sub: claims.sub.slice(0, 100),
      email: claims.email.slice(0, 254),
      emailVerified: true,
      fullName,
      firstName,
      lastName,
      picture: typeof claims.picture === 'string' ? claims.picture.slice(0, 1000) : ''
    };
  } finally {
    idToken = '';
  }
}

/**
 * Sign in an existing account or create a new, non-privileged PARENT account.
 * The random password is never stored in plaintext or logged; it only exists
 * so the standard credential table has a valid hash for future recovery.
 */
export async function ensureGoogleUser(claims: GoogleClaims): Promise<UserProfile> {
  const existing = db.getUserByEmail(claims.email);
  if (existing) {
    if (existing.isActive === false) throw new GoogleOAuthError('ACCOUNT_INACTIVE');
    return existing;
  }

  const school = db.getSchools()[0];
  const pool = getMysqlPool();
  if (!school || !pool) throw new GoogleOAuthError('DATABASE_UNAVAILABLE');

  const id = `user-${randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const user: UserProfile = {
    id,
    schoolId: school.id,
    email: claims.email,
    firstName: claims.firstName,
    lastName: claims.lastName,
    fullName: claims.fullName,
    role: 'PARENT',
    phone: '',
    avatarUrl: claims.picture,
    preferredLanguage: 'rw',
    isActive: true,
    createdAt: now,
    linkedStudentIds: []
  };

  const randomPassword = `Go-${randomBytes(24).toString('base64url')}`;
  const passwordHash = await hashPassword(randomPassword);
  await pool.execute(
    `INSERT INTO user_profiles
      (id, school_id, role_id, full_name, email, first_name, last_name, phone, avatar_url, preferred_language, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, school.id, 'PARENT', claims.fullName, claims.email, claims.firstName, claims.lastName, '', claims.picture, 'rw']
  );
  try {
    await pool.execute('INSERT INTO user_auth_credentials (user_id, password_hash) VALUES (?, ?)', [id, passwordHash]);
  } catch (error) {
    await pool.execute('DELETE FROM user_profiles WHERE id = ?', [id]);
    throw error;
  }

  return db.createUser(user);
}
