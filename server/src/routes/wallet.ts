import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { emitToUser } from '../realtime';
import { notify } from '../notify';
import { confirmOrder } from '../orders';
import { getSettings } from '../settings';
import { HttpError, asyncHandler, intParam } from '../utils';
import { moveCoins } from '../wallet';

const router = Router();

function paymentMethods() {
  return [
    {
      id: 'manual',
      label: 'تحويل يدوي / كاش',
      labelEn: 'Manual transfer / cash',
      enabled: true,
      note: 'حوّل المبلغ ثم أرسل رقم الطلب للإدارة لتأكيد الدفع',
    },
    {
      id: 'zaincash',
      label: 'ZainCash',
      labelEn: 'ZainCash',
      enabled: Boolean(process.env.ZAINCASH_MERCHANT_ID),
      note: 'يتطلب إعداد بيانات التاجر',
    },
    {
      id: 'fastpay',
      label: 'FastPay',
      labelEn: 'FastPay',
      enabled: Boolean(process.env.FASTPAY_MERCHANT_ID),
      note: 'يتطلب إعداد بيانات التاجر',
    },
  ];
}

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    const wallet = await one<{ balance: number; reserved: number; earned: number; spent: number }>(
      'SELECT balance, reserved, earned, spent FROM wallets WHERE user_id = $1',
      [me]
    );
    const transactions = await q(
      `SELECT id, type, amount, balance_after, ref_type, ref_id, meta, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [me]
    );
    const earnings = await one<{ total: string; calls: string }>(
      'SELECT COALESCE(SUM(coins), 0)::text AS total, count(*)::text AS calls FROM earnings WHERE user_id = $1',
      [me]
    );
    const withdrawals = await q(
      `SELECT id, coins, amount_iqd, status, note, created_at, processed_at
       FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [me]
    );
    res.json({
      wallet: wallet ?? { balance: 0, reserved: 0, earned: 0, spent: 0 },
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        refType: row.ref_type,
        refId: row.ref_id,
        meta: row.meta,
        createdAt: row.created_at,
      })),
      earnings: { total: Number(earnings?.total || 0), calls: Number(earnings?.calls || 0) },
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        coins: row.coins,
        amountIqd: row.amount_iqd,
        status: row.status,
        note: row.note,
        createdAt: row.created_at,
        processedAt: row.processed_at,
      })),
      minWithdrawalCoins: settings.min_withdrawal_coins,
      coinToIqdRate: settings.coin_to_iqd_rate,
    });
  })
);

router.get(
  '/packages',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const packages = await q(
      `SELECT id, name, coins, bonus_coins, price_iqd, price_usd_cents
       FROM recharge_packages WHERE is_active = true ORDER BY sort_order, coins`,
    );
    res.json({
      packages: packages.map((row) => ({
        id: row.id,
        name: row.name,
        coins: row.coins,
        bonusCoins: row.bonus_coins,
        totalCoins: Number(row.coins) + Number(row.bonus_coins),
        priceIqd: row.price_iqd,
        priceUsdCents: row.price_usd_cents,
      })),
      paymentMethods: paymentMethods(),
    });
  })
);

router.get(
  '/transactions',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const limit = intParam(req.query.limit, 50, 1, 200);
    const rows = await q(
      `SELECT id, type, amount, balance_after, ref_type, ref_id, meta, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${limit}`,
      [me]
    );
    res.json({ transactions: rows });
  })
);

router.get(
  '/earnings',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q(
      `SELECT e.id, e.call_id, e.coins, e.percent, e.created_at,
              c.kind, c.duration_seconds, c.coins_charged
       FROM earnings e JOIN calls c ON c.id = e.call_id
       WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 100`,
      [me]
    );
    const total = await one<{ total: string }>(
      'SELECT COALESCE(SUM(coins), 0)::text AS total FROM earnings WHERE user_id = $1',
      [me]
    );
    res.json({ earnings: rows, total: Number(total?.total || 0) });
  })
);

