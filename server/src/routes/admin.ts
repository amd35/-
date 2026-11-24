import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { one, q, tx } from '../db';
import {
  assertNotThrottled,
  clearAttempts,
  recordAttempt,
  reqAdmin,
  requireAdmin,
  requireRole,
  signAdminToken,
} from '../auth';
import { activeCallFor, endCall } from '../calls';
import { notify } from '../notify';
import { confirmOrder } from '../orders';
import { emitToUser, isOnline, onlineUserIds } from '../realtime';
import { getSettings, updateSettings } from '../settings';
import { FRAME_RARITIES, FrameRow, serializeFrame } from '../frames';
import { GIFT_RARITIES, GiftRow, moveProfit, serializeGift } from '../gifts';
import { addToBag, listGiftPackages } from '../giftBag';
import { serializeRoomFrame, type RoomFrameRow } from '../roomFrames';
import { HttpError, asyncHandler, intParam, iraqDateStr, isUuid, nextIraqMidnight } from '../utils';
import { moveCoins, moveGold } from '../wallet';
import { giftUpload, upload } from './uploads';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) throw new HttpError(400, 'Enter credentials', 'missing_credentials');
    await assertNotThrottled(`admin:${username}`, 'admin_login');

    const admin = await one<{
      id: string;
      username: string;
      display_name: string;
      password_hash: string;
      role: string;
      is_active: boolean;
    }>(
      'SELECT id, username, display_name, password_hash, role, is_active FROM admin_users WHERE username = $1',
      [username]
    );
    const ok = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !ok) {
      await recordAttempt(`admin:${username}`, 'admin_login');
      throw new HttpError(401, 'Wrong admin credentials', 'invalid_credentials');
    }
    if (!admin.is_active) {
      throw new HttpError(403, 'This staff account is disabled', 'admin_disabled');
    }
    await clearAttempts(`admin:${username}`, 'admin_login');
    await q('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [admin.id]);
    res.json({
      token: signAdminToken(admin.id),
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.display_name,
        role: admin.role,
      },
    });
  })
);

router.use(requireAdmin());

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ admin: reqAdmin(req) });
  })
);

router.post(
  '/password',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const current = String(req.body?.currentPassword || '');
    const next = String(req.body?.newPassword || '');
    if (next.length < 8) {
      throw new HttpError(400, 'New password must be at least 8 characters', 'weak_password');
    }
    if (next.length > 128) throw new HttpError(400, 'Password is too long', 'invalid_password');
    const row = await one<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [admin.id]
    );
    if (!row || !(await bcrypt.compare(current, row.password_hash))) {
      throw new HttpError(401, 'Current password is wrong', 'invalid_credentials');
    }
    await q(
      `UPDATE admin_users SET password_hash = $2, password_source = 'custom' WHERE id = $1`,
      [admin.id, await bcrypt.hash(next, 10)]
    );
    await clearAttempts(`admin:${admin.username}`, 'admin_login');
    res.json({ ok: true });
  })
);

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const today = iraqDateStr();
    const stats = await one<Record<string, number>>(
      `SELECT
        (SELECT count(*)::int FROM calls WHERE (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS calls_today,
        (SELECT COALESCE(SUM(coins_charged), 0)::int FROM calls WHERE (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS coins_today,
        (SELECT COALESCE(SUM(coins), 0)::int FROM admin_earnings WHERE (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS admin_profit_today,
        (SELECT COALESCE(SUM(coins), 0)::int FROM earnings WHERE (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS host_profit_today,
        (SELECT COALESCE(SUM(coins_charged), 0)::int FROM calls) AS coins_total,
        (SELECT COALESCE(SUM(coins), 0)::int FROM admin_earnings) AS admin_profit_total,
        (SELECT count(*)::int FROM calls WHERE kind = 'voice' AND (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS voice_today,
        (SELECT count(*)::int FROM calls WHERE kind = 'video' AND (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS video_today,
        (SELECT count(*)::int FROM calls WHERE status IN ('ringing', 'accepted')) AS active_calls,
        (SELECT count(*)::int FROM users WHERE is_bot = false) AS total_users,
        (SELECT count(*)::int FROM users WHERE is_banned) AS banned_users,
        (SELECT COALESCE(SUM(attempts_used), 0)::int FROM daily_free_calls WHERE usage_date = $1::date) AS free_used_today,
        (SELECT COALESCE(SUM(amount), 0)::int FROM payment_orders WHERE status = 'paid' AND currency = 'IQD' AND (paid_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS revenue_iqd_today,
        (SELECT COALESCE(SUM(coins), 0)::int FROM payment_orders WHERE status = 'paid' AND (paid_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS coins_sold_today,
        (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports,
        (SELECT count(*)::int FROM withdrawal_requests WHERE status = 'pending') AS pending_withdrawals,
        (SELECT count(*)::int FROM messages WHERE (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date) AS messages_today`,
      [today]
    );

    const series = await q<{ day: string; calls: number; coins: number; admin_profit: number; signups: number }>(
      `SELECT d::date::text AS day,
        (SELECT count(*)::int FROM calls c WHERE (c.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS calls,
        (SELECT COALESCE(SUM(c.coins_charged), 0)::int FROM calls c WHERE (c.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS coins,
        (SELECT COALESCE(SUM(a.coins), 0)::int FROM admin_earnings a WHERE (a.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS admin_profit,
        (SELECT count(*)::int FROM users u WHERE (u.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS signups
       FROM generate_series($1::date - 6, $1::date, interval '1 day') AS d
       ORDER BY d`,
      [today]
    );

    const settings = await getSettings();
    res.json({
      stats,
      series,
      settings,
      onlineUsers: onlineUserIds().length,
    });
  })
);

router.get(
  '/users',
  requireRole('superadmin', 'moderator'),
  asyncHandler(async (req, res) => {
    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || 'all');
    const params: unknown[] = [`%${search}%`];
    let sql = `
      SELECT u.id, u.username, u.display_name, u.email, u.phone, u.avatar_url, u.is_banned,
             u.ban_reason, u.created_at, u.last_seen_at,
             COALESCE(w.balance, 0) AS balance, COALESCE(w.earned, 0) AS earned,
             COALESCE(w.spent, 0) AS spent,
             (SELECT count(*)::int FROM calls c WHERE c.caller_id = u.id OR c.callee_id = u.id) AS calls_count,
             (SELECT COALESCE(SUM(e.coins), 0)::int FROM earnings e WHERE e.user_id = u.id) AS earnings_total,
             (SELECT COALESCE(SUM(d.attempts_used), 0)::int FROM daily_free_calls d
                WHERE d.user_id = u.id AND d.usage_date = $2::date) AS free_used_today
      FROM users u LEFT JOIN wallets w ON w.user_id = u.id
      WHERE u.is_bot = false AND (u.display_name ILIKE $1 OR u.username ILIKE $1 OR COALESCE(u.email, '') ILIKE $1
             OR COALESCE(u.phone, '') ILIKE $1 OR u.id::text = $3)`;
    params.push(iraqDateStr());
    params.push(search);
    if (status === 'banned') sql += ' AND u.is_banned = true';
    if (status === 'active') sql += ' AND u.is_banned = false';
    sql += ' ORDER BY u.created_at DESC LIMIT 100';
    const rows = await q(sql, params);
    res.json({
      users: rows.map((row) => ({
        ...row,
        online: isOnline(row.id as string),
      })),
    });
  })
);

router.post(
  '/users/:id/ban',
  requireRole('superadmin', 'moderator'),
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || 'Policy violation').slice(0, 200);
    const user = await one<{ id: string }>(
      `UPDATE users SET is_banned = true, ban_reason = $2 WHERE id = $1 RETURNING id`,
      [req.params.id, reason]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    const activeCallId = activeCallFor(user.id);
    if (activeCallId) await endCall(activeCallId, null, 'user_banned');
    await notify(user.id, 'account_banned', 'تم إيقاف حسابك', reason, { reason });
    res.json({ banned: true });
  })
);

