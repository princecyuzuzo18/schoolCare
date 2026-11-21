import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { db } from './database';

const COOKIE_NAME = 'schoolcare_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface Session {
  userId: string;
  /**
   * Snapshot of the account's credential epoch when this session was issued.
   * If the account's epoch changes (a secure access reset), the session is
   * rejected even though its cookie is still present.
   */
  credentialsResetAt?: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

function getCookieValue(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const entry = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  if (!entry) return undefined;

  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function cookieOptions(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

function activeSession(req: Request): Session | undefined {
  const sessionId = getCookieValue(req, COOKIE_NAME);
  if (!sessionId) return undefined;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function createSession(userId: string, res: Response, credentialsResetAt?: string): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }

  const sessionId = randomBytes(32).toString('base64url');
  const epoch = credentialsResetAt ?? db.getUserById(userId)?.credentialsResetAt;
  sessions.set(sessionId, { userId, credentialsResetAt: epoch, expiresAt: now + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; ${cookieOptions()}`);
}

export function getSessionUserId(req: Request): string | undefined {
  return activeSession(req)?.userId;
}

/** Credential epoch captured when the current session was issued. */
export function getSessionCredentialEpoch(req: Request): string | undefined {
  return activeSession(req)?.credentialsResetAt;
}

/** Immediately revoke every active session for an account. */
export function invalidateUserSessions(userId: string): void {
  for (const [id, session] of sessions) {
    if (session.userId === userId) sessions.delete(id);
  }
}

export function destroySession(req: Request, res: Response): void {
  const sessionId = getCookieValue(req, COOKIE_NAME);
  if (sessionId) sessions.delete(sessionId);

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
