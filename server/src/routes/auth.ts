import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one, q, tx } from '../db';
import {
  JWT_SECRET,
  assertNotThrottled,
  clearAttempts,
  currentUser,
  recordAttempt,
  reqUser,
  requireAuth,
  signUserToken,
} from '../auth';
import { equippedCosmetics, equippedFrameInfo } from '../frames';
import { getFreeCallState } from '../freecalls';
import { notify } from '../notify';
import { getPublicUser } from '../serializers';
import { getSettings } from '../settings';
import { sendSms, smsConfigured } from '../sms';
import {
  HttpError,
  asyncHandler,
  assertPassword,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  randomNumericCode,
} from '../utils';

const router = Router();
const isPreview = process.env.BASE44_PREVIEW_MODE === '1';

interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  country: string | null;
  age: number | null;
  is_admin: boolean;
  is_banned: boolean;
  provider: string;
  created_at: string;
}

function serializeSelf(row: UserRow, frame: Awaited<ReturnType<typeof equippedFrameInfo>>) {
  return {
    frame,
    id: row.id,
    email: row.email,
    phone: row.phone,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    gender: row.gender,
    country: row.country,
    age: row.age ?? null,
    isAdmin: row.is_admin,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

export async function buildMe(userId: string) {
  const row = await one<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!row) throw new HttpError(404, 'Account not found', 'account_missing');
  const wallet = await one<{ balance: number; reserved: number; earned: number; spent: number }>(
    'SELECT balance, reserved, earned, spent FROM wallets WHERE user_id = $1',
    [userId]
  );
  const free = await getFreeCallState(userId);
  const unread = await one<{ count: string }>(
    'SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  const requests = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM friendships WHERE addressee_id = $1 AND status = 'pending'`,
    [userId]
  );
  const messages = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1
     WHERE m.sender_id <> $1 AND m.read_at IS NULL`,
    [userId]
  );
  const settings = await getSettings();
  return {
    user: serializeSelf(row, await equippedFrameInfo(userId)),
    cosmetics: await equippedCosmetics(userId),
    wallet: wallet ?? { balance: 0, reserved: 0, earned: 0, spent: 0 },
    freeCalls: free,
    unreadNotifications: Number(unread?.count || 0),
    friendRequests: Number(requests?.count || 0),
    unreadMessages: Number(messages?.count || 0),
    config: {
      appName: settings.app_name,
      voicePrice: settings.voice_price,
      videoPrice: settings.video_price,
      freeCallsPerDay: settings.free_calls_per_day,
      freeCallsEnabled: settings.free_calls_enabled,
      paidCallsEnabled: settings.paid_calls_enabled,
      minWithdrawalCoins: settings.min_withdrawal_coins,
      coinToIqdRate: settings.coin_to_iqd_rate,
      supportContact: settings.support_contact,
    },
  };
}

// Public: which social sign-in providers are actually configured, so the
// welcome screen can show them without offering a button that cannot work.
router.get('/providers', (_req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    apple: false,
  });
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const email = req.body?.email ? normalizeEmail(req.body.email) : null;
    const phoneRaw = req.body?.phone ? normalizePhone(req.body.phone) : null;
    const password = assertPassword(req.body?.password);
    const displayName = String(req.body?.displayName || req.body?.name || '').trim();
    const avatarUrl = req.body?.avatarUrl ? String(req.body.avatarUrl) : null;

    if (!email && !phoneRaw) {
      throw new HttpError(400, 'Email or phone number is required', 'missing_identifier');
    }
    if (email && !isValidEmail(email)) throw new HttpError(400, 'Invalid email address', 'invalid_email');
    if (!displayName || displayName.length < 2) {
      throw new HttpError(400, 'Please enter your name', 'invalid_display_name');
    }

    let phoneTokenPayload: { phone: string } | null = null;
    if (phoneRaw) {
      const phoneToken = String(req.body?.phoneToken || '');
      if (!phoneToken) {
        throw new HttpError(400, 'Phone verification is required', 'phone_unverified');
      }
      try {
        const decoded = jwt.verify(phoneToken, JWT_SECRET) as { phone?: string; kind?: string };
        if (decoded.kind !== 'phone_verified' || decoded.phone !== phoneRaw) throw new Error('mismatch');
        phoneTokenPayload = { phone: phoneRaw };
      } catch {
        throw new HttpError(400, 'Phone verification expired, please request a new code', 'phone_token_invalid');
      }
    }

    if (email) {
      const existing = await one('SELECT 1 FROM users WHERE email = $1', [email]);
      if (existing) throw new HttpError(409, 'This email is already registered', 'email_taken');
    }
    if (phoneTokenPayload) {
      const existing = await one('SELECT 1 FROM users WHERE phone = $1', [phoneTokenPayload.phone]);
      if (existing) throw new HttpError(409, 'This phone number is already registered', 'phone_taken');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await tx(async (c) => {
      // The 6-digit account ID is generated by the column default (user_code_seq).
      const { rows } = await c.query<UserRow>(
        `INSERT INTO users (email, phone, display_name, password_hash, avatar_url, phone_verified, provider)
         VALUES ($1, $2, $3, $4, $5, $6, 'password') RETURNING *`,
        [
          email,
          phoneTokenPayload?.phone ?? null,
          displayName.slice(0, 60),
          passwordHash,
          avatarUrl,
          Boolean(phoneTokenPayload),
        ]
      );
      await c.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
      return rows[0];
    });

    await notify(
      created.id,
      'welcome',
      'مرحباً بك في Connect+',
      'لديك 5 محاولات مجانية يومياً لمكالمات الصوت والفيديو',
      { freeCalls: (await getSettings()).free_calls_per_day }
    );

    res.status(201).json({ token: signUserToken(created.id), ...(await buildMe(created.id)) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const identifierRaw = String(req.body?.identifier || req.body?.email || req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    if (!identifierRaw || !password) {
      throw new HttpError(400, 'Enter your account and password', 'missing_credentials');
    }
    const identifier = identifierRaw.toLowerCase();
    await assertNotThrottled(identifier, 'login');

    const email = normalizeEmail(identifierRaw);
    const phone = normalizePhone(identifierRaw);
    const user = await one<UserRow & { password_hash: string | null }>(
      `SELECT * FROM users
       WHERE lower(email) = $1 OR phone = $2 OR username = $1
       LIMIT 1`,
      [email, phone]
    );

    const passwordOk = user?.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;
    if (!user || !passwordOk) {
      await recordAttempt(identifier, 'login');
      throw new HttpError(401, 'Wrong account or password', 'invalid_credentials');
    }
    if (user.is_banned) {
      throw new HttpError(403, 'This account is banned', 'banned');
    }

    await clearAttempts(identifier, 'login');
    await q('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]);
    res.json({ token: signUserToken(user.id), ...(await buildMe(user.id)) });
  })
);

router.post(
  '/otp/request',
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body?.phone || '');
    if (!phone || phone.length < 8) throw new HttpError(400, 'Invalid phone number', 'invalid_phone');
    await assertNotThrottled(phone, 'otp');

    const code = randomNumericCode(6);
    const hash = await bcrypt.hash(code, 8);
    await q(
      `INSERT INTO otp_codes (phone, code_hash, purpose, expires_at)
       VALUES ($1, $2, 'register', now() + interval '5 minutes')`,
      [phone, hash]
    );
    await recordAttempt(phone, 'otp');

    const smsReady = smsConfigured();
    if (smsReady) {
      try {
        await sendSms(phone, `${code} is your Connect+ verification code. It expires in 5 minutes.`);
      } catch (error) {
        console.error('[auth] sms delivery failed', (error as Error).message);
        throw new HttpError(502, 'Could not send the SMS code, please try again', 'sms_failed');
      }
    }

    res.json({
      sent: true,
      expiresInSeconds: 300,
      delivery: smsReady ? 'sms' : 'unconfigured',
      // Preview-only convenience: without an SMS gateway the code is echoed to the app.
      devCode: isPreview && !smsReady ? code : undefined,
    });
  })
);

router.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body?.phone || '');
    const code = String(req.body?.code || '').trim();
    if (!phone || !code) throw new HttpError(400, 'Phone and code are required', 'missing_code');

    const row = await one<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM otp_codes
       WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    if (!row) throw new HttpError(400, 'Code expired, request a new one', 'code_expired');
    if (row.attempts >= 5) throw new HttpError(429, 'Too many attempts for this code', 'code_locked');

    const ok = await bcrypt.compare(code, row.code_hash);
    await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    if (!ok) throw new HttpError(400, 'Wrong verification code', 'invalid_code');

    await q('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [row.id]);
    const phoneToken = jwt.sign({ phone, kind: 'phone_verified' }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ verified: true, phone, phoneToken });
  })
);

router.post(
  '/google',
  asyncHandler(async (req, res) => {
    const idToken = String(req.body?.idToken || '');
    const accessToken = String(req.body?.accessToken || '');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new HttpError(
        503,
        'Google sign-in needs a Google OAuth client. Add GOOGLE_CLIENT_ID to enable it.',
        'google_not_configured'
      );
    }
    if (!idToken && !accessToken) throw new HttpError(400, 'Missing Google credential', 'missing_token');

    // The browser gets an ID token (implicit flow) or an access token (popup flow);
    // tokeninfo validates either and reports the audience it was issued for.
    const query = idToken
      ? `id_token=${encodeURIComponent(idToken)}`
      : `access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?${query}`);
    if (!response.ok) throw new HttpError(401, 'Google token rejected', 'invalid_google_token');
    const info = (await response.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
    };
    if (info.aud !== clientId || !info.email) {
      throw new HttpError(401, 'Google token does not match this app', 'invalid_google_token');
    }
    const email = normalizeEmail(info.email);
    let user = await one<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      const created = await tx(async (c) => {
        const { rows } = await c.query<UserRow>(
          `INSERT INTO users (email, display_name, avatar_url, provider, email_verified)
           VALUES ($1, $2, $3, 'google', true) RETURNING *`,
          [email, (info.name || email.split('@')[0]).slice(0, 60), info.picture || null]
        );
        await c.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
        return rows[0];
      });
      user = created;
    }
    if (user.is_banned) throw new HttpError(403, 'This account is banned', 'banned');
    res.json({ token: signUserToken(user.id), ...(await buildMe(user.id)) });
  })
);

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email || '');
    if (!isValidEmail(email)) throw new HttpError(400, 'Invalid email address', 'invalid_email');
    await assertNotThrottled(email, 'reset');

    const user = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (!user) {
      // Do not reveal whether an account exists.
      res.json({ sent: true });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await q(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [user.id, hash]
    );
    await recordAttempt(email, 'reset');
    res.json({
      sent: true,
      expiresInSeconds: 1800,
      delivery: process.env.SMTP_URL ? 'email' : 'unconfigured',
      devToken: isPreview && !process.env.SMTP_URL ? token : undefined,
    });
  })
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || '');
    const password = assertPassword(req.body?.password);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await one<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now() LIMIT 1`,
      [hash]
    );
    if (!row) throw new HttpError(400, 'This reset link is invalid or expired', 'invalid_reset');
    const passwordHash = await bcrypt.hash(password, 10);
    await tx(async (c) => {
      await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [row.user_id, passwordHash]);
      await c.query('UPDATE password_resets SET consumed_at = now() WHERE id = $1', [row.id]);
    });
    res.json({ ok: true });
  })
);

