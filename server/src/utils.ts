import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Iraq has a single fixed UTC+3 offset (no daylight saving since 2008). */
export const BAGHDAD_TZ = 'Asia/Baghdad';
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BAGHDAD_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Server-side "today" in Baghdad. The device clock is never trusted. */
export function iraqDateStr(d: Date = new Date()): string {
  return dateFmt.format(d);
}

/** Next midnight in Baghdad (the moment daily free attempts renew). */
export function nextIraqMidnight(d: Date = new Date()): Date {
  const shifted = new Date(d.getTime() + BAGHDAD_OFFSET_MS);
  const nextUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return new Date(nextUtc - BAGHDAD_OFFSET_MS);
}

export function normalizePhone(raw: string): string {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('964')) return `+${digits}`;
  if (digits.startsWith('0')) return `+964${digits.slice(1)}`;
  return `+${digits}`;
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function assertUsername(raw: string): string {
  const username = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    throw new HttpError(
      400,
      'Username must be 3-20 characters using letters, numbers, "_" or "."',
      'invalid_username'
    );
  }
  return username;
}

export function assertPassword(raw: string): string {
  const password = String(raw || '');
  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters', 'weak_password');
  }
  if (password.length > 128) throw new HttpError(400, 'Password is too long', 'invalid_password');
  return password;
}

export function randomUsernameCandidate(base: string): string {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 14);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${clean || 'user'}${suffix}`;
}

export function randomNumericCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

export function intParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
