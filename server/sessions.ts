import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'schoolcare_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface Session {
  userId: string;
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

export function createSession(userId: string, res: Response): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }

  const sessionId = randomBytes(32).toString('base64url');
  sessions.set(sessionId, { userId, expiresAt: now + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; ${cookieOptions()}`);
}

export function getSessionUserId(req: Request): string | undefined {
  const sessionId = getCookieValue(req, COOKIE_NAME);
  if (!sessionId) return undefined;

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(sessionId);
    return undefined;
  }
  return session.userId;
}

export function destroySession(req: Request, res: Response): void {
  const sessionId = getCookieValue(req, COOKIE_NAME);
  if (sessionId) sessions.delete(sessionId);

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
