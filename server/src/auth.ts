import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { one, q } from './db';
import { HttpError } from './utils';

export const JWT_SECRET = process.env.SECRET_KEY || 'connect-plus-dev-secret';

export interface TokenPayload {
  sub: string;
  kind: 'user' | 'admin';
}

export function signUserToken(userId: string): string {
  return jwt.sign({ sub: userId, kind: 'user' } satisfies TokenPayload, JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function signAdminToken(adminId: string): string {
  return jwt.sign({ sub: adminId, kind: 'admin' } satisfies TokenPayload, JWT_SECRET, {
    expiresIn: '12h',
  });
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, JWT_SECRET);
  if (typeof payload === 'string' || !payload.sub || !payload.kind) {
    throw new HttpError(401, 'Invalid token', 'invalid_token');
  }
  return { sub: String(payload.sub), kind: payload.kind as 'user' | 'admin' };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function currentUser(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Authentication required', 'unauthenticated');
  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'invalid_token');
  }
  if (payload.kind !== 'user') throw new HttpError(403, 'Not a user session', 'forbidden');
  const user = await one<{
    id: string;
    username: string;
    display_name: string;
    is_banned: boolean;
    ban_reason: string | null;
    avatar_url: string | null;
  }>('SELECT id, username, display_name, avatar_url, is_banned, ban_reason FROM users WHERE id = $1', [
    payload.sub,
  ]);
  if (!user) throw new HttpError(401, 'Account not found', 'account_missing');
  if (user.is_banned) {
    throw new HttpError(403, user.ban_reason || 'This account is banned', 'banned');
  }
  return user;
}

export interface AuthedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_banned: boolean;
  ban_reason: string | null;
}

export interface AuthedAdmin {
  id: string;
  username: string;
  display_name: string;
}

export function reqUser(req: Request): AuthedUser {
  return (req as Request & { user: AuthedUser }).user;
}

export function reqAdmin(req: Request): AuthedAdmin {
  return (req as Request & { admin: AuthedAdmin }).admin;
}

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as Request & { user: Awaited<ReturnType<typeof currentUser>> }).user =
        await currentUser(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function currentAdmin(req: Request) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Authentication required', 'unauthenticated');
  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'invalid_token');
  }
  if (payload.kind !== 'admin') throw new HttpError(403, 'Admin access required', 'forbidden');
  const admin = await one<{ id: string; username: string; display_name: string }>(
    'SELECT id, username, display_name FROM admin_users WHERE id = $1',
    [payload.sub]
  );
  if (!admin) throw new HttpError(401, 'Admin account not found', 'account_missing');
  return admin;
}

export function requireAdmin() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as Request & { admin: Awaited<ReturnType<typeof currentAdmin>> }).admin =
        await currentAdmin(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Simple server-side brute-force guard, keyed by identifier + action. */
export async function assertNotThrottled(identifier: string, kind: string): Promise<void> {
  const row = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM auth_attempts
     WHERE identifier = $1 AND kind = $2 AND created_at > now() - interval '15 minutes'`,
    [identifier, kind]
  );
  if (Number(row?.count || 0) >= 12) {
    throw new HttpError(429, 'Too many attempts. Please try again later.', 'too_many_attempts');
  }
}

export async function recordAttempt(identifier: string, kind: string): Promise<void> {
  await q('INSERT INTO auth_attempts (identifier, kind) VALUES ($1, $2)', [identifier, kind]);
}

export async function clearAttempts(identifier: string, kind: string): Promise<void> {
  await q('DELETE FROM auth_attempts WHERE identifier = $1 AND kind = $2', [identifier, kind]);
}
