import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import {
  GiftMessageInfo,
  GiftRow,
  getProfitWallet,
  listActiveGifts,
  moveProfit,
  serializeGift,
} from '../gifts';
import { emitToUser } from '../realtime';
import { notify } from '../notify';
import { awardXpSafe, getXpSettings, xpForCoins } from '../progression';
import { getSettings } from '../settings';
import { moveCoins } from '../wallet';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

const CURRENCIES = ['IQD', 'USD'] as const;
const METHODS = ['manual', 'zaincash', 'fastpay', 'bank'] as const;

function methodLabel(method: string): string {
  return (
    {
      manual: 'تحويل يدوي / كاش',
      zaincash: 'ZainCash',
      fastpay: 'FastPay',
      bank: 'حساب مصرفي',
    }[method] ?? method
  );
}

/** Store catalog + the viewer's coin balance, shown when the gift sheet opens. */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    const gifts = await listActiveGifts();
    const wallet = await one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [
      me,
    ]);
    res.json({
      gifts: gifts.map(serializeGift),
      balance: wallet?.balance ?? 0,
      defaultRecipientPercent: settings.gift_recipient_percent,
      defaultAdminPercent: settings.gift_admin_percent,
      giftsEnabled: settings.gifts_enabled,
    });
  })
);

/**
 * Sends a gift inside a private conversation.
 *
 * Everything that touches money happens in one transaction: the sender is charged,
 * the recipient's earnings wallet is credited with the admin-configured share, the
 * chat message is stored and the send row is written. The client's `requestId`
 * makes a retried request return the original send instead of charging again.
 */