router.get(
  '/orders',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q(
      `SELECT o.id, o.coins, o.amount, o.currency, o.provider, o.status, o.provider_ref,
              o.created_at, o.paid_at, p.name AS package_name
       FROM payment_orders o LEFT JOIN recharge_packages p ON p.id = o.package_id
       WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 40`,
      [me]
    );
    res.json({ orders: rows });
  })
);

router.post(
  '/orders',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const packageId = String(req.body?.packageId || '');
    const currency = String(req.body?.currency || 'IQD').toUpperCase() === 'USD' ? 'USD' : 'IQD';
    const provider = String(req.body?.provider || 'manual');
    if (!paymentMethods().some((method) => method.id === provider && method.enabled)) {
      throw new HttpError(400, 'This payment method is not available', 'provider_unavailable');
    }
    const pack = await one<{
      id: string;
      coins: number;
      bonus_coins: number;
      price_iqd: number;
      price_usd_cents: number;
      is_active: boolean;
    }>('SELECT * FROM recharge_packages WHERE id = $1', [packageId]);
    if (!pack || !pack.is_active) throw new HttpError(404, 'Package not found', 'package_not_found');

    const coins = Number(pack.coins) + Number(pack.bonus_coins);
    const amount = currency === 'USD' ? pack.price_usd_cents : pack.price_iqd;
    if (amount <= 0) throw new HttpError(400, 'This package has no price set', 'invalid_price');

    const order = await one(
      `INSERT INTO payment_orders (user_id, package_id, coins, amount, currency, provider, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [me, pack.id, coins, amount, currency, provider]
    );
    res.status(201).json({
      order,
      instructions:
        provider === 'manual'
          ? 'أرسل المبلغ ثم انتظر تأكيد الإدارة — لن يُضاف الرصيد قبل التأكيد'
          : 'أكمل الدفع عبر مزود الخدمة، وسيتم تأكيد الطلب من السيرفر',
    });
  })
);

router.post(
  '/orders/:id/mark-paid',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const note = String(req.body?.note || '').slice(0, 300);
    const order = await one<{ id: string; status: string }>(
      `UPDATE payment_orders SET note = $2
       WHERE id = $1 AND user_id = $3 AND status = 'pending' RETURNING id, status`,
      [req.params.id, note, me]
    );
    if (!order) throw new HttpError(404, 'Order not found', 'order_not_found');
    res.json({ order, message: 'تم إرسال إشعار الدفع، بانتظار تأكيد الإدارة' });
  })
);

router.post(
  '/withdrawals',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    const coins = Math.trunc(Number(req.body?.coins || 0));
    if (!Number.isFinite(coins) || coins <= 0) {
      throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
    }
    if (coins < settings.min_withdrawal_coins) {
      throw new HttpError(400, `Minimum withdrawal is ${settings.min_withdrawal_coins} coins`, 'below_minimum');
    }

    const result = await tx(async (c) => {
      const created = await c.query(
        `INSERT INTO withdrawal_requests (user_id, coins, amount_iqd, status, note)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [me, coins, Math.round(coins * settings.coin_to_iqd_rate), String(req.body?.note || '')]
      );
      const withdrawal = created.rows[0];
      await moveCoins(c, {
        userId: me,
        amount: -coins,
        type: 'withdrawal',
        refType: 'withdrawal_request',
        refId: withdrawal.id,
        meta: { coins },
      });
      return withdrawal;
    });

    await notify(me, 'withdrawal_requested', 'طلب سحب', 'طلبك قيد المراجعة', { coins });
    res.status(201).json({ withdrawal: result });
  })
);

router.post(
  '/orders/:id/confirm-webhook',
  asyncHandler(async (req, res) => {
    // Placeholder guard: real provider callbacks arrive on /api/payments/webhook.
    throw new HttpError(404, 'Not found', 'not_found');
  })
);

export default router;