router.post(
  '/users/:id/unban',
  requireRole('superadmin', 'moderator'),
  asyncHandler(async (req, res) => {
    const user = await one(
      `UPDATE users SET is_banned = false, ban_reason = NULL WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    await notify(user.id, 'account_unbanned', 'تم إعادة تفعيل حسابك', '', {});
    res.json({ banned: false });
  })
);

router.post(
  '/users/:id/coins',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const amount = Math.trunc(Number(req.body?.amount || 0));
    const note = String(req.body?.note || 'Admin adjustment').slice(0, 200);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new HttpError(400, 'Enter a non-zero amount', 'invalid_amount');
    }
    const admin = reqAdmin(req);
    const result = await tx(async (c) => {
      const moved = await moveCoins(c, {
        userId: req.params.id,
        amount,
        type: 'admin_adjust',
        refType: 'admin',
        refId: crypto.randomUUID(),
        meta: { note, adminId: admin.id },
      });
      return moved;
    });
    emitToUser(req.params.id, 'wallet:update', { balance: result.balanceAfter });
    await notify(
      req.params.id,
      amount > 0 ? 'coins_added' : 'coins_removed',
      amount > 0 ? 'أضيف رصيد إلى محفظتك' : 'تم خصم رصيد من محفظتك',
      `${Math.abs(amount)} كونز — ${note}`,
      { amount }
    );
    res.json({ balance: result.balanceAfter });
  })
);

/** Adjusts a user's GOLD balance. Money roles only. */
router.post(
  '/users/:id/gold',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const amount = Math.trunc(Number(req.body?.amount || 0));
    const note = String(req.body?.note || 'Admin adjustment').slice(0, 200);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new HttpError(400, 'Enter a non-zero amount', 'invalid_amount');
    }
    const admin = reqAdmin(req);
    const result = await tx((c) =>
      moveGold(c, {
        userId: req.params.id,
        amount,
        type: 'admin_adjust',
        refType: 'admin',
        refId: crypto.randomUUID(),
        meta: { note, adminId: admin.id },
      })
    );
    emitToUser(req.params.id, 'wallet:update', {});
    await notify(
      req.params.id,
      amount > 0 ? 'gold_added' : 'gold_removed',
      amount > 0 ? 'أضيف ذهب إلى محفظتك' : 'تم خصم ذهب من محفظتك',
      `${Math.abs(amount)} ذهب — ${note}`,
      { amount }
    );
    res.json({ gold: result.balanceAfter });
  })
);

/** Adjusts a user's BEANS (withdrawable earnings). Money roles only. */
router.post(
  '/users/:id/beans',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const amount = Math.trunc(Number(req.body?.amount || 0));
    const note = String(req.body?.note || 'Admin adjustment').slice(0, 200);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new HttpError(400, 'Enter a non-zero amount', 'invalid_amount');
    }
    const admin = reqAdmin(req);
    const result = await tx((c) =>
      moveProfit(c, {
        userId: req.params.id,
        type: 'admin_adjust',
        amount,
        earned: amount > 0 ? amount : 0,
        refType: 'admin',
        refId: crypto.randomUUID(),
        meta: { note, adminId: admin.id },
      })
    );
    emitToUser(req.params.id, 'profit:update', {});
    await notify(
      req.params.id,
      amount > 0 ? 'beans_added' : 'beans_removed',
      amount > 0 ? 'أضيفت فاصوليا إلى أرباحك' : 'تم خصم فاصوليا من أرباحك',
      `${Math.abs(amount)} فاصوليا — ${note}`,
      { amount }
    );
    res.json({ available: result.available });
  })
);

// Send a user their own 6-digit account ID as an in-app notification.
router.post(
  '/users/:id/send-id',
  asyncHandler(async (req, res) => {
    const user = await one<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE id = $1 AND is_bot = false',
      [req.params.id]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    await notify(
      user.id,
      'account_id',
      'آي دي حسابك',
      `آي دي حسابك في يلا فون هو ${user.username} — استخدمه لتسجيل الدخول`,
      { code: user.username }
    );
    res.json({ code: user.username });
  })
);

// Admin sets any account ID manually.
router.post(
  '/users/:id/set-id',
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{1,12}$/.test(code)) {
      throw new HttpError(400, 'الآي دي يجب أن يكون أرقاماً فقط (حتى 12 رقماً)', 'invalid_code');
    }
    const user = await one<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE id = $1 AND is_bot = false',
      [req.params.id]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    const taken = await one<{ id: string }>('SELECT id FROM users WHERE username = $1 AND id <> $2', [
      code,
      user.id,
    ]);
    if (taken) throw new HttpError(409, 'هذا الآي دي مستخدم من حساب آخر', 'code_taken');
    await q('UPDATE users SET username = $2 WHERE id = $1', [user.id, code]);
    // The room's public ID follows the owner's account ID, except pinned room IDs.
    await q('UPDATE rooms SET code = $2 WHERE COALESCE(owner_id, created_by) = $1 AND code_pinned = false', [
      user.id,
      code,
    ]);
    await notify(
      user.id,
      'account_id',
      'آي دي حسابك',
      `تم تحديث آي دي حسابك في يلا فون إلى ${code} — استخدمه لتسجيل الدخول`,
      { code }
    );
    res.json({ code });
  })
);

router.get(
  '/calls',
  asyncHandler(async (req, res) => {
    const kind = String(req.query.kind || 'all');
    const status = String(req.query.status || 'all');
    const params: unknown[] = [];
    let sql = `
      SELECT c.id, c.kind, c.status, c.is_free, c.rate_per_minute, c.coins_charged,
             c.coins_refunded, c.duration_seconds, c.created_at, c.accepted_at, c.ended_at,
             c.end_reason, caller.display_name AS caller_name, caller.username AS caller_username,
             callee.display_name AS callee_name, callee.username AS callee_username
      FROM calls c
      JOIN users caller ON caller.id = c.caller_id
      JOIN users callee ON callee.id = c.callee_id
      WHERE 1 = 1`;
    if (kind === 'voice' || kind === 'video') {
      params.push(kind);
      sql += ` AND c.kind = $${params.length}`;
    }
    if (status !== 'all') {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }
    sql += ' ORDER BY c.created_at DESC LIMIT 100';
    const rows = await q(sql, params);
    res.json({ calls: rows });
  })
);

/** Money-related settings only a general manager or an accountant may change. */
const FINANCIAL_SETTING_KEYS = [
  'beans_per_usd',
  'bean_to_iqd_rate',
  'min_withdrawal_beans',
  'max_withdrawal_beans',
  'withdrawal_fee_percent',
  'withdrawal_methods',
  'gold_gifts_enabled',
  'lucky_gift_price',
  'lucky_gift_prizes',
  'gift_recipient_percent',
  'gift_host_percent',
  'gift_admin_percent',
  'min_withdrawal_coins',
  'coin_to_iqd_rate',
  'coin_to_usd_rate',
] as const;

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings(true) });
  })
);

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const body: Record<string, unknown> = { ...(req.body ?? {}) };
    // A moderator manages operations, never the economy.
    if (admin.role === 'moderator') {
      for (const key of FINANCIAL_SETTING_KEYS) delete body[key];
    }
    const settings = await updateSettings(body);
    res.json({ settings });
  })
);

/** Economy settings (rates, fees, limits, payout channels, profit shares). */
router.put(
  '/finance/settings',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const key of FINANCIAL_SETTING_KEYS) {
      if (key in (req.body ?? {})) patch[key] = (req.body as Record<string, unknown>)[key];
    }
    res.json({ settings: await updateSettings(patch) });
  })
);

/** Live totals of the three currencies, gift revenue and payout workload. */
router.get(
  '/finance/overview',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (_req, res) => {
    const totals = await one<Record<string, string>>(
      `SELECT
         (SELECT COALESCE(SUM(balance), 0)::text FROM wallets) AS diamonds,
         (SELECT COALESCE(SUM(gold), 0)::text FROM wallets) AS gold,
         (SELECT COALESCE(SUM(available), 0)::text FROM profit_wallets) AS beans_available,
         (SELECT COALESCE(SUM(pending), 0)::text FROM profit_wallets) AS beans_pending,
         (SELECT COALESCE(SUM(withdrawn), 0)::text FROM profit_wallets) AS beans_withdrawn,
         (SELECT COALESCE(SUM(total_earned), 0)::text FROM profit_wallets) AS beans_earned,
         (SELECT COALESCE(SUM(coins), 0)::text FROM gift_sends WHERE currency = 'diamond') AS gift_diamonds,
         (SELECT COALESCE(SUM(coins), 0)::text FROM gift_sends WHERE currency = 'gold') AS gift_gold,
         (SELECT count(*)::text FROM withdrawal_requests WHERE status = 'pending') AS pending_payouts,
         (SELECT COALESCE(SUM(net_amount), 0)::text FROM withdrawal_requests WHERE status = 'paid') AS paid_payouts`
    );
    const byStatus = await q(
      `SELECT status, count(*)::int AS count, COALESCE(SUM(net_amount), 0)::text AS net
       FROM withdrawal_requests GROUP BY status`
    );
    res.json({
      totals: {
        diamonds: Number(totals?.diamonds || 0),
        gold: Number(totals?.gold || 0),
        beansAvailable: Number(totals?.beans_available || 0),
        beansPending: Number(totals?.beans_pending || 0),
        beansWithdrawn: Number(totals?.beans_withdrawn || 0),
        beansEarned: Number(totals?.beans_earned || 0),
        giftDiamonds: Number(totals?.gift_diamonds || 0),
        giftGold: Number(totals?.gift_gold || 0),
        pendingPayouts: Number(totals?.pending_payouts || 0),
        paidPayouts: Number(totals?.paid_payouts || 0),
      },
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: Number(row.count),
        net: Number(row.net),
      })),
    });
  })
);

const ADMIN_ROLES = ['superadmin', 'moderator', 'accountant'] as const;

/** Staff accounts and their permissions (general manager only). */
router.get(
  '/staff',
  requireRole('superadmin'),
  asyncHandler(async (_req, res) => {
    const staff = await q(
      `SELECT id, username, display_name, role, is_active, created_at, last_login_at
       FROM admin_users ORDER BY created_at`
    );
    res.json({
      staff: staff.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      })),
    });
  })
);

router.post(
  '/staff',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || username).trim().slice(0, 60);
    const role = String(req.body?.role || 'moderator');
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      throw new HttpError(400, 'Enter a valid username', 'invalid_username');
    }
    if (password.length < 6) {
      throw new HttpError(400, 'Password must be at least 6 characters', 'weak_password');
    }
    if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
      throw new HttpError(400, 'Unknown role', 'invalid_role');
    }
    const exists = await one('SELECT 1 FROM admin_users WHERE username = $1', [username]);
    if (exists) throw new HttpError(409, 'This username already exists', 'username_taken');
    const hash = await bcrypt.hash(password, 10);
    const row = await one(
      `INSERT INTO admin_users (username, display_name, password_hash, role, password_source)
       VALUES ($1, $2, $3, $4, 'custom') RETURNING id, username, display_name, role, is_active`,
      [username, displayName, hash, role]
    );
    res.status(201).json({ staff: row });
  })
);

router.patch(
  '/staff/:id',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const target = await one<{ id: string; role: string; is_active: boolean }>(
      'SELECT id, role, is_active FROM admin_users WHERE id = $1',
      [req.params.id]
    );
    if (!target) throw new HttpError(404, 'Staff account not found', 'staff_not_found');

    const role = req.body?.role === undefined ? target.role : String(req.body.role);
    if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
      throw new HttpError(400, 'Unknown role', 'invalid_role');
    }
    const isActive =
      req.body?.isActive === undefined ? target.is_active : Boolean(req.body.isActive);
    if ((!isActive || role !== 'superadmin') && target.role === 'superadmin') {
      const others = await one<{ count: string }>(
        `SELECT count(*)::text AS count FROM admin_users
         WHERE role = 'superadmin' AND is_active = true AND id <> $1`,
        [target.id]
      );
      if (Number(others?.count || 0) === 0) {
        throw new HttpError(
          400,
          'There must always be at least one active general manager',
          'last_superadmin'
        );
      }
    }

    const password = String(req.body?.password || '');
    if (password && password.length < 6) {
      throw new HttpError(400, 'Password must be at least 6 characters', 'weak_password');
    }
    const row = await one(
      `UPDATE admin_users SET
         role = $2,
         is_active = $3,
         display_name = COALESCE(NULLIF($4::text, ''), display_name),
         password_hash = CASE WHEN $5::text = '' THEN password_hash ELSE $5::text END,
         password_source = CASE WHEN $5::text = '' THEN password_source ELSE 'custom' END
       WHERE id = $1
       RETURNING id, username, display_name, role, is_active`,
      [
        target.id,
        role,
        isActive,
        String(req.body?.displayName || '').trim().slice(0, 60),
        password ? await bcrypt.hash(password, 10) : '',
      ]
    );
    res.json({ staff: row });
  })
);

router.delete(
  '/staff/:id',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const target = await one<{ id: string; role: string }>(
      'SELECT id, role FROM admin_users WHERE id = $1',
      [req.params.id]
    );
    if (!target) throw new HttpError(404, 'Staff account not found', 'staff_not_found');
    if (target.role === 'superadmin') {
      const others = await one<{ count: string }>(
        `SELECT count(*)::text AS count FROM admin_users
         WHERE role = 'superadmin' AND is_active = true AND id <> $1`,
        [target.id]
      );
      if (Number(others?.count || 0) === 0) {
        throw new HttpError(400, 'Cannot delete the last general manager', 'last_superadmin');
      }
    }
    await q('DELETE FROM admin_users WHERE id = $1', [target.id]);
    res.json({ deleted: true });
  })
);

router.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    const rows = await q('SELECT * FROM recharge_packages ORDER BY sort_order, coins');
    res.json({ packages: rows });
  })
);

router.post(
  '/packages',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const coins = Math.trunc(Number(req.body?.coins || 0));
    const bonus = Math.trunc(Number(req.body?.bonusCoins || 0));
    const priceIqd = Math.trunc(Number(req.body?.priceIqd || 0));
    const priceUsd = Math.trunc(Number(req.body?.priceUsdCents || 0));
    if (!name || coins <= 0) throw new HttpError(400, 'Name and coins are required', 'invalid_package');
    const row = await one(
      `INSERT INTO recharge_packages (name, coins, bonus_coins, price_iqd, price_usd_cents, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, coins, bonus, priceIqd, priceUsd, req.body?.isActive !== false, Number(req.body?.sortOrder || 0)]
    );
    res.status(201).json({ package: row });
  })
);