router.post(
  '/send',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    if (!settings.gifts_enabled) {
      throw new HttpError(403, 'Gifts are disabled', 'gifts_disabled');
    }

    const giftId = String(req.body?.giftId || '');
    const conversationId = String(req.body?.conversationId || '');
    const requestId = String(req.body?.requestId || '').trim().slice(0, 80);
    if (!giftId || !conversationId) {
      throw new HttpError(400, 'Gift and conversation are required', 'invalid_gift');
    }
    if (requestId.length < 8) {
      throw new HttpError(400, 'Missing request id', 'invalid_request');
    }

    const outcome = await tx(async (c) => {
      const member = await c.query(
        'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, me]
      );
      if (!member.rowCount) {
        throw new HttpError(404, 'Conversation not found', 'conversation_not_found');
      }
      const peer = await c.query<{ user_id: string }>(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 LIMIT 1',
        [conversationId, me]
      );
      const recipientId = peer.rows[0]?.user_id;
      if (!recipientId) throw new HttpError(404, 'Conversation not found', 'conversation_not_found');

      const blocked = await c.query(
        `SELECT 1 FROM blocked_users
         WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
        [me, recipientId]
      );
      if (blocked.rowCount) {
        throw new HttpError(403, 'You cannot send gifts to this user', 'blocked');
      }

      const giftResult = await c.query<GiftRow>(
        'SELECT * FROM gifts WHERE id = $1 AND is_active = true',
        [giftId]
      );
      const gift = giftResult.rows[0];
      if (!gift) throw new HttpError(404, 'Gift not found', 'gift_not_found');

      const percent =
        gift.recipient_percent === null
          ? settings.gift_recipient_percent
          : Number(gift.recipient_percent);
      const recipientPercent = Math.min(100, Math.max(0, Math.trunc(percent)));
      const adminPercent = 100 - recipientPercent;
      const price = Number(gift.price);
      const recipientCoins = Math.floor((price * recipientPercent) / 100);
      const adminCoins = price - recipientCoins;

      // Insert first: the unique request_id is the idempotency guard. A concurrent
      // duplicate waits on this index, then gets zero rows and reuses the original.
      const created = await c.query(
        `INSERT INTO gift_sends
           (request_id, gift_id, conversation_id, sender_id, recipient_id, coins,
            recipient_coins, admin_coins, recipient_percent, admin_percent, gift_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING *`,
        [
          requestId,
          gift.id,
          conversationId,
          me,
          recipientId,
          price,
          recipientCoins,
          adminCoins,
          recipientPercent,
          adminPercent,
          gift.name,
        ]
      );

      if (!created.rowCount) {
        const existing = await c.query(
          'SELECT * FROM gift_sends WHERE request_id = $1 AND sender_id = $2',
          [requestId, me]
        );
        if (!existing.rowCount) {
          throw new HttpError(409, 'This gift request was already used', 'duplicate_request');
        }
        const send = existing.rows[0];
        const message = send.message_id
          ? await c.query(
              `SELECT id, conversation_id, sender_id, body, type, attachment_url, attachment_name,
                      created_at, read_at
               FROM messages WHERE id = $1`,
              [send.message_id]
            )
          : null;
        return { send, gift, message: message?.rows[0] ?? null, duplicate: true };
      }

      const send = created.rows[0];

      // Charge the sender. The ledger's unique (user, type, ref) index plus this
      // transaction means the balance and the gift row can never disagree.
      const moved = await moveCoins(c, {
        userId: me,
        amount: -price,
        type: 'gift_send',
        refType: 'gift_send',
        refId: send.id,
        meta: { giftId: gift.id, giftName: gift.name, recipientId, conversationId },
      });
      if (!moved.applied) {
        throw new HttpError(409, 'This gift was already sent', 'duplicate_request');
      }

      // Credit the recipient's earnings wallet with the configured share.
      if (recipientCoins > 0) {
        await moveProfit(c, {
          userId: recipientId,
          type: 'gift_earning',
          amount: recipientCoins,
          earned: recipientCoins,
          refType: 'gift_send',
          refId: send.id,
          meta: {
            giftId: gift.id,
            giftName: gift.name,
            senderId: me,
            percent: recipientPercent,
          },
        });
      }

      const body = `🎁 ${gift.name}`;
      const messageResult = await c.query(
        `INSERT INTO messages (conversation_id, sender_id, body, type, gift_send_id)
         VALUES ($1, $2, $3, 'gift', $4) RETURNING *`,
        [conversationId, me, body, send.id]
      );
      const message = messageResult.rows[0];
      await c.query('UPDATE gift_sends SET message_id = $2 WHERE id = $1', [send.id, message.id]);
      await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [
        conversationId,
      ]);

      return { send, gift, message, duplicate: false };
    });

    if (!outcome.duplicate) {
      const xpSettings = await getXpSettings();
      await awardXpSafe({
        userId: me,
        kind: 'gift',
        refId: outcome.send.id,
        xp: xpForCoins('gift', Number(outcome.send.coins), xpSettings),
      });
    }

    const giftInfo: GiftMessageInfo = {
      id: outcome.send.id,
      name: outcome.gift.name,
      nameEn: outcome.gift.name_en || outcome.gift.name,
      slug: outcome.gift.slug,
      design: outcome.gift.design,
      videoUrl: outcome.gift.video_url,
      coverUrl: outcome.gift.cover_url,
      rarity: outcome.gift.rarity,
      price: Number(outcome.send.coins),
      recipientCoins: Number(outcome.send.recipient_coins),
    };

    if (outcome.duplicate && outcome.message) {
      res.json({
        duplicate: true,
        message: {
          id: outcome.message.id,
          conversationId: outcome.message.conversation_id,
          senderId: outcome.message.sender_id,
          body: outcome.message.body,
          type: 'gift',
          attachmentUrl: null,
          attachmentName: null,
          createdAt: outcome.message.created_at,
          readAt: outcome.message.read_at,
          mine: true,
          gift: giftInfo,
        },
        balance: null,
      });
      return;
    }

    const message = outcome.message;
    const payload = {
      id: message.id,
      conversationId,
      senderId: me,
      body: message.body,
      type: 'gift',
      attachmentUrl: null,
      attachmentName: null,
      createdAt: message.created_at,
      readAt: null,
      mine: false,
      gift: giftInfo,
    };

    const senderRow = await one<{ display_name: string; username: string }>(
      'SELECT display_name, username FROM users WHERE id = $1',
      [me]
    );
    const senderName = senderRow?.display_name || senderRow?.username || 'مستخدم';

    emitToUser(me, 'message:new', { ...payload, mine: true });
    emitToUser(outcome.send.recipient_id, 'message:new', payload);
    emitToUser(me, 'wallet:update', {});
    emitToUser(outcome.send.recipient_id, 'profit:update', {});
    await notify(
      outcome.send.recipient_id,
      'gift_received',
      `🎁 استلمت ${outcome.gift.name}`,
      `${senderName} أرسل لك ${outcome.gift.name} — أضيف ${outcome.send.recipient_coins} كونز إلى أرباحك`,
      {
        giftSendId: outcome.send.id,
        giftName: outcome.gift.name,
        giftDesign: outcome.gift.design,
        giftVideoUrl: outcome.gift.video_url,
        senderId: me,
        senderName,
        coins: Number(outcome.send.coins),
        recipientCoins: Number(outcome.send.recipient_coins),
        conversationId,
      }
    );

    const senderWallet = await one<{ balance: number }>(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [me]
    );
    res.status(201).json({
      duplicate: false,
      message: { ...payload, mine: true },
      balance: senderWallet?.balance ?? 0,
      recipientCoins: Number(outcome.send.recipient_coins),
      adminCoins: Number(outcome.send.admin_coins),
    });
  })
);

/** Earnings wallet: totals, received gifts, ledger and withdrawal requests. */
router.get(
  '/earnings',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    const wallet = await getProfitWallet(me);

    const received = await q(
      `SELECT gs.id, gs.coins, gs.recipient_coins, gs.recipient_percent, gs.gift_name,
              gs.created_at, u.display_name AS sender_name, u.username AS sender_username,
              u.avatar_url AS sender_avatar, g.design, g.video_url, g.cover_url, g.rarity
       FROM gift_sends gs
       JOIN users u ON u.id = gs.sender_id
       JOIN gifts g ON g.id = gs.gift_id
       WHERE gs.recipient_id = $1
       ORDER BY gs.created_at DESC LIMIT 50`,
      [me]
    );

    const transactions = await q(
      `SELECT id, type, amount, balance_after, ref_type, ref_id, meta, created_at
       FROM profit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [me]
    );

    const withdrawals = await q(
      `SELECT id, coins, amount, currency, payment_method, payout_details, status, note,
              created_at, processed_at
       FROM withdrawal_requests
       WHERE user_id = $1 AND source = 'profit'
       ORDER BY created_at DESC LIMIT 30`,
      [me]
    );

    res.json({
      wallet: {
        totalEarned: wallet.total_earned,
        available: wallet.available,
        pending: wallet.pending,
        withdrawn: wallet.withdrawn,
      },
      received: received.map((row) => ({
        id: row.id,
        giftName: row.gift_name,
        price: Number(row.coins),
        coins: Number(row.recipient_coins),
        percent: Number(row.recipient_percent),
        design: row.design,
        videoUrl: row.video_url,
        coverUrl: row.cover_url,
        rarity: row.rarity,
        sender: {
          name: row.sender_name,
          username: row.sender_username,
          avatarUrl: row.sender_avatar,
        },
        createdAt: row.created_at,
      })),
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        meta: row.meta,
        createdAt: row.created_at,
      })),
      withdrawals: withdrawals.map((row) => ({
        id: row.id,
        coins: row.coins,
        amount: Number(row.amount),
        currency: row.currency,
        method: row.payment_method,
        methodLabel: methodLabel(row.payment_method),
        details: row.payout_details,
        status: row.status,
        note: row.note,
        createdAt: row.created_at,
        processedAt: row.processed_at,
      })),
      minWithdrawalCoins: settings.min_withdrawal_coins,
      coinToIqdRate: settings.coin_to_iqd_rate,
      coinToUsdRate: settings.coin_to_usd_rate,
      methods: METHODS.map((id) => ({ id, label: methodLabel(id) })),
      currencies: CURRENCIES,
    });
  })
);

