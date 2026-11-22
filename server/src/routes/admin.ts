import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q, tx } from '../db';
import {
  assertNotThrottled,
  clearAttempts,
  recordAttempt,
  reqAdmin,
  requireAdmin,
  signAdminToken,
} from '../auth';
import { activeCallFor, endCall } from '../calls';
import { notify } from '../notify';
import { confirmOrder } from '../orders';
import { emitToUser, isOnline, onlineUserIds } from '../realtime';
import { getSettings, updateSettings } from '../settings';
import { FRAME_RARITIES, FrameRow, serializeFrame } from '../frames';
import { HttpError, asyncHandler, intParam, iraqDateStr, nextIraqMidnight } from '../utils';
import { moveCoins } from '../wallet';
import { upload } from './uploads';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) throw new HttpError(400, 'Enter credentials', 'missing_credentials');
    await assertNotThrottled(`admin:${username}`, 'admin_login');

    const admin = await one<{ id: string; username: string; display_name: string; password_hash: string }>(
      'SELECT id, username, display_name, password_hash FROM admin_users WHERE username = $1',
      [username]
    );
    const ok = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !ok) {
      await recordAttempt(`admin:${username}`, 'admin_login');
      throw new HttpError(401, 'Wrong admin credentials', 'invalid_credentials');
    }
    await clearAttempts(`admin:${username}`, 'admin_login');
    await q('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [admin.id]);
    res.json({
      token: signAdminToken(admin.id),
      admin: { id: admin.id, username: admin.username, displayName: admin.display_name },
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

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings(true) });
  })
);

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.body ?? {});
    res.json({ settings });
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
  asyncHandler(async (req, res) => {
    const row = await one<{ id: string; user_id: string; coins: number }>(
      `UPDATE withdrawal_requests SET status = 'approved', processed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING id, user_id, coins`,
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'Pending withdrawal not found', 'withdrawal_not_found');
    await notify(row.user_id, 'withdrawal_approved', 'تمت الموافقة على السحب', `${row.coins} كونز`, {
      coins: row.coins,
    });
    res.json({ ok: true });
  })
);

router.post(
  '/withdrawals/:id/reject',
  asyncHandler(async (req, res) => {
    const result = await tx(async (c) => {
      const { rows } = await c.query<{ id: string; user_id: string; coins: number }>(
        `UPDATE withdrawal_requests SET status = 'rejected', processed_at = now(), note = $2
         WHERE id = $1 AND status = 'pending' RETURNING id, user_id, coins`,
        [req.params.id, String(req.body?.note || 'rejected').slice(0, 200)]
      );
      if (!rows[0]) throw new HttpError(404, 'Pending withdrawal not found', 'withdrawal_not_found');
      const moved = await moveCoins(c, {
        userId: rows[0].user_id,
        amount: rows[0].coins,
        type: 'withdrawal_refund',
        refType: 'withdrawal_request',
        refId: rows[0].id,
        meta: { reason: 'rejected' },
      });
      return { withdrawal: rows[0], balance: moved.balanceAfter };
    });
    emitToUser(result.withdrawal.user_id, 'wallet:update', { balance: result.balance });
    await notify(
      result.withdrawal.user_id,
      'withdrawal_rejected',
      'تم رفض طلب السحب',
      'أعيد المبلغ إلى محفظتك',
      { coins: result.withdrawal.coins }
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
  return out;
}

router.get(
  '/frames',
  asyncHandler(async (_req, res) => {
    const rows = await q<FrameRow & { owners: number; equipped: number }>(
      `SELECT f.*,
        (SELECT count(*)::int FROM user_avatar_frames uaf
          WHERE uaf.frame_id = f.id AND (uaf.expires_at IS NULL OR uaf.expires_at > now())) AS owners,
        (SELECT count(*)::int FROM users u WHERE u.avatar_frame_id = f.id) AS equipped
       FROM avatar_frames f ORDER BY f.sort_order, f.created_at`
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
        (slug, name, name_en, kind, design, image_url, price, rarity, duration_days, is_rare, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
         price = $7, rarity = $8, duration_days = $9, is_rare = $10, is_active = $11, sort_order = $12
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
      ]
    );
    res.json({ frame: updated ? serializeFrame(updated) : null });
  })
);

export default router;