router.put(
  '/packages/:id',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE recharge_packages SET
         name = COALESCE($2, name),
         coins = COALESCE($3, coins),
         bonus_coins = COALESCE($4, bonus_coins),
         price_iqd = COALESCE($5, price_iqd),
         price_usd_cents = COALESCE($6, price_usd_cents),
         is_active = COALESCE($7, is_active),
         sort_order = COALESCE($8, sort_order)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        req.body?.name ?? null,
        req.body?.coins !== undefined ? Math.trunc(Number(req.body.coins)) : null,
        req.body?.bonusCoins !== undefined ? Math.trunc(Number(req.body.bonusCoins)) : null,
        req.body?.priceIqd !== undefined ? Math.trunc(Number(req.body.priceIqd)) : null,
        req.body?.priceUsdCents !== undefined ? Math.trunc(Number(req.body.priceUsdCents)) : null,
        req.body?.isActive ?? null,
        req.body?.sortOrder !== undefined ? Math.trunc(Number(req.body.sortOrder)) : null,
      ]
    );
    if (!row) throw new HttpError(404, 'Package not found', 'package_not_found');
    res.json({ package: row });
  })
);

router.delete(
  '/packages/:id',
  asyncHandler(async (req, res) => {
    await q('UPDATE recharge_packages SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'all');
    const params: unknown[] = [];
    let sql = `
      SELECT o.*, u.display_name AS user_name, u.username AS user_username, p.name AS package_name
      FROM payment_orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN recharge_packages p ON p.id = o.package_id
      WHERE 1 = 1`;
    if (status !== 'all') {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }
    sql += ' ORDER BY o.created_at DESC LIMIT 100';
    const rows = await q(sql, params);
    res.json({ orders: rows });
  })
);

router.post(
  '/orders/:id/confirm',
  asyncHandler(async (req, res) => {
    const result = await confirmOrder(
      req.params.id,
      req.body?.providerRef ? String(req.body.providerRef) : null,
      `admin:${reqAdmin(req).username}`
    );
    if (result.credited) {
      emitToUser(result.order.user_id, 'wallet:update', { balance: result.balanceAfter });
      await notify(
        result.order.user_id,
        'recharge_confirmed',
        'تم شحن الكونز',
        `أضيف ${result.order.coins} كونز إلى محفظتك`,
        { coins: result.order.coins, orderId: result.order.id }
      );
    }
    res.json({ order: result.order, credited: result.credited });
  })
);

router.post(
  '/orders/:id/reject',
  asyncHandler(async (req, res) => {
    const order = await one<{ id: string; user_id: string }>(
      `UPDATE payment_orders SET status = 'failed', note = COALESCE(note, '') || ' | rejected by admin'
       WHERE id = $1 AND status = 'pending' RETURNING id, user_id`,
      [req.params.id]
    );
    if (!order) throw new HttpError(404, 'Pending order not found', 'order_not_found');
    await notify(order.user_id, 'recharge_failed', 'لم يتم تأكيد الدفع', 'تم رفض طلب الشحن', {
      orderId: order.id,
    });
    res.json({ ok: true });
  })
);

router.get(
  '/earnings',
  asyncHandler(async (_req, res) => {
    const admin = await one<{ total: string; today: string }>(
      `SELECT COALESCE(SUM(coins), 0)::text AS total,
              COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date THEN coins ELSE 0 END), 0)::text AS today
       FROM admin_earnings`,
      [iraqDateStr()]
    );
    const rows = await q(
      `SELECT a.id, a.coins, a.percent, a.created_at, c.kind, c.duration_seconds, c.coins_charged,
              caller.display_name AS caller_name, callee.display_name AS callee_name
       FROM admin_earnings a
       JOIN calls c ON c.id = a.call_id
       JOIN users caller ON caller.id = c.caller_id
       JOIN users callee ON callee.id = c.callee_id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    const topHosts = await q(
      `SELECT u.id, u.display_name, u.username, COALESCE(SUM(e.coins), 0)::int AS coins
       FROM earnings e JOIN users u ON u.id = e.user_id
       GROUP BY u.id, u.display_name, u.username
       ORDER BY coins DESC LIMIT 10`
    );
    res.json({
      total: Number(admin?.total || 0),
      today: Number(admin?.today || 0),
      entries: rows,
      topHosts,
    });
  })
);

router.get(
  '/withdrawals',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (_req, res) => {
    const rows = await q(
      `SELECT w.*, u.display_name AS user_name, u.username AS user_username
       FROM withdrawal_requests w JOIN users u ON u.id = w.user_id
       ORDER BY w.created_at DESC LIMIT 100`
    );
    res.json({ withdrawals: rows });
  })
);

router.post(
  '/withdrawals/:id/approve',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const row = await one<{ id: string; user_id: string; coins: number }>(
      `UPDATE withdrawal_requests
       SET status = 'approved', processed_at = now(), reviewed_by = $2, reviewed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING id, user_id, coins`,
      [req.params.id, admin.id]
    );
    if (!row) throw new HttpError(404, 'Pending withdrawal not found', 'withdrawal_not_found');
    await notify(
      row.user_id,
      'withdrawal_approved',
      'تمت الموافقة على السحب',
      `تمت مراجعة طلب ${row.coins} فاصوليا — سيُحوَّل المبلغ بعد تنفيذ الدفع`,
      { beans: row.coins }
    );
    res.json({ ok: true });
  })
);

router.post(
  '/withdrawals/:id/paid',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const transferRef = String(req.body?.transferRef || '').trim().slice(0, 120);
    const proofUrl = String(req.body?.proofUrl || '').trim().slice(0, 500);
    if (transferRef.length < 3) {
      throw new HttpError(400, 'Enter the transfer reference', 'missing_transfer_ref');
    }
    const result = await tx(async (c) => {
      const { rows } = await c.query<{
        id: string;
        user_id: string;
        coins: number;
        source: string;
        amount: string;
        currency: string;
        net_amount: string;
      }>(
        `UPDATE withdrawal_requests
         SET status = 'paid', processed_at = now(),
             note = COALESCE(NULLIF($2::text, ''), note),
             transfer_ref = $3, proof_url = NULLIF($4::text, ''),
             reviewed_by = $5, reviewed_at = now()
         WHERE id = $1 AND status = 'approved' RETURNING *`,
        [req.params.id, String(req.body?.note || '').slice(0, 200), transferRef, proofUrl, admin.id]
      );
      const row = rows[0];
      if (!row) throw new HttpError(404, 'Approved withdrawal not found', 'withdrawal_not_found');
      if (row.source === 'profit') {
        await moveProfit(c, {
          userId: row.user_id,
          type: 'withdrawal_paid',
          amount: 0,
          hold: -Number(row.coins),
          settle: Number(row.coins),
          refType: 'withdrawal_request',
          refId: row.id,
          meta: { amount: Number(row.amount), currency: row.currency },
        });
      }
      return row;
    });
    emitToUser(result.user_id, 'profit:update', {});
    const paid = Number(result.net_amount || result.amount);
    await notify(
      result.user_id,
      'withdrawal_paid',
      'تم دفع السحب',
      `تم تحويل ${paid} ${result.currency} — ${result.coins} فاصوليا (رقم التحويل ${transferRef})`,
      {
        beans: result.coins,
        amount: paid,
        currency: result.currency,
        transferRef,
        proofUrl: proofUrl || null,
      }
    );
    res.json({ ok: true });
  })
);

router.post(
  '/withdrawals/:id/reject',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const reason = String(req.body?.reason || req.body?.note || '').trim().slice(0, 300);
    if (reason.length < 3) {
      throw new HttpError(400, 'Enter the rejection reason', 'missing_reason');
    }
    const result = await tx(async (c) => {
      const { rows } = await c.query<{
        id: string;
        user_id: string;
        coins: number;
        source: string;
      }>(
        `UPDATE withdrawal_requests
         SET status = 'rejected', processed_at = now(), note = $2::text,
             reject_reason = $2::text, reviewed_by = $3, reviewed_at = now()
         WHERE id = $1 AND status = 'pending' RETURNING id, user_id, coins, source`,
        [req.params.id, reason, admin.id]
      );
      if (!rows[0]) throw new HttpError(404, 'Pending withdrawal not found', 'withdrawal_not_found');
      const row = rows[0];
      if (row.source === 'profit') {
        await moveProfit(c, {
          userId: row.user_id,
          type: 'withdrawal_refund',
          amount: Number(row.coins),
          hold: -Number(row.coins),
          refType: 'withdrawal_request',
          refId: row.id,
          meta: { reason: 'rejected' },
        });
        return { withdrawal: row, balance: null };
      }
      const moved = await moveCoins(c, {
        userId: row.user_id,
        amount: row.coins,
        type: 'withdrawal_refund',
        refType: 'withdrawal_request',
        refId: row.id,
        meta: { reason: 'rejected' },
      });
      return { withdrawal: row, balance: moved.balanceAfter };
    });
    emitToUser(result.withdrawal.user_id, 'wallet:update', { balance: result.balance });
    emitToUser(result.withdrawal.user_id, 'profit:update', {});
    await notify(
      result.withdrawal.user_id,
      'withdrawal_rejected',
      'تم رفض طلب السحب',
      `أُعيد المبلغ إلى أرباحك — السبب: ${reason}`,
      { beans: result.withdrawal.coins, reason }
    );
    res.json({ ok: true, balance: result.balance });
  })
);

router.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const rows = await q(
      `SELECT r.*, reporter.display_name AS reporter_name, target.display_name AS target_name,
              target.username AS target_username
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users target ON target.id = r.target_id
       ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 100`
    );
    res.json({ reports: rows });
  })
);

router.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE reports SET status = 'resolved', resolved_at = now() WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'Report not found', 'report_not_found');
    res.json({ ok: true });
  })
);

router.post(
  '/notifications/broadcast',
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').slice(0, 500);
    if (!title) throw new HttpError(400, 'Title is required', 'missing_title');
    const users = await q<{ id: string }>('SELECT id FROM users WHERE is_banned = false');
    for (const user of users) {
      await notify(user.id, 'admin_broadcast', title, body, {});
    }
    res.json({ sent: users.length });
  })
);

router.get(
  '/free-calls',
  asyncHandler(async (req, res) => {
    const today = iraqDateStr();
    const settings = await getSettings(true);
    const usage = await q(
      `SELECT u.id, u.display_name, u.username,
              COALESCE(d.attempts_used, 0)::int AS used,
              COALESCE(d.voice_used, 0)::int AS voice_used,
              COALESCE(d.video_used, 0)::int AS video_used,
              (SELECT count(*)::int FROM calls c WHERE c.caller_id = u.id AND c.is_free = true) AS free_calls_total,
              (SELECT COALESCE(SUM(e.coins), 0)::int FROM earnings e WHERE e.user_id = u.id) AS earnings
       FROM users u LEFT JOIN daily_free_calls d ON d.user_id = u.id AND d.usage_date = $1::date
       ORDER BY used DESC, u.created_at DESC LIMIT 100`,
      [today]
    );
    const totals = await one<{ used: string; users: string }>(
      `SELECT COALESCE(SUM(attempts_used), 0)::text AS used, count(*)::text AS users
       FROM daily_free_calls WHERE usage_date = $1::date`,
      [today]
    );
    res.json({
      settings: {
        free_calls_enabled: settings.free_calls_enabled,
        free_calls_per_day: settings.free_calls_per_day,
        free_calls_shared: settings.free_calls_shared,
        free_calls_exempt_user_ids: settings.free_calls_exempt_user_ids,
      },
      usage,
      totals: { used: Number(totals?.used || 0), users: Number(totals?.users || 0) },
      today,
      nextResetAt: nextIraqMidnight().toISOString(),
    });
  })
);

router.get(
  '/financial',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || 'day');
    const series = await q(
      period === 'month'
        ? `SELECT to_char(d, 'YYYY-MM') AS bucket,
             (SELECT count(*)::int FROM calls c WHERE date_trunc('month', (c.created_at AT TIME ZONE 'Asia/Baghdad')) = date_trunc('month', d)) AS calls,
             (SELECT COALESCE(SUM(c.coins_charged), 0)::int FROM calls c WHERE date_trunc('month', (c.created_at AT TIME ZONE 'Asia/Baghdad')) = date_trunc('month', d)) AS coins_charged,
             (SELECT COALESCE(SUM(e.coins), 0)::int FROM earnings e WHERE date_trunc('month', (e.created_at AT TIME ZONE 'Asia/Baghdad')) = date_trunc('month', d)) AS host_earnings,
             (SELECT COALESCE(SUM(a.coins), 0)::int FROM admin_earnings a WHERE date_trunc('month', (a.created_at AT TIME ZONE 'Asia/Baghdad')) = date_trunc('month', d)) AS admin_earnings,
             (SELECT COALESCE(SUM(o.amount), 0)::int FROM payment_orders o WHERE o.status = 'paid' AND o.currency = 'IQD' AND date_trunc('month', (o.paid_at AT TIME ZONE 'Asia/Baghdad')) = date_trunc('month', d)) AS recharge_iqd
           FROM generate_series(date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad') - interval '11 months',
                                date_trunc('month', now() AT TIME ZONE 'Asia/Baghdad'), interval '1 month') AS d
           ORDER BY d`
        : `SELECT d::date::text AS bucket,
             (SELECT count(*)::int FROM calls c WHERE (c.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS calls,
             (SELECT COALESCE(SUM(c.coins_charged), 0)::int FROM calls c WHERE (c.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS coins_charged,
             (SELECT COALESCE(SUM(e.coins), 0)::int FROM earnings e WHERE (e.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS host_earnings,
             (SELECT COALESCE(SUM(a.coins), 0)::int FROM admin_earnings a WHERE (a.created_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS admin_earnings,
             (SELECT COALESCE(SUM(o.amount), 0)::int FROM payment_orders o WHERE o.status = 'paid' AND o.currency = 'IQD' AND (o.paid_at AT TIME ZONE 'Asia/Baghdad')::date = d::date) AS recharge_iqd
           FROM generate_series($1::date - 29, $1::date, interval '1 day') AS d
           ORDER BY d`,
      period === 'month' ? [] : [iraqDateStr()]
    );
    const totals = await one(
      `SELECT
        (SELECT COALESCE(SUM(coins_charged), 0)::int FROM calls) AS coins_charged,
        (SELECT COALESCE(SUM(coins), 0)::int FROM admin_earnings) AS admin_earnings,
        (SELECT COALESCE(SUM(coins), 0)::int FROM earnings) AS host_earnings,
        (SELECT COALESCE(SUM(amount), 0)::int FROM payment_orders WHERE status = 'paid' AND currency = 'IQD') AS recharge_iqd,
        (SELECT COALESCE(SUM(coins), 0)::int FROM withdrawal_requests WHERE status IN ('pending', 'approved')) AS withdrawals_coins`
    );
    res.json({ period, series, totals });
  })
);

router.get(
  '/reports-summary',
  asyncHandler(async (_req, res) => {
    const rows = await q(
      `SELECT (created_at AT TIME ZONE 'Asia/Baghdad')::date::text AS day,
              count(*)::int AS calls,
              COALESCE(SUM(coins_charged), 0)::int AS coins
       FROM calls
       WHERE created_at > now() - interval '30 days'
       GROUP BY 1 ORDER BY 1`
    );
    res.json({ summary: rows });
  })
);

const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Unambiguous 10-character code, shown to the user as XXXXX-XXXXX. */
function makeGiftCode(): string {
  let raw = '';
  for (let index = 0; index < 10; index += 1) {
    raw += GIFT_ALPHABET[crypto.randomInt(GIFT_ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

router.get(
  '/gift-codes',
  asyncHandler(async (_req, res) => {
    const rows = await q(
      `SELECT g.id, g.code, g.coins, g.max_uses, g.used_count, g.note, g.expires_at,
              g.is_active, g.created_at,
              (SELECT count(*)::int FROM gift_code_redemptions r WHERE r.gift_code_id = g.id) AS redemptions
       FROM gift_codes g ORDER BY g.created_at DESC LIMIT 200`
    );
    res.json({ codes: rows });
  })
);

router.post(
  '/gift-codes',
  asyncHandler(async (req, res) => {
    const coins = Math.trunc(Number(req.body?.coins || 0));
    const count = Math.min(50, Math.max(1, Math.trunc(Number(req.body?.count || 1))));
    const maxUses = Math.min(1000, Math.max(1, Math.trunc(Number(req.body?.maxUses || 1))));
    const note = String(req.body?.note || '').slice(0, 200);
    const expiresAt = req.body?.expiresAt ? new Date(String(req.body.expiresAt)) : null;
    if (!Number.isFinite(coins) || coins <= 0) {
      throw new HttpError(400, 'Coins must be a positive number', 'invalid_amount');
    }
    if (coins > 1_000_000) throw new HttpError(400, 'Coins amount is too large', 'invalid_amount');
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new HttpError(400, 'Invalid expiry date', 'invalid_expiry');
    }

    const admin = reqAdmin(req);
    const created = await tx(async (c) => {
      const rows: Record<string, unknown>[] = [];
      for (let index = 0; index < count; index += 1) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const inserted = await c.query(
            `INSERT INTO gift_codes (code, coins, max_uses, note, expires_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (code) DO NOTHING
             RETURNING id, code, coins, max_uses, used_count, note, expires_at, is_active, created_at`,
            [makeGiftCode(), coins, maxUses, note, expiresAt, admin.id]
          );
          if (inserted.rowCount) {
            rows.push(inserted.rows[0]);
            break;
          }
        }
      }
      return rows;
    });
    res.status(201).json({ codes: created });
  })
);

router.patch(
  '/gift-codes/:id',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE gift_codes SET is_active = COALESCE($2, is_active) WHERE id = $1
       RETURNING id, code, is_active`,
      [req.params.id, typeof req.body?.isActive === 'boolean' ? req.body.isActive : null]
    );
    if (!row) throw new HttpError(404, 'Gift code not found', 'code_not_found');
    res.json({ code: row });
  })
);

// ------------------------------------------------------------ avatar frames
function readFrameBody(body: Record<string, unknown>): Partial<FrameRow> {
  const out: Partial<FrameRow> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Frame name is required', 'invalid_frame');
    out.name = name;
  }
  if (body.nameEn !== undefined) out.name_en = String(body.nameEn).trim().slice(0, 60);
  if (body.kind !== undefined) {
    const kind = String(body.kind);
    if (kind !== 'design' && kind !== 'image') throw new HttpError(400, 'Invalid frame kind', 'invalid_frame');
    out.kind = kind;
  }
  if (body.design !== undefined) {
    const design = String(body.design).trim();
    if (design && !/^[a-z0-9-]{2,40}$/.test(design)) throw new HttpError(400, 'Invalid design key', 'invalid_frame');
    out.design = design || null;
  }
  if (body.imageUrl !== undefined) out.image_url = String(body.imageUrl).trim().slice(0, 500) || null;
  if (body.category !== undefined) {
    const category = String(body.category);
    if (!['frame', 'id', 'namecard', 'bubble', 'entry'].includes(category)) {
      throw new HttpError(400, 'Invalid store section', 'invalid_frame');
    }
    out.category = category;
  }
  if (body.price !== undefined) {
    const price = Math.round(Number(body.price));
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Invalid frame price', 'invalid_frame');
    out.price = price;
  }
  if (body.rarity !== undefined) {
    const rarity = String(body.rarity);
    if (!(FRAME_RARITIES as readonly string[]).includes(rarity)) {
      throw new HttpError(400, 'Invalid frame rarity', 'invalid_frame');
    }
    out.rarity = rarity;
  }
  if (body.durationDays !== undefined) {
    const days = Math.round(Number(body.durationDays));
    if (!Number.isFinite(days) || days < 0) throw new HttpError(400, 'Invalid frame duration', 'invalid_frame');
    out.duration_days = days;
  }
  if (body.isRare !== undefined) out.is_rare = Boolean(body.isRare);
  if (body.isActive !== undefined) out.is_active = Boolean(body.isActive);
  if (body.sortOrder !== undefined) out.sort_order = Math.round(Number(body.sortOrder)) || 0;
  if (body.minVip !== undefined) {
    const minVip = Math.round(Number(body.minVip));
    if (!Number.isFinite(minVip) || minVip < 0 || minVip > 5) {
      throw new HttpError(400, 'Invalid VIP tier', 'invalid_frame');
    }
    out.min_vip = minVip;
  }
  return out;
}

router.get(
  '/frames',
  asyncHandler(async (_req, res) => {
    const rows = await q<FrameRow & { owners: number; equipped: number }>(
      `SELECT f.*,
        (SELECT count(*)::int FROM user_avatar_frames uaf
          WHERE uaf.frame_id = f.id AND (uaf.expires_at IS NULL OR uaf.expires_at > now())) AS owners,
        CASE WHEN f.category = 'frame'
          THEN (SELECT count(*)::int FROM users u WHERE u.avatar_frame_id = f.id)
          ELSE (SELECT count(*)::int FROM user_cosmetics uc WHERE uc.item_id = f.id)
        END AS equipped
       FROM avatar_frames f ORDER BY f.category, f.sort_order, f.created_at`
    );
    res.json({
      frames: rows.map((row) => ({ ...serializeFrame(row), owners: row.owners, equippedCount: row.equipped })),
    });
  })
);

router.post(
  '/frames/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
  })
);

router.post(
  '/frames',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields = readFrameBody(body);
    const name = fields.name ?? '';
    if (!name) throw new HttpError(400, 'Frame name is required', 'invalid_frame');
    const kind = fields.kind ?? 'design';
    if (kind === 'design' && !fields.design) throw new HttpError(400, 'Design key is required', 'invalid_frame');
    if (kind === 'image' && !fields.image_url) throw new HttpError(400, 'Image URL is required', 'invalid_frame');
    const slug =
      String(body.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 40) || `custom-${crypto.randomBytes(3).toString('hex')}`;

    const created = await one<FrameRow>(
      `INSERT INTO avatar_frames
        (slug, name, name_en, kind, design, image_url, price, rarity, duration_days, is_rare, is_active, sort_order, category, min_vip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [
        slug,
        name,
        fields.name_en || name,
        kind,
        fields.design ?? null,
        fields.image_url ?? null,
        fields.price ?? 0,
        fields.rarity ?? 'common',
        fields.duration_days ?? 0,
        fields.is_rare ?? false,
        fields.is_active ?? true,
        fields.sort_order ?? 0,
        fields.category ?? 'frame',
        fields.min_vip ?? 0,
      ]
    );
    if (!created) throw new HttpError(409, 'A frame with this slug already exists', 'frame_slug_taken');
    res.status(201).json({ frame: serializeFrame(created) });
  })
);

router.patch(
  '/frames/:id',
  asyncHandler(async (req, res) => {
    const existing = await one<FrameRow>('SELECT * FROM avatar_frames WHERE id = $1', [req.params.id]);
    if (!existing) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    const fields = readFrameBody((req.body ?? {}) as Record<string, unknown>);
    const merged = { ...existing, ...fields };
    if (merged.kind === 'design' && !merged.design) {
      throw new HttpError(400, 'Design key is required', 'invalid_frame');
    }
    if (merged.kind === 'image' && !merged.image_url) {
      throw new HttpError(400, 'Image URL is required', 'invalid_frame');
    }
    const updated = await one<FrameRow>(
      `UPDATE avatar_frames SET name = $2, name_en = $3, kind = $4, design = $5, image_url = $6,
         price = $7, rarity = $8, duration_days = $9, is_rare = $10, is_active = $11, sort_order = $12,
         category = $13, min_vip = $14
       WHERE id = $1 RETURNING *`,
      [
        existing.id,
        merged.name,
        merged.name_en,
        merged.kind,
        merged.design,
        merged.image_url,
        merged.price,
        merged.rarity,
        merged.duration_days,
        merged.is_rare,
        merged.is_active,
        merged.sort_order,
        merged.category,
        merged.min_vip ?? 0,
      ]
    );
    res.json({ frame: updated ? serializeFrame(updated) : null });
  })
);

router.delete(
  '/frames/:id',
  asyncHandler(async (req, res) => {
    const deleted = await one('DELETE FROM avatar_frames WHERE id = $1 RETURNING id', [req.params.id]);
    if (!deleted) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    res.json({ deleted: true });
  })
);

// Grants a design to one user without charging coins (duration still applies).
router.post(
  '/frames/:id/grant',
  asyncHandler(async (req, res) => {
    const frame = await one<FrameRow>('SELECT * FROM avatar_frames WHERE id = $1', [req.params.id]);
    if (!frame) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    const target = String(req.body?.user || '').trim();
    if (!target) throw new HttpError(400, 'Enter a user ID', 'invalid_user');
    const user = await one<{ id: string }>(
      `SELECT id FROM users WHERE is_bot = false AND (id::text = $1 OR username = $1) LIMIT 1`,
      [target]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    const expiresAt =
      Number(frame.duration_days) > 0
        ? new Date(Date.now() + Number(frame.duration_days) * 86_400_000)
        : null;
    await q(
      `INSERT INTO user_avatar_frames (user_id, frame_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, frame_id)
       DO UPDATE SET expires_at = EXCLUDED.expires_at, acquired_at = now()`,
      [user.id, frame.id, expiresAt]
    );
    await notify(user.id, 'cosmetic_granted', 'تصميم جديد', `تم منحك "${frame.name}" في يلا فون`, {
      frameId: frame.id,
    });
    res.json({ granted: true, userId: user.id });
  })
);

// ------------------------------------------------------------- premium IDs
function readPremiumCode(value: unknown): string {
  const code = String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(code)) {
    throw new HttpError(400, 'الآي دي يجب أن يكون أرقاماً فقط (حتى 12 رقماً)', 'invalid_code');
  }
  return code;
}

router.get(
  '/premium-ids',
  asyncHandler(async (_req, res) => {
    const rows = await q<{
      id: string;
      code: string;
      price: number;
      is_sold: boolean;
      sold_at: string | null;
      owner_name: string | null;
    }>(
      `SELECT p.id, p.code, p.price, p.is_sold, p.sold_at, u.display_name AS owner_name
       FROM premium_ids p LEFT JOIN users u ON u.id = p.sold_to
       ORDER BY p.is_sold, p.price, p.code`
    );
    res.json({
      ids: rows.map((row) => ({
        id: row.id,
        code: row.code,
        price: Number(row.price),
        isSold: row.is_sold,
        soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null,
        ownerName: row.owner_name,
      })),
    });
  })
);

router.post(
  '/premium-ids',
  asyncHandler(async (req, res) => {
    const code = readPremiumCode(req.body?.code);
    const price = Math.round(Number(req.body?.price ?? 0));
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'سعر غير صالح', 'invalid_price');
    }
    const used = await one('SELECT 1 FROM users WHERE username = $1', [code]);
    if (used) throw new HttpError(409, 'هذا الرقم مستخدم كآي دي لحساب', 'code_taken');
    const created = await one<{ id: string }>(
      `INSERT INTO premium_ids (code, price) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING RETURNING id`,
      [code, price]
    );
    if (!created) throw new HttpError(409, 'هذا الرقم موجود في المتجر', 'code_exists');
    res.status(201).json({ id: created.id, code, price });
  })
);

router.patch(
  '/premium-ids/:id',
  asyncHandler(async (req, res) => {
    const price = Math.round(Number(req.body?.price ?? 0));
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'سعر غير صالح', 'invalid_price');
    }
    const updated = await one(
      'UPDATE premium_ids SET price = $2 WHERE id = $1 AND is_sold = false RETURNING id',
      [req.params.id, price]
    );
    if (!updated) throw new HttpError(404, 'الرقم غير موجود أو مُباع', 'premium_id_not_found');
    res.json({ ok: true });
  })
);

router.delete(
  '/premium-ids/:id',
  asyncHandler(async (req, res) => {
    const deleted = await one(
      'DELETE FROM premium_ids WHERE id = $1 AND is_sold = false RETURNING id',
      [req.params.id]
    );
    if (!deleted) throw new HttpError(404, 'الرقم غير موجود أو مُباع', 'premium_id_not_found');
    res.json({ deleted: true });
  })
);

// --------------------------------------------------------------------- gifts
function readGiftBody(body: Record<string, unknown>): Partial<GiftRow> {
  const out: Partial<GiftRow> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) throw new HttpError(400, 'Gift name is required', 'invalid_gift');
    out.name = name;
  }
  if (body.nameEn !== undefined) out.name_en = String(body.nameEn).trim().slice(0, 80);
  if (body.description !== undefined) out.description = String(body.description).trim().slice(0, 300);
  if (body.design !== undefined) {
    const design = String(body.design).trim();
    if (design && !/^[a-z0-9-]{2,40}$/.test(design)) {
      throw new HttpError(400, 'Invalid gift design key', 'invalid_gift');
    }
    out.design = design || null;
  }
  if (body.videoUrl !== undefined) out.video_url = String(body.videoUrl).trim().slice(0, 500) || null;
  if (body.coverUrl !== undefined) out.cover_url = String(body.coverUrl).trim().slice(0, 500) || null;
  if (body.price !== undefined) {
    const price = Math.round(Number(body.price));
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'Invalid gift price', 'invalid_gift');
    }
    out.price = price;
  }
  if (body.recipientPercent !== undefined) {
    if (body.recipientPercent === null || body.recipientPercent === '') {
      out.recipient_percent = null;
    } else {
      const percent = Math.round(Number(body.recipientPercent));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new HttpError(400, 'Invalid recipient percent', 'invalid_gift');
      }
      out.recipient_percent = percent;
    }
  }
  if (body.hostPercent !== undefined) {
    if (body.hostPercent === null || body.hostPercent === '') {
      out.host_percent = null;
    } else {
      const percent = Math.round(Number(body.hostPercent));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new HttpError(400, 'Invalid room owner percent', 'invalid_gift');
      }
      out.host_percent = percent;
    }
  }
  if (body.rarity !== undefined) {
    const rarity = String(body.rarity);
    if (!(GIFT_RARITIES as readonly string[]).includes(rarity)) {
      throw new HttpError(400, 'Invalid gift rarity', 'invalid_gift');
    }
    out.rarity = rarity;
  }
  if (body.isActive !== undefined) out.is_active = Boolean(body.isActive);
  if (body.isDaily !== undefined) out.is_daily = Boolean(body.isDaily);
  if (body.sortOrder !== undefined) out.sort_order = Math.round(Number(body.sortOrder)) || 0;
  return out;
}

router.get(
  '/gifts',
  asyncHandler(async (_req, res) => {
    const rows = await q<
      GiftRow & { sends: number; revenue: number; recipient_payout: number; admin_share: number }
    >(
      `SELECT g.*,
        (SELECT count(*)::int FROM gift_sends s WHERE s.gift_id = g.id) AS sends,
        (SELECT COALESCE(SUM(s.coins), 0)::bigint FROM gift_sends s WHERE s.gift_id = g.id) AS revenue,
        (SELECT COALESCE(SUM(s.recipient_coins), 0)::bigint FROM gift_sends s WHERE s.gift_id = g.id) AS recipient_payout,
        (SELECT COALESCE(SUM(s.admin_coins), 0)::bigint FROM gift_sends s WHERE s.gift_id = g.id) AS admin_share
       FROM gifts g ORDER BY g.sort_order, g.created_at`
    );
    res.json({
      gifts: rows.map((row) => ({
        ...serializeGift(row),
        sends: Number(row.sends || 0),
        revenue: Number(row.revenue || 0),
        recipientPayout: Number(row.recipient_payout || 0),
        adminShare: Number(row.admin_share || 0),
      })),
    });
  })
);

router.post(
  '/gifts/upload',
  giftUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    const mime = req.file.mimetype || '';
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mime,
      kind: mime.startsWith('video/') ? 'video' : 'image',
    });
  })
);

router.post(
  '/gifts',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields = readGiftBody(body);
    if (!fields.name) throw new HttpError(400, 'Gift name is required', 'invalid_gift');
    if (!fields.design && !fields.video_url) {
      throw new HttpError(400, 'Choose an animation or upload a video', 'invalid_gift');
    }
    const slug =
      String(body.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50) || `gift-${crypto.randomBytes(3).toString('hex')}`;

    const created = await one<GiftRow>(
      `INSERT INTO gifts
         (slug, name, name_en, description, design, video_url, cover_url, price,
          recipient_percent, rarity, is_active, sort_order, host_percent, is_daily)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [
        slug,
        fields.name,
        fields.name_en || fields.name,
        fields.description || '',
        fields.design ?? null,
        fields.video_url ?? null,
        fields.cover_url ?? null,
        fields.price ?? 0,
        fields.recipient_percent ?? null,
        fields.rarity ?? 'common',
        fields.is_active ?? true,
        fields.sort_order ?? 0,
        fields.host_percent ?? null,
        fields.is_daily ?? false,
      ]
    );
    if (!created) throw new HttpError(409, 'A gift with this slug already exists', 'gift_slug_taken');
    res.status(201).json({ gift: serializeGift(created) });
  })
);

router.patch(
  '/gifts/:id',
  asyncHandler(async (req, res) => {
    const existing = await one<GiftRow>('SELECT * FROM gifts WHERE id = $1', [req.params.id]);
    if (!existing) throw new HttpError(404, 'Gift not found', 'gift_not_found');
    const fields = readGiftBody((req.body ?? {}) as Record<string, unknown>);
    const merged = { ...existing, ...fields };
    if (!merged.design && !merged.video_url) {
      throw new HttpError(400, 'Choose an animation or upload a video', 'invalid_gift');
    }
    const updated = await one<GiftRow>(
      `UPDATE gifts SET
         name = $2, name_en = $3, description = $4, design = $5, video_url = $6,
         cover_url = $7, price = $8, recipient_percent = $9, rarity = $10,
         is_active = $11, sort_order = $12, host_percent = $13, is_daily = $14
       WHERE id = $1 RETURNING *`,
      [
        existing.id,
        merged.name,
        merged.name_en,
        merged.description,
        merged.design,
        merged.video_url,
        merged.cover_url,
        merged.price,
        merged.recipient_percent,
        merged.rarity,
        merged.is_active,
        merged.sort_order,
        merged.host_percent,
        merged.is_daily,
      ]
    );
    res.json({ gift: updated ? serializeGift(updated) : null });
  })
);

router.delete(
  '/gifts/:id',
  asyncHandler(async (req, res) => {
    // Soft delete keeps the financial history of gifts already sent intact.
    const row = await one(
      'UPDATE gifts SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'Gift not found', 'gift_not_found');
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------ gift packages
/**
 * «باقات الهدايا»: admin-defined bundles sold for diamonds in the gift shop.
 * Buying one drops its gift lines into the buyer's bag, and the admin can also
 * grant a package (or a single gift) straight to a user's bag.
 */
function readPackageItems(value: unknown): { giftId: string; quantity: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { giftId: string; quantity: number }[] = [];
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const giftId = String(item.giftId || '');
    const quantity = Math.trunc(Number(item.quantity) || 0);
    if (!isUuid(giftId) || quantity <= 0) continue;
    out.push({ giftId, quantity: Math.min(999, quantity) });
  }
  return out;
}

async function replacePackageItems(
  c: PoolClient,
  packageId: string,
  items: { giftId: string; quantity: number }[]
): Promise<void> {
  await c.query('DELETE FROM gift_package_items WHERE package_id = $1', [packageId]);
  for (const item of items) {
    await c.query(
      'INSERT INTO gift_package_items (package_id, gift_id, quantity) VALUES ($1, $2, $3)',
      [packageId, item.giftId, item.quantity]
    );
  }
}

/** Resolves a user from an ID, 6-digit account code, email or phone. */
async function findBagUser(target: string): Promise<{ id: string; name: string }> {
  const user = await one<{ id: string; display_name: string | null; username: string }>(
    `SELECT id, display_name, username FROM users WHERE is_bot = false
       AND (id::text = $1 OR username = $1 OR lower(email) = lower($1) OR phone = $1)
     LIMIT 1`,
    [target]
  );
  if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
  return { id: user.id, name: user.display_name || user.username };
}

router.get(
  '/gift-packages',
  asyncHandler(async (_req, res) => {
    const [packages, gifts, stats] = await Promise.all([
      listGiftPackages(true),
      q<GiftRow>('SELECT * FROM gifts WHERE is_active = true ORDER BY sort_order, price'),
      q<{ package_id: string; purchases: number; coins: string }>(
        `SELECT package_id, count(*)::int AS purchases, COALESCE(SUM(coins), 0)::text AS coins
         FROM gift_package_purchases GROUP BY package_id`
      ),
    ]);
    const byPackage = new Map(stats.map((row) => [row.package_id, row]));
    res.json({
      packages: packages.map((pkg) => ({
        ...pkg,
        purchases: Number(byPackage.get(pkg.id)?.purchases || 0),
        revenue: Number(byPackage.get(pkg.id)?.coins || 0),
      })),
      gifts: gifts.map((row) => serializeGift(row)),
    });
  })
);

router.post(
  '/gift-packages',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) throw new HttpError(400, 'Package name is required', 'invalid_package');
    const items = readPackageItems(req.body?.items);
    if (items.length === 0) {
      throw new HttpError(400, 'Add at least one gift to the package', 'package_empty');
    }
    const price = Math.max(0, Math.round(Number(req.body?.price) || 0));
    const created = await tx(async (c) => {
      const row = await c.query<{ id: string }>(
        `INSERT INTO gift_packages (name, name_en, description, cover_url, price, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          name,
          String(req.body?.nameEn || '').trim().slice(0, 80),
          String(req.body?.description || '').trim().slice(0, 300),
          String(req.body?.coverUrl || '').trim().slice(0, 500) || null,
          price,
          req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
          Math.round(Number(req.body?.sortOrder) || 0),
        ]
      );
      const packageId = row.rows[0].id;
      await replacePackageItems(c, packageId, items);
      return { id: packageId };
    });
    res.status(201).json({ packageId: created.id });
  })
);

router.put(
  '/gift-packages/:id',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, 'Package not found', 'package_not_found');
    const existing = await one<{ id: string; name: string }>(
      'SELECT id, name FROM gift_packages WHERE id = $1',
      [req.params.id]
    );
    if (!existing) throw new HttpError(404, 'Package not found', 'package_not_found');
    const name = req.body?.name === undefined
      ? existing.name
      : String(req.body.name || '').trim().slice(0, 80);
    if (!name) throw new HttpError(400, 'Package name is required', 'invalid_package');
    const items = req.body?.items === undefined ? null : readPackageItems(req.body.items);
    if (items && items.length === 0) {
      throw new HttpError(400, 'Add at least one gift to the package', 'package_empty');
    }
    await tx(async (c) => {
      await c.query(
        `UPDATE gift_packages SET name = $2, name_en = $3, description = $4, cover_url = $5,
           price = $6, is_active = $7, sort_order = $8
         WHERE id = $1`,
        [
          existing.id,
          name,
          String(req.body?.nameEn || '').trim().slice(0, 80),
          String(req.body?.description || '').trim().slice(0, 300),
          String(req.body?.coverUrl || '').trim().slice(0, 500) || null,
          Math.max(0, Math.round(Number(req.body?.price) || 0)),
          req.body?.isActive === undefined ? true : Boolean(req.body.isActive),
          Math.round(Number(req.body?.sortOrder) || 0),
        ]
      );
      if (items) await replacePackageItems(c, existing.id, items);
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/gift-packages/:id',
  asyncHandler(async (req, res) => {
    const row = await one(
      'UPDATE gift_packages SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'Package not found', 'package_not_found');
    res.json({ ok: true });
  })
);

/** Grants a whole package straight to a user's bag (no charge). */
router.post(
  '/gift-packages/:id/grant',
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, 'Package not found', 'package_not_found');
    const target = String(req.body?.user || '').trim();
    if (!target) throw new HttpError(400, 'Enter a user ID', 'invalid_user');
    const user = await findBagUser(target);
    const pkg = await one<{ id: string; name: string }>(
      'SELECT id, name FROM gift_packages WHERE id = $1',
      [req.params.id]
    );
    if (!pkg) throw new HttpError(404, 'Package not found', 'package_not_found');
    const lines = await q<{ gift_id: string; quantity: number }>(
      'SELECT gift_id, quantity FROM gift_package_items WHERE package_id = $1',
      [pkg.id]
    );
    if (lines.length === 0) throw new HttpError(400, 'This package has no gifts', 'package_empty');

    const giftCount = await tx(async (c) => {
      let total = 0;
      for (const line of lines) {
        const quantity = Number(line.quantity);
        await addToBag(c, user.id, line.gift_id, quantity);
        total += quantity;
      }
      await c.query(
        `INSERT INTO gift_package_purchases (request_id, user_id, package_id, coins, gift_count, source)
         VALUES ($1, $2, $3, 0, $4, 'admin_grant')`,
        [`grant:${crypto.randomUUID()}`, user.id, pkg.id, total]
      );
      return total;
    });

    await notify(user.id, 'gift_bag', 'جنطة الهدايا', `أُضيفت هدايا «${pkg.name}» إلى جنطتك`, {
      packageId: pkg.id,
      giftCount,
    });
    res.status(201).json({ granted: true, userId: user.id, giftCount });
  })
);

/** Grants copies of a single gift straight to a user's bag (no charge). */
router.post(
  '/gifts/:id/grant',
  asyncHandler(async (req, res) => {
    const gift = await one<GiftRow>('SELECT * FROM gifts WHERE id = $1', [req.params.id]);
    if (!gift) throw new HttpError(404, 'Gift not found', 'gift_not_found');
    const target = String(req.body?.user || '').trim();
    if (!target) throw new HttpError(400, 'Enter a user ID', 'invalid_user');
    const user = await findBagUser(target);
    const quantity = Math.min(999, Math.max(1, Math.trunc(Number(req.body?.quantity) || 1)));
    await tx((c) => addToBag(c, user.id, gift.id, quantity));
    await notify(user.id, 'gift_bag', 'جنطة الهدايا', `أُضيفت «${gift.name}» ×${quantity} إلى جنطتك`, {
      giftId: gift.id,
      quantity,
    });
    res.status(201).json({ granted: true, userId: user.id, quantity });
  })
);

router.get(
  '/gift-transactions',
  requireRole('superadmin', 'accountant'),
  asyncHandler(async (_req, res) => {
    const totals = await one<{
      revenue: string;
      recipient_payout: string;
      host_payout: string;
      admin_share: string;
      today: string;
      count: string;
    }>(
      `SELECT COALESCE(SUM(coins), 0)::text AS revenue,
              COALESCE(SUM(recipient_coins), 0)::text AS recipient_payout,
              COALESCE(SUM(host_coins), 0)::text AS host_payout,
              COALESCE(SUM(admin_coins), 0)::text AS admin_share,
              COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE 'Asia/Baghdad')::date = $1::date
                                THEN admin_coins ELSE 0 END), 0)::text AS today,
              count(*)::text AS count
       FROM gift_sends`,
      [iraqDateStr()]
    );
    const rows = await q(
      `SELECT s.id, s.gift_name, s.coins, s.currency, s.recipient_coins, s.host_coins,
              s.admin_coins, s.recipient_percent, s.host_percent, s.admin_percent, s.created_at,
              sender.display_name AS sender_name, sender.username AS sender_username,
              recipient.display_name AS recipient_name, recipient.username AS recipient_username,
              g.design, g.video_url, g.cover_url, g.rarity
       FROM gift_sends s
       JOIN users sender ON sender.id = s.sender_id
       JOIN users recipient ON recipient.id = s.recipient_id
       JOIN gifts g ON g.id = s.gift_id
       ORDER BY s.created_at DESC LIMIT 100`
    );
    res.json({
      totals: {
        revenue: Number(totals?.revenue || 0),
        recipientPayout: Number(totals?.recipient_payout || 0),
        hostPayout: Number(totals?.host_payout || 0),
        adminShare: Number(totals?.admin_share || 0),
        today: Number(totals?.today || 0),
        count: Number(totals?.count || 0),
      },
      transactions: rows,
    });
  })
);

// ------------------------------------------------------------ lucky gifts
/** «هدايا الحظ»: economy totals plus the latest spins, for the admin panel. */
router.get(
  '/lucky-gifts',
  asyncHandler(async (_req, res) => {
    const totals = await one<{ spins: string; spent: string; paid: string; winners: string }>(
      `SELECT count(*)::text AS spins,
              COALESCE(SUM(cost), 0)::text AS spent,
              COALESCE(SUM(prize), 0)::text AS paid,
              COALESCE(SUM(CASE WHEN prize > 0 THEN 1 ELSE 0 END), 0)::text AS winners
       FROM lucky_gift_spins`
    );
    const rows = await q(
      `SELECT s.id, s.cost, s.prize, s.created_at,
              u.display_name, u.username, u.avatar_url,
              r.name AS room_name
       FROM lucky_gift_spins s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN rooms r ON r.id = s.room_id
       ORDER BY s.created_at DESC LIMIT 100`
    );
    const spent = Number(totals?.spent || 0);
    const paid = Number(totals?.paid || 0);
    res.json({
      totals: {
        spins: Number(totals?.spins || 0),
        spent,
        paid,
        profit: spent - paid,
        winners: Number(totals?.winners || 0),
      },
      spins: rows,
    });
  })
);

// ------------------------------------------------------------- room frames
/** Room gift frames are a separate catalog from the cosmetic/gift stores. */
function readRoomFrameBody(body: Record<string, unknown>) {
  const out: {
    name?: string;
    name_en?: string;
    image_url?: string;
    price?: number;
    is_active?: boolean;
    sort_order?: number;
  } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Frame name is required', 'invalid_frame');
    out.name = name;
  }
  if (body.nameEn !== undefined) out.name_en = String(body.nameEn).trim().slice(0, 60);
  if (body.imageUrl !== undefined) {
    const url = String(body.imageUrl).trim().slice(0, 500);
    if (!url) throw new HttpError(400, 'Frame image is required', 'invalid_frame');
    out.image_url = url;
  }
  if (body.price !== undefined) {
    const price = Math.trunc(Number(body.price));
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Invalid frame price', 'invalid_frame');
    out.price = price;
  }
  if (body.isActive !== undefined) out.is_active = Boolean(body.isActive);
  if (body.sortOrder !== undefined) out.sort_order = Math.trunc(Number(body.sortOrder)) || 0;
  return out;
}

router.get(
  '/room-frames',
  asyncHandler(async (_req, res) => {
    const rows = await q<RoomFrameRow & { sends: number }>(
      `SELECT f.*, (SELECT count(*)::int FROM room_frame_sends s WHERE s.frame_id = f.id) AS sends
         FROM room_frames f ORDER BY f.sort_order, f.created_at`
    );
    // Send/charge log the administration can audit.
    const log = await q<{
      id: string;
      frame_name: string;
      price: number;
      duration_seconds: number;
      starts_at: string;
      expires_at: string;
      created_at: string;
      sender_name: string | null;
      sender_username: string | null;
      recipient_name: string | null;
      recipient_username: string | null;
      room_name: string | null;
    }>(
      `SELECT s.id, COALESCE(f.name, s.frame_name) AS frame_name, s.price, s.duration_seconds,
              s.starts_at, s.expires_at, s.created_at,
              sender.display_name AS sender_name, sender.username AS sender_username,
              recipient.display_name AS recipient_name, recipient.username AS recipient_username,
              r.name AS room_name
         FROM room_frame_sends s
         LEFT JOIN room_frames f ON f.id = s.frame_id
         JOIN users sender ON sender.id = s.sender_id
         JOIN users recipient ON recipient.id = s.recipient_id
         JOIN rooms r ON r.id = s.room_id
        ORDER BY s.created_at DESC LIMIT 100`
    );
    res.json({
      frames: rows.map((row) => ({ ...serializeRoomFrame(row), sends: row.sends })),
      log,
    });
  })
);

router.post(
  '/room-frames/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
  })
);

router.post(
  '/room-frames',
  asyncHandler(async (req, res) => {
    const fields = readRoomFrameBody((req.body ?? {}) as Record<string, unknown>);
    if (!fields.name) throw new HttpError(400, 'Frame name is required', 'invalid_frame');
    if (!fields.image_url) throw new HttpError(400, 'Frame image is required', 'invalid_frame');
    const created = await one<RoomFrameRow>(
      `INSERT INTO room_frames (name, name_en, image_url, price, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        fields.name,
        fields.name_en || fields.name,
        fields.image_url,
        fields.price ?? 99,
        fields.is_active ?? true,
        fields.sort_order ?? 0,
      ]
    );
    res.status(201).json({ frame: created ? serializeRoomFrame(created) : null });
  })
);

/** Saves the whole display order in one request (admin list arrows). */
router.post(
  '/room-frames/reorder',
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (!ids.length) throw new HttpError(400, 'Order list is required', 'invalid_order');
    await tx(async (c) => {
      for (let index = 0; index < ids.length; index += 1) {
        await c.query('UPDATE room_frames SET sort_order = $2 WHERE id = $1', [ids[index], index * 10]);
      }
    });
    res.json({ reordered: ids.length });
  })
);

router.patch(
  '/room-frames/:id',
  asyncHandler(async (req, res) => {
    const existing = await one<RoomFrameRow>('SELECT * FROM room_frames WHERE id = $1', [req.params.id]);
    if (!existing) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    const fields = readRoomFrameBody((req.body ?? {}) as Record<string, unknown>);
    const updated = await one<RoomFrameRow>(
      `UPDATE room_frames
          SET name = $2, name_en = $3, image_url = $4, price = $5, is_active = $6, sort_order = $7
        WHERE id = $1 RETURNING *`,
      [
        existing.id,
        fields.name ?? existing.name,
        fields.name_en ?? existing.name_en,
        fields.image_url ?? existing.image_url,
        fields.price ?? Number(existing.price),
        fields.is_active ?? existing.is_active,
        fields.sort_order ?? Number(existing.sort_order),
      ]
    );
    res.json({ frame: updated ? serializeRoomFrame(updated) : null });
  })
);

router.delete(
  '/room-frames/:id',
  asyncHandler(async (req, res) => {
    const deleted = await one('DELETE FROM room_frames WHERE id = $1 RETURNING id', [req.params.id]);
    if (!deleted) throw new HttpError(404, 'Frame not found', 'frame_not_found');
    res.json({ deleted: true });
  })
);

export default router;
