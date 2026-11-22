import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { broadcast, emitToUser } from '../realtime';
import { getRoomDetail, listRooms, roomMessageById, roomMessages } from '../rooms';
import { GiftRow, moveProfit } from '../gifts';
import { getSettings } from '../settings';
import { moveCoins } from '../wallet';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    res.json({ rooms: await listRooms() });
  })
);

router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ room: await getRoomDetail(req.params.id, reqUser(req).id) });
  })
);

router.post(
  '/:id/mics/:micId/take',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const micId = req.params.micId;

    await tx(async (client) => {
      const room = await client.query<{ is_active: boolean }>('SELECT is_active FROM rooms WHERE id = $1', [
        roomId,
      ]);
      if (!room.rows[0]?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

      const found = await client.query<{ id: string; user_id: string | null; is_locked: boolean }>(
        'SELECT id, user_id, is_locked FROM room_mics WHERE id = $1 AND room_id = $2 FOR UPDATE',
        [micId, roomId]
      );
      const seat = found.rows[0];
      if (!seat) throw new HttpError(404, 'Mic not found', 'mic_not_found');
      if (seat.user_id && seat.user_id !== me) throw new HttpError(409, 'This mic is taken', 'mic_taken');
      if (seat.is_locked) throw new HttpError(403, 'This mic is locked', 'mic_locked');

      // One seat per user: release any other seat this user holds in the room first.
      await client.query(
        'UPDATE room_mics SET user_id = NULL, joined_at = NULL WHERE room_id = $1 AND user_id = $2 AND id <> $3',
        [roomId, me, micId]
      );
      await client.query('UPDATE room_mics SET user_id = $2, joined_at = now() WHERE id = $1', [micId, me]);
    });

    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

router.post(
  '/:id/mics/:micId/leave',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const released = await q(
      'UPDATE room_mics SET user_id = NULL, joined_at = NULL WHERE id = $1 AND room_id = $2 AND user_id = $3 RETURNING id',
      [req.params.micId, roomId, me]
    );
    if (!released.length) throw new HttpError(403, 'You are not on this mic', 'not_on_mic');

    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

router.get(
  '/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ messages: await roomMessages(req.params.id) });
  })
);

router.post(
  '/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const body = String(req.body?.body || '').trim().slice(0, 500);
    if (!body) throw new HttpError(400, 'Message is required', 'empty_message');

    const room = await one<{ is_active: boolean }>('SELECT is_active FROM rooms WHERE id = $1', [roomId]);
    if (!room?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

    const inserted = await q<{ id: string }>(
      'INSERT INTO room_messages (room_id, user_id, body) VALUES ($1, $2, $3) RETURNING id',
      [roomId, me, body]
    );
    const message = await roomMessageById(inserted[0].id);
    broadcast('room_message', { roomId, message });
    res.status(201).json({ message });
  })
);

/**
 * Sends a gift to someone sitting on a mic in this room. Money moves exactly like a
 * private-chat gift (sender charged, recipient's earnings credited with the
 * configured share) and the send is posted as a `gift` room message.
 */
router.post(
  '/:id/gifts',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const settings = await getSettings();
    if (!settings.gifts_enabled) throw new HttpError(403, 'Gifts are disabled', 'gifts_disabled');

    const giftId = String(req.body?.giftId || '');
    const recipientId = String(req.body?.recipientId || '');
    const requestId = String(req.body?.requestId || '').trim().slice(0, 80);
    if (!giftId || !recipientId) {
      throw new HttpError(400, 'Gift and recipient are required', 'invalid_gift');
    }
    if (requestId.length < 8) throw new HttpError(400, 'Missing request id', 'invalid_request');
    if (recipientId === me) throw new HttpError(400, 'You cannot gift yourself', 'invalid_recipient');

    const outcome = await tx(async (c) => {
      const seat = await c.query('SELECT 1 FROM room_mics WHERE room_id = $1 AND user_id = $2 LIMIT 1', [
        roomId,
        recipientId,
      ]);
      if (!seat.rowCount) {
        throw new HttpError(404, 'Recipient is not on a mic', 'recipient_not_in_room');
      }

      const giftResult = await c.query<GiftRow>('SELECT * FROM gifts WHERE id = $1 AND is_active = true', [
        giftId,
      ]);
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

      const created = await c.query(
        `INSERT INTO gift_sends
           (request_id, gift_id, sender_id, recipient_id, coins,
            recipient_coins, admin_coins, recipient_percent, admin_percent, gift_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING *`,
        [
          requestId,
          gift.id,
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
        throw new HttpError(409, 'This gift request was already used', 'duplicate_request');
      }
      const send = created.rows[0];

      const moved = await moveCoins(c, {
        userId: me,
        amount: -price,
        type: 'gift_send',
        refType: 'gift_send',
        refId: send.id,
        meta: { giftId: gift.id, giftName: gift.name, recipientId, roomId },
      });
      if (!moved.applied) throw new HttpError(409, 'This gift was already sent', 'duplicate_request');

      if (recipientCoins > 0) {
        await moveProfit(c, {
          userId: recipientId,
          type: 'gift_earning',
          amount: recipientCoins,
          earned: recipientCoins,
          refType: 'gift_send',
          refId: send.id,
          meta: { giftId: gift.id, giftName: gift.name, senderId: me, percent: recipientPercent, roomId },
        });
      }

      const message = await c.query<{ id: string }>(
        `INSERT INTO room_messages (room_id, user_id, body, type, gift_send_id)
         VALUES ($1, $2, $3, 'gift', $4) RETURNING id`,
        [roomId, me, `🎁 ${gift.name}`, send.id]
      );
      return { messageId: message.rows[0].id, recipientCoins };
    });

    const message = await roomMessageById(outcome.messageId);
    broadcast('room_message', { roomId, message });
    emitToUser(me, 'wallet:update', {});
    emitToUser(recipientId, 'profit:update', {});
    res.status(201).json({ message, recipientCoins: outcome.recipientCoins });
  })
);

export default router;
