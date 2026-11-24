import { Router } from 'express';
import { one, q, tx } from '../db';
import { assertNotThrottled, clearAttempts, recordAttempt, reqUser, requireAuth } from '../auth';
import { emitToUser } from '../realtime';
import { notify } from '../notify';
import { confirmOrder } from '../orders';
import { getProfitWallet } from '../gifts';
import { createWithdrawal, enabledMethods, serializeWithdrawal } from '../payouts';
import { getSettings } from '../settings';
import { HttpError, asyncHandler, intParam } from '../utils';
import { moveCoins } from '../wallet';

const router = Router();

/** One ledger row, with the reference and the balance on both sides of it. */
function serializeLedger(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount || 0),
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    refType: row.ref_type,
    refId: row.ref_id,
    meta: row.meta,
    createdAt: row.created_at,
  };
}

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
    const wallet = await one<{
      balance: number;
      reserved: number;
      earned: number;
      spent: number;
      gold: number;
    }>('SELECT balance, reserved, earned, spent, gold FROM wallets WHERE user_id = $1', [me]);
    const profit = await getProfitWallet(me);
    const transactions = await q(
      `SELECT id, type, amount, balance_before, balance_after, ref_type, ref_id, meta, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [me]
    );
    const goldTransactions = await q(
      `SELECT id, type, amount, balance_before, balance_after, ref_type, ref_id, meta, created_at
       FROM gold_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [me]
    );
    const beanTransactions = await q(
      `SELECT id, type, amount, balance_before, balance_after, ref_type, ref_id, meta, created_at
       FROM profit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [me]
    );
    const earnings = await one<{ total: string; calls: string }>(
      'SELECT COALESCE(SUM(coins), 0)::text AS total, count(*)::text AS calls FROM earnings WHERE user_id = $1',
      [me]
    );
    const withdrawals = await q(
      `SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [me]
    );
    res.json({
      wallet: wallet ?? { balance: 0, reserved: 0, earned: 0, spent: 0, gold: 0 },
      currencies: {
        diamond: {
          code: 'DIAMOND',
          balance: Number(wallet?.balance || 0),
          reserved: Number(wallet?.reserved || 0),
          earned: Number(wallet?.earned || 0),
          spent: Number(wallet?.spent || 0),
        },
        gold: { code: 'GOLD', balance: Number(wallet?.gold || 0) },
        beans: {
          code: 'BEANS',
          available: profit.available,
          pending: profit.pending,
          withdrawn: profit.withdrawn,
          totalEarned: profit.total_earned,
        },
      },
      transactions: transactions.map(serializeLedger),
      goldTransactions: goldTransactions.map(serializeLedger),
      beanTransactions: beanTransactions.map(serializeLedger),
      earnings: { total: Number(earnings?.total || 0), calls: Number(earnings?.calls || 0) },
      withdrawals: withdrawals.map(serializeWithdrawal),
      minWithdrawalBeans: settings.min_withdrawal_beans,
      maxWithdrawalBeans: settings.max_withdrawal_beans,
      beansPerUsd: settings.beans_per_usd,
      beanToIqdRate: settings.bean_to_iqd_rate,
      withdrawalFeePercent: settings.withdrawal_fee_percent,
      withdrawalMethods: enabledMethods(settings),
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

const GIFT_ATTEMPT_KIND = 'gift_redeem';

router.post(
  '/redeem',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const code = String(req.body?.code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) throw new HttpError(400, 'Enter a valid gift code', 'invalid_code');
    await assertNotThrottled(`gift:${me}`, GIFT_ATTEMPT_KIND);

    let outcome: { coins: number; balance: number; code: string };
    try {
      outcome = await tx(async (c) => {
        // Lock the code row so two users redeeming the same multi-use code cannot overrun max_uses.
        const found = await c.query(
          `SELECT id, code, coins, max_uses, used_count, is_active, expires_at
           FROM gift_codes
           WHERE regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') = $1
           FOR UPDATE`,
          [code]
        );
        const gift = found.rows[0];
        if (!gift || !gift.is_active) throw new HttpError(404, 'Gift code not found', 'invalid_code');
        if (gift.expires_at && new Date(gift.expires_at).getTime() < Date.now()) {
          throw new HttpError(410, 'This gift code has expired', 'code_expired');
        }
        const already = await c.query(
          'SELECT 1 FROM gift_code_redemptions WHERE gift_code_id = $1 AND user_id = $2',
          [gift.id, me]
        );
        if (already.rowCount) {
          throw new HttpError(409, 'You already used this gift code', 'code_already_used');
        }
        if (Number(gift.used_count) >= Number(gift.max_uses)) {
          throw new HttpError(409, 'This gift code has been used up', 'code_exhausted');
        }
        await c.query('UPDATE gift_codes SET used_count = used_count + 1 WHERE id = $1', [gift.id]);
        await c.query(
          'INSERT INTO gift_code_redemptions (gift_code_id, user_id, coins) VALUES ($1, $2, $3)',
          [gift.id, me, gift.coins]
        );
        const moved = await moveCoins(c, {
          userId: me,
          amount: Number(gift.coins),
          type: 'gift_code',
          refType: 'gift_code',
          refId: gift.id,
          meta: { code: gift.code },
        });
        return { coins: Number(gift.coins), balance: moved.balanceAfter, code: gift.code };
      });
    } catch (error) {
      if (error instanceof HttpError && error.status < 500) {
        await recordAttempt(`gift:${me}`, GIFT_ATTEMPT_KIND);
      }
      throw error;
    }

    await clearAttempts(`gift:${me}`, GIFT_ATTEMPT_KIND);
    emitToUser(me, 'wallet:update', { balance: outcome.balance });
    await notify(me, 'gift_code', 'كود هدية', `تمت إضافة ${outcome.coins} كونز إلى محفظتك`, {
      coins: outcome.coins,
      code: outcome.code,
    });
    res.json(outcome);
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
    const result = await tx((c) =>
      createWithdrawal(c, {
        userId: me,
        beans: Number(req.body?.beans ?? req.body?.coins ?? 0),
        currency: String(req.body?.currency || 'IQD'),
        method: String(req.body?.method || 'manual'),
        details: String(req.body?.details || req.body?.note || ''),
      })
    );

    emitToUser(me, 'profit:update', {});
    await notify(
      me,
      'withdrawal_requested',
      'طلب سحب الأرباح',
      `طلبك بمبلغ ${result.withdrawal.coins} فاصوليا (${result.quote.net} ${result.quote.currency}) قيد المراجعة`,
      {
        beans: Number(result.withdrawal.coins),
        currency: result.quote.currency,
        net: result.quote.net,
        withdrawalId: result.withdrawal.id,
      }
    );
    res.status(201).json({
      withdrawal: serializeWithdrawal(result.withdrawal),
      quote: result.quote,
    });
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