/** Requests a payout from the earnings wallet. Coins move available → pending. */
router.post(
  '/withdrawals',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const settings = await getSettings();
    const coins = Math.trunc(Number(req.body?.coins || 0));
    const currency = String(req.body?.currency || 'IQD').toUpperCase();
    const method = String(req.body?.method || 'manual');
    const details = String(req.body?.details || '').trim().slice(0, 400);

    if (!Number.isFinite(coins) || coins <= 0) {
      throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
    }
    if (coins < settings.min_withdrawal_coins) {
      throw new HttpError(
        400,
        `Minimum withdrawal is ${settings.min_withdrawal_coins} coins`,
        'below_minimum',
        { min: settings.min_withdrawal_coins }
      );
    }
    if (!(CURRENCIES as readonly string[]).includes(currency)) {
      throw new HttpError(400, 'Unsupported currency', 'invalid_currency');
    }
    if (!(METHODS as readonly string[]).includes(method)) {
      throw new HttpError(400, 'Unsupported payment method', 'invalid_method');
    }
    if (details.length < 4) {
      throw new HttpError(400, 'Enter the payout details', 'missing_details');
    }

    const rate = currency === 'USD' ? settings.coin_to_usd_rate : settings.coin_to_iqd_rate;
    const amount = Math.round(coins * rate * 100) / 100;

    const withdrawal = await tx(async (c) => {
      const created = await c.query(
        `INSERT INTO withdrawal_requests
           (user_id, coins, amount_iqd, amount, currency, payment_method, payout_details, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'profit', 'pending') RETURNING *`,
        [
          me,
          coins,
          currency === 'IQD' ? Math.round(amount) : Math.round(coins * settings.coin_to_iqd_rate),
          amount,
          currency,
          method,
          details,
        ]
      );
      const row = created.rows[0];
      await moveProfit(c, {
        userId: me,
        type: 'withdrawal_hold',
        amount: -coins,
        hold: coins,
        refType: 'withdrawal_request',
        refId: row.id,
        meta: { coins, currency, method, amount },
      });
      return row;
    });

    emitToUser(me, 'profit:update', {});
    await notify(
      me,
      'withdrawal_requested',
      'طلب سحب الأرباح',
      `طلبك بمبلغ ${coins} كونز (${amount} ${currency}) قيد المراجعة`,
      { coins, currency, amount, withdrawalId: withdrawal.id }
    );
    res.status(201).json({
      withdrawal: {
        id: withdrawal.id,
        coins: withdrawal.coins,
        amount: Number(withdrawal.amount),
        currency: withdrawal.currency,
        method: withdrawal.payment_method,
        status: withdrawal.status,
      },
    });
  })
);

export default router;