router.post(
  '/change-password',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = reqUser(req);
    const current = String(req.body?.currentPassword || '');
    const next = assertPassword(req.body?.newPassword);
    const row = await one<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id]
    );
    if (!row?.password_hash || !(await bcrypt.compare(current, row.password_hash))) {
      throw new HttpError(401, 'Current password is wrong', 'invalid_credentials');
    }
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [
      user.id,
      await bcrypt.hash(next, 10),
    ]);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = reqUser(req);
    res.json(await buildMe(user.id));
  })
);

router.patch(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = reqUser(req);
    const displayName = req.body?.displayName ? String(req.body.displayName).trim().slice(0, 60) : null;
    const bio = req.body?.bio !== undefined ? String(req.body.bio).slice(0, 300) : null;
    const avatarUrl = req.body?.avatarUrl !== undefined ? String(req.body.avatarUrl || '') || null : null;
    const gender = req.body?.gender !== undefined ? String(req.body.gender || '') || null : null;
    const country = req.body?.country !== undefined ? String(req.body.country || '') || null : null;
    let age: number | null = null;
    if (req.body?.age !== undefined && req.body.age !== null && req.body.age !== '') {
      age = Number(req.body.age);
      if (!Number.isInteger(age) || age < 13 || age > 120) {
        throw new HttpError(400, 'Age must be between 13 and 120', 'invalid_age');
      }
    }
    if (displayName !== null && displayName.length < 2) {
      throw new HttpError(400, 'Name is too short', 'invalid_display_name');
    }
    await q(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         bio = COALESCE($3, bio),
         avatar_url = COALESCE($4, avatar_url),
         gender = COALESCE($5, gender),
         country = COALESCE($6, country),
         age = COALESCE($7, age)
       WHERE id = $1`,
      [user.id, displayName, bio, avatarUrl, gender, country, age]
    );
    res.json(await buildMe(user.id));
  })
);

router.delete(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = reqUser(req);
    const password = String(req.body?.password || '');
    const row = await one<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id]
    );
    if (row?.password_hash && !(await bcrypt.compare(password, row.password_hash))) {
      throw new HttpError(401, 'Password is wrong', 'invalid_credentials');
    }
    await q('DELETE FROM users WHERE id = $1', [user.id]);
    res.json({ deleted: true });
  })
);

router.get(
  '/sessions',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const user = reqUser(req);
    const me = await currentUser(req);
    const publicUser = await getPublicUser(user.id);
    res.json({ session: me.username, user: publicUser });
  })
);

export default router;
