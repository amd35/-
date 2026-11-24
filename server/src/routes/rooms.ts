import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { broadcast, emitToUser } from '../realtime';
import {
  getRoomDetail,
  listRooms,
  roomAccess,
  roomMessageById,
  roomMessages,
  serializeRoom,
  type RoomRow,
} from '../rooms';
import { notify } from '../notify';
import { GiftRow, moveProfit } from '../gifts';
import { bagQuantity, takeFromBag } from '../giftBag';
import { cupSnapshot, ensureCompetition, recordCupGift } from '../roomCup';
import { ROOM_FRAME_DURATION_SECONDS, listRoomFrames, type RoomFrameRow } from '../roomFrames';
import { awardRoomChatXp, micSlotsForLevel } from '../roomLevels';
import {
  joinRoomMember,
  leaveRoomMember,
  removeRoomMember,
  roomMembershipSnapshot,
  roomStaff,
  toggleRoomLike,
} from '../roomMembers';
import { purchaseRoomUpgrade, roomStoreSnapshot } from '../roomStore';
import { getSettings } from '../settings';
import { pickLuckyPrize } from '../luckyGifts';
import { BIG_GIFT_MIN_DIAMONDS, botCrowdEnters } from '../bigGift';
import { moveCoins, moveGold } from '../wallet';
import { awardXpSafe, getXpSettings, xpForCoins } from '../progression';
import { activeRankFor, isOfficialAdmin } from '../ranks';
import { HttpError, asyncHandler } from '../utils';
import {
  assertCapability,
  detectSpamBurst,
  moderateTextForUser,
} from '../security/service';

const router = Router();

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ rooms: await listRooms(reqUser(req).id) });
  })
);

/** Each user may own a single room; creating it opens 15 seats like the stage. */
router.post(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const name = String(req.body?.name ?? '').trim().slice(0, 60);
    const description = String(req.body?.description ?? '').trim().slice(0, 160);
    if (name.length < 2) throw new HttpError(400, 'Room name is required', 'missing_name');

    const nameCheck = await moderateTextForUser({
      userId: me,
      text: `${name} ${description}`,
      surface: 'room',
    });
    if (!nameCheck.allowed) {
      throw new HttpError(422, nameCheck.reason || 'اسم الغرفة أو وصفها مخالف لسياسة السلامة', 'content_blocked', {
        category: nameCheck.category,
        strike: nameCheck.strike,
        until: nameCheck.until,
      });
    }

    const existing = await one<{ id: string }>(
      'SELECT id FROM rooms WHERE created_by = $1 AND is_active = true LIMIT 1',
      [me]
    );
    if (existing) throw new HttpError(409, 'You already have a room', 'room_exists', { roomId: existing.id });

    const room = await tx(async (client) => {
      const inserted = await client.query<RoomRow>(
        'INSERT INTO rooms (name, description, owner_id, created_by, code) VALUES ($1, $2, $3, $3, (SELECT username FROM users WHERE id = $3)) RETURNING *',
        [name, description, me]
      );
      const created = inserted.rows[0];
      // A new room starts at level 1, which opens the first five mic seats.
      for (let position = 1; position <= micSlotsForLevel(1); position += 1) {
        await client.query('INSERT INTO room_mics (room_id, position, label, kind) VALUES ($1, $2, $3, $4)', [
          created.id,
          position,
          position === 1 ? 'المايك الرئيسي' : `مايك ${position}`,
          position === 1 ? 'host' : 'speaker',
        ]);
      }
      // The owner starts as the room's first member.
      await client.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        created.id,
        me,
      ]);
      return created;
    });

    broadcast('room', { roomId: room.id });
    res.status(201).json({ room: serializeRoom(room) });
  })
);

router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ room: await getRoomDetail(req.params.id, reqUser(req).id) });
  })
);

/** Cup panel: split settings, the running competition, the ranking and past winners. */
router.get(
  '/:id/cup',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await cupSnapshot(req.params.id, reqUser(req).id));
  })
);

/** Frame catalog for the room sheet — a separate system from the gift store. */
router.get(
  '/:id/frames',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const room = await one<{ id: string }>('SELECT id FROM rooms WHERE id = $1 AND is_active = true', [
      req.params.id,
    ]);
    if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');
    const [frames, wallet] = await Promise.all([
      listRoomFrames(),
      one<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = $1', [me]),
    ]);
    res.json({ frames, balance: Number(wallet?.balance ?? 0) });
  })
);

/** Gifts a frame to a member on a mic. Price and duration are decided server-side. */
router.post(
  '/:id/frames/send',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const frameId = String(req.body?.frameId ?? '').trim();
    const recipientId = String(req.body?.recipientId ?? '').trim();
    const requestId = String(req.body?.requestId ?? '').trim().slice(0, 80);
    if (!frameId || !recipientId) {
      throw new HttpError(400, 'Choose a frame and a recipient', 'invalid_frame_gift');
    }
    if (!requestId) throw new HttpError(400, 'Missing request id', 'invalid_request');

    const outcome = await tx(async (c) => {
      const room = await c.query<{ is_active: boolean }>('SELECT is_active FROM rooms WHERE id = $1', [roomId]);
      if (!room.rows[0]?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

      // Only someone sitting on a mic has an avatar to wear the frame.
      const seated = await c.query('SELECT 1 FROM room_mics WHERE room_id = $1 AND user_id = $2 LIMIT 1', [
        roomId,
        recipientId,
      ]);
      if (!seated.rowCount) throw new HttpError(409, 'This member is not on a mic', 'recipient_not_seated');

      const found = await c.query<RoomFrameRow>(
        'SELECT * FROM room_frames WHERE id = $1 AND is_active = true',
        [frameId]
      );
      const frame = found.rows[0];
      if (!frame) throw new HttpError(404, 'Frame not found', 'frame_not_found');
      const price = Number(frame.price);

      const inserted = await c.query<{ id: string; expires_at: string }>(
        `INSERT INTO room_frame_sends
           (request_id, frame_id, frame_name, room_id, sender_id, recipient_id, price, duration_seconds, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::int, now(), now() + ($8::int * interval '1 second'))
         ON CONFLICT (request_id) DO NOTHING
         RETURNING id, expires_at`,
        [requestId, frame.id, frame.name, roomId, me, recipientId, price, ROOM_FRAME_DURATION_SECONDS]
      );
      const send = inserted.rows[0];
      if (!send) throw new HttpError(409, 'This frame request was already used', 'duplicate_request');

      // Charge and grant live in one transaction: a failure rolls the row back and
      // the unique (user, type, ref) ledger row makes a repeated charge impossible.
      if (price > 0) {
        const moved = await moveCoins(c, {
          userId: me,
          amount: -price,
          type: 'room_frame_send',
          refType: 'room_frame_send',
          refId: send.id,
          meta: { frameId: frame.id, frameName: frame.name, recipientId, roomId },
        });
        if (!moved.applied) throw new HttpError(409, 'This frame was already sent', 'duplicate_request');
      }
      return { send, frame, price };
    });

    const frameInfo = {
      userId: recipientId,
      frameId: outcome.frame.id,
      name: outcome.frame.name,
      imageUrl: outcome.frame.image_url,
      expiresAt: outcome.send.expires_at,
      remainingMs: ROOM_FRAME_DURATION_SECONDS * 1000,
    };
    // Everyone in the room receives the same frame at the same moment.
    broadcast('room_frame', { roomId, frame: frameInfo });
    emitToUser(me, 'wallet:update', {});
    res.status(201).json({ frame: frameInfo });
  })
);

router.post(
  '/:id/mics/:micId/take',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const micId = req.params.micId;

    await assertCapability(me, 'mic');

    await tx(async (client) => {
      const room = await client.query<{ is_active: boolean; owner_id: string | null }>(
        'SELECT is_active, owner_id FROM rooms WHERE id = $1 FOR UPDATE',
        [roomId]
      );
      if (!room.rows[0]?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

      const found = await client.query<{ id: string; user_id: string | null; is_locked: boolean; kind: string }>(
        'SELECT id, user_id, is_locked, kind FROM room_mics WHERE id = $1 AND room_id = $2 FOR UPDATE',
        [micId, roomId]
      );
      const seat = found.rows[0];
      if (!seat) throw new HttpError(404, 'Mic not found', 'mic_not_found');
      if (seat.user_id && seat.user_id !== me) throw new HttpError(409, 'This mic is taken', 'mic_taken');
      if (seat.is_locked) throw new HttpError(403, 'This mic is locked', 'mic_locked');

      // One seat per user: release any other seat this user holds in the room first.
      await client.query(
        'UPDATE room_mics SET user_id = NULL, joined_at = NULL, muted = false WHERE room_id = $1 AND user_id = $2 AND id <> $3',
        [roomId, me, micId]
      );
      await client.query(
        'UPDATE room_mics SET user_id = $2, joined_at = now(), muted = false WHERE id = $1',
        [micId, me]
      );
      // Whoever takes the main host mic of an unowned room becomes its owner.
      if (seat.kind === 'host' && !room.rows[0].owner_id) {
        await client.query('UPDATE rooms SET owner_id = $2 WHERE id = $1 AND owner_id IS NULL', [roomId, me]);
      }
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

    await assertCapability(me, 'chat');
    const spam = await detectSpamBurst({ userId: me, roomId, body });
    if (!spam.allowed) {
      throw new HttpError(422, spam.reason || 'تم رفض الرسالة', 'content_blocked', {
        category: spam.category,
        strike: spam.strike,
        until: spam.until,
      });
    }
    const moderation = await moderateTextForUser({ userId: me, text: body, surface: 'room_chat' });
    if (!moderation.allowed) {
      throw new HttpError(422, moderation.reason || 'تم رفض الرسالة لمخالفتها سياسة السلامة', 'content_blocked', {
        category: moderation.category,
        strike: moderation.strike,
        until: moderation.until,
      });
    }

    // Administrative announcements are reserved for the royal admin positions.
    let announcement = false;
    if (req.body?.announcement === true) {
      const rank = await activeRankFor(me);
      if (!isOfficialAdmin(rank)) {
        throw new HttpError(403, 'Official administration only', 'announcement_forbidden');
      }
      announcement = true;
    }

    const inserted = await q<{ id: string }>(
      'INSERT INTO room_messages (room_id, user_id, body, is_announcement) VALUES ($1, $2, $3, $4) RETURNING id',
      [roomId, me, body, announcement]
    );
    const xpSettings = await getXpSettings();
    await awardXpSafe({
      userId: me,
      kind: 'chat',
      refId: inserted[0].id,
      xp: xpSettings.chat_message ?? 0,
    });
    // Room level: only a message that passed moderation counts, and only once.
    await awardRoomChatXp(roomId, me, inserted[0].id);
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
    await assertCapability(me, 'gifts');

    const giftId = String(req.body?.giftId || '');
    const recipientId = String(req.body?.recipientId || '');
    const requestId = String(req.body?.requestId || '').trim().slice(0, 80);
    if (!giftId || !recipientId) {
      throw new HttpError(400, 'Gift and recipient are required', 'invalid_gift');
    }
    if (requestId.length < 8) throw new HttpError(400, 'Missing request id', 'invalid_request');
    // One send can carry several copies of the same gift (1 … 2000).
    const quantity = Math.min(2000, Math.max(1, Math.trunc(Number(req.body?.quantity) || 1)));
    if (recipientId === me) throw new HttpError(400, 'You cannot gift yourself', 'invalid_recipient');
    // «جنطة الهدايا»: sending an owned gift takes copies from the bag instead of
    // charging the sender, because the package recharge already paid for them.
    const fromBag = req.body?.fromBag === true;

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
      // The admin prices each gift: diamonds unless he marked this one as gold.
      const currency = gift.currency === 'gold' ? 'gold' : 'diamond';
      if (currency === 'gold' && !settings.gold_gifts_enabled) {
        throw new HttpError(403, 'Gold gifts are disabled', 'gold_gifts_disabled');
      }

      const roomRow = await c.query<{ owner_id: string | null }>(
        'SELECT owner_id FROM rooms WHERE id = $1',
        [roomId]
      );
      const ownerId = roomRow.rows[0]?.owner_id ?? null;
      // The room owner earns a share of every room gift (0 when the owner is the
      // recipient or the room has no owner); the administration keeps the rest.
      const hostId = ownerId && ownerId !== recipientId ? ownerId : null;

      const percent =
        gift.recipient_percent === null
          ? settings.gift_recipient_percent
          : Number(gift.recipient_percent);
      const recipientPercent = Math.min(100, Math.max(0, Math.trunc(percent)));
      const requestedHost = Math.trunc(
        gift.host_percent === null ? settings.gift_host_percent : Number(gift.host_percent)
      );
      const hostPercent = hostId
        ? Math.min(100 - recipientPercent, Math.max(0, requestedHost))
        : 0;
      const adminPercent = 100 - recipientPercent - hostPercent;
      const price = Number(gift.price) * quantity;
      const recipientCoins = Math.floor((price * recipientPercent) / 100);
      const hostCoins = Math.floor((price * hostPercent) / 100);
      const adminCoins = price - recipientCoins - hostCoins;

      const created = await c.query(
        `INSERT INTO gift_sends
           (request_id, gift_id, sender_id, recipient_id, coins,
            recipient_coins, admin_coins, recipient_percent, admin_percent, gift_name, quantity, room_id,
            currency, host_id, host_coins, host_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          quantity,
          roomId,
          currency,
          hostId,
          hostCoins,
          hostPercent,
        ]
      );
      if (!created.rowCount) {
        throw new HttpError(409, 'This gift request was already used', 'duplicate_request');
      }
      const send = created.rows[0];

      if (fromBag) {
        // One copy per gift leaves the bag in the same transaction as the send row.
        await takeFromBag(c, me, gift.id, quantity);
      } else {
        const moved =
          currency === 'gold'
            ? await moveGold(c, {
                userId: me,
                amount: -price,
                type: 'gift_send',
                refType: 'gift_send',
                refId: send.id,
                meta: { giftId: gift.id, giftName: gift.name, recipientId, roomId },
              })
            : await moveCoins(c, {
                userId: me,
                amount: -price,
                type: 'gift_send',
                refType: 'gift_send',
                refId: send.id,
                meta: { giftId: gift.id, giftName: gift.name, recipientId, roomId },
              });
        if (!moved.applied) throw new HttpError(409, 'This gift was already sent', 'duplicate_request');
      }

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

      if (hostId && hostCoins > 0) {
        await moveProfit(c, {
          userId: hostId,
          type: 'gift_host_earning',
          amount: hostCoins,
          earned: hostCoins,
          refType: 'gift_send',
          refId: send.id,
          meta: {
            giftId: gift.id,
            giftName: gift.name,
            senderId: me,
            recipientId,
            percent: hostPercent,
            roomId,
          },
        });
      }

      // Room cup: one ledger row per send splits the spent gold between the room
      // owner and the administration, and the room gets a running competition.
      const cup = await recordCupGift(
        c,
        {
          giftSendId: send.id,
          roomId,
          senderId: me,
          recipientId,
          coins: price,
          hostId,
          hostCoins,
          hostPercent,
        },
        settings
      );
      if (settings.cup_enabled) await ensureCompetition(c, roomId, settings);

      const message = await c.query<{ id: string }>(
        `INSERT INTO room_messages (room_id, user_id, body, type, gift_send_id)
         VALUES ($1, $2, $3, 'gift', $4) RETURNING id`,
        [roomId, me, `🎁 ${gift.name}${quantity > 1 ? ` × ${quantity}` : ''}`, send.id]
      );
      return {
        messageId: message.rows[0].id,
        recipientCoins,
        hostCoins,
        hostId,
        coins: price,
        currency,
        sendId: send.id,
        giftId: gift.id,
        giftRarity: gift.rarity,
        cup,
      };
    });

    const xpSettings = await getXpSettings();
    await awardXpSafe({
      userId: me,
      kind: 'gift',
      refId: outcome.sendId,
      xp: xpForCoins('gift', Number(outcome.coins), xpSettings),
    });

    const message = await roomMessageById(outcome.messageId);
    broadcast('room_message', { roomId, message });

    const recipient = await one<{
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }>('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [recipientId]);
    const recipientName = recipient?.display_name || recipient?.username || '';
    const roomInfo = await one<{ name: string }>('SELECT name FROM rooms WHERE id = $1', [roomId]);

    // Gift ticker: every room gift sweeps across every open screen — inside any
    // room too — and tapping it opens the room the gift was sent in.
    broadcast('room_gift_ticker', {
      id: outcome.sendId,
      roomId,
      roomName: roomInfo?.name ?? '',
      senderName: message?.displayName ?? '',
      senderAvatar: message?.avatarUrl ?? null,
      recipientName,
      recipientAvatar: recipient?.avatar_url ?? null,
      giftName: message?.gift?.name ?? '',
      gift: message?.gift
        ? {
            name: message.gift.name,
            design: message.gift.design,
            videoUrl: message.gift.videoUrl,
            coverUrl: message.gift.coverUrl,
            rarity: message.gift.rarity,
          }
        : null,
      coins: Number(outcome.coins) || 0,
      quantity,
    });

    // «هدية المليون»: a diamond gift worth a million or more is an app-wide
    // event. Its strip sweeps every room and every screen, the bot share of the
    // crowd walks in, and the rest are real members who tap the strip to join.
    if (outcome.currency === 'diamond' && Number(outcome.coins) >= BIG_GIFT_MIN_DIAMONDS) {
      const entrants = await botCrowdEnters(roomId);
      broadcast('room_big_gift', {
        id: outcome.sendId,
        roomId,
        roomName: roomInfo?.name ?? '',
        senderName: message?.displayName ?? '',
        recipientName,
        giftName: message?.gift?.name ?? '',
        gift: message?.gift
          ? {
              name: message.gift.name,
              design: message.gift.design,
              videoUrl: message.gift.videoUrl,
              coverUrl: message.gift.coverUrl,
              rarity: message.gift.rarity,
            }
          : null,
        coins: Number(outcome.coins) || 0,
        quantity,
        entrants,
      });
      if (entrants.length) broadcast('room_members', { roomId });
    }

    // Gift announcement bar. Only a committed send reaches this point, so a
    // failed payment can never produce a phantom announcement. The admin picks
    // whether every gift or only a chosen subset is announced, and how it looks.
    const announced =
      settings.gift_announcements_enabled &&
      (settings.gift_announcement_scope === 'all' ||
        settings.gift_announcement_gift_ids.includes(outcome.giftId));
    if (announced && message?.gift) {
      broadcast('room_gift_announcement', {
        roomId,
        announcement: {
          id: outcome.sendId,
          roomId,
          sender: { id: me, name: message.displayName, avatarUrl: message.avatarUrl },
          recipient: {
            id: recipientId,
            name: recipient?.display_name || recipient?.username || '',
            avatarUrl: recipient?.avatar_url ?? null,
          },
          gift: message.gift,
          quantity,
          coins: outcome.coins,
          style: {
            duration: settings.gift_announcement_duration,
            effects: settings.gift_announcement_effects,
            color: settings.gift_announcement_color,
            glow: settings.gift_announcement_glow,
            effect: settings.gift_announcement_rarity_effects?.[outcome.giftRarity] ?? 'medium',
          },
        },
      });
    }

    emitToUser(me, 'wallet:update', {});
    emitToUser(recipientId, 'profit:update', {});
    if (outcome.hostId && outcome.hostCoins > 0) emitToUser(outcome.hostId, 'profit:update', {});
    if (outcome.cup?.ownerId) emitToUser(outcome.cup.ownerId, 'profit:update', {});
    if (settings.cup_enabled) broadcast('room_cup', { roomId });
    res.status(201).json({
      message,
      recipientCoins: outcome.recipientCoins,
      hostCoins: outcome.hostCoins,
      currency: outcome.currency,
      fromBag,
      bagLeft: fromBag ? await bagQuantity(me, outcome.giftId) : null,
    });
  })
);

/**
 * «هدايا الحظ»: one paid try per spin. The server charges the diamonds, draws the
 * prize with the admin's weights, credits it and announces the result to the room.
 * `requestId` keeps a retried request from charging (or paying) twice.
 */
router.post(
  '/:id/lucky-gifts',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const settings = await getSettings();
    if (!settings.gifts_enabled || !settings.lucky_gift_enabled) {
      throw new HttpError(403, 'Lucky gifts are disabled', 'lucky_gifts_disabled');
    }
    await assertCapability(me, 'gifts');

    const requestId = String(req.body?.requestId || '').trim().slice(0, 80);
    if (requestId.length < 8) throw new HttpError(400, 'Missing request id', 'invalid_request');

    const room = await one<{ is_active: boolean }>('SELECT is_active FROM rooms WHERE id = $1', [roomId]);
    if (!room?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
    const price = Math.max(1, Math.trunc(Number(settings.lucky_gift_price) || 1000));

    const outcome = await tx(async (c) => {
      const existing = await c.query('SELECT * FROM lucky_gift_spins WHERE request_id = $1', [requestId]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.user_id !== me) {
          throw new HttpError(409, 'This request was already used', 'duplicate_request');
        }
        return { spin: row, duplicate: true };
      }

      const draw = pickLuckyPrize(settings.lucky_gift_prizes);
      const inserted = await c.query(
        `INSERT INTO lucky_gift_spins (request_id, room_id, user_id, cost, prize, tier_index)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING *`,
        [requestId, roomId, me, price, draw.tier.amount, draw.index]
      );
      if (!inserted.rowCount) {
        throw new HttpError(409, 'This request was already used', 'duplicate_request');
      }
      const spin = inserted.rows[0];

      // Charge first: moveCoins throws 402 when the balance cannot cover the try.
      const charged = await moveCoins(c, {
        userId: me,
        amount: -price,
        type: 'lucky_gift',
        refType: 'lucky_gift_spin',
        refId: spin.id,
        meta: { roomId, prize: draw.tier.amount },
      });
      if (!charged.applied) {
        throw new HttpError(409, 'This request was already used', 'duplicate_request');
      }

      if (draw.tier.amount > 0) {
        await moveCoins(c, {
          userId: me,
          amount: draw.tier.amount,
          type: 'lucky_gift_prize',
          refType: 'lucky_gift_spin',
          refId: spin.id,
          meta: { roomId, cost: price },
        });
      }
      return { spin, duplicate: false };
    });

    const cost = Number(outcome.spin.cost);
    const prize = Number(outcome.spin.prize);
    if (!outcome.duplicate) {
      const winner = await one<{
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }>('SELECT display_name, username, avatar_url FROM users WHERE id = $1', [me]);
      broadcast('room_lucky_gift', {
        roomId,
        spin: {
          id: outcome.spin.id,
          userId: me,
          name: winner?.display_name || winner?.username || '',
          avatarUrl: winner?.avatar_url ?? null,
          cost,
          prize,
          createdAt: outcome.spin.created_at,
        },
      });
      emitToUser(me, 'wallet:update', {});
    }

    res.status(201).json({
      spin: { id: outcome.spin.id, cost, prize, createdAt: outcome.spin.created_at },
      duplicate: outcome.duplicate,
    });
  })
);

/** Loads the room + caller access, or throws when the caller may not moderate. */
async function moderateAccess(roomId: string, me: string) {
  const room = await one<{ owner_id: string | null; is_active: boolean }>(
    'SELECT owner_id, is_active FROM rooms WHERE id = $1',
    [roomId]
  );
  if (!room?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
  const access = await roomAccess(roomId, me, room.owner_id);
  if (!access.canModerate) throw new HttpError(403, 'You cannot moderate this room', 'not_moderator');
  return { room, access };
}

/** Mute/unmute a seat. The occupant may mute themselves; staff may mute anyone. */
router.post(
  '/:id/mics/:micId/mute',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const muted = Boolean(req.body?.muted);
    const seat = await one<{ user_id: string | null }>(
      'SELECT user_id FROM room_mics WHERE id = $1 AND room_id = $2',
      [req.params.micId, roomId]
    );
    if (!seat) throw new HttpError(404, 'Mic not found', 'mic_not_found');
    if (seat.user_id !== me) {
      await moderateAccess(roomId, me);
    }
    await q('UPDATE room_mics SET muted = $2 WHERE id = $1 AND room_id = $3', [
      req.params.micId,
      muted,
      roomId,
    ]);
    if (seat.user_id && seat.user_id !== me) {
      emitToUser(seat.user_id, 'room:force_mute', { roomId, micId: req.params.micId, muted });
    }
    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/** Lock a seat so nobody can take it (staff only). */
router.post(
  '/:id/mics/:micId/lock',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    await moderateAccess(roomId, me);
    const locked = Boolean(req.body?.locked);
    const updated = await q(
      'UPDATE room_mics SET is_locked = $2 WHERE id = $1 AND room_id = $3 RETURNING id',
      [req.params.micId, locked, roomId]
    );
    if (!updated.length) throw new HttpError(404, 'Mic not found', 'mic_not_found');
    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/** Remove the occupant from a seat (staff only). */
router.post(
  '/:id/mics/:micId/kick',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    await moderateAccess(roomId, me);
    const seat = await one<{ user_id: string | null }>(
      'SELECT user_id FROM room_mics WHERE id = $1 AND room_id = $2',
      [req.params.micId, roomId]
    );
    if (!seat) throw new HttpError(404, 'Mic not found', 'mic_not_found');
    if (seat.user_id) {
      await q('UPDATE room_mics SET user_id = NULL, joined_at = NULL, muted = false WHERE id = $1', [
        req.params.micId,
      ]);
      emitToUser(seat.user_id, 'room:kicked', { roomId, micId: req.params.micId });
    }
    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/** Temporarily ban someone: supervisors up to 2 hours, owner/vice-owner up to a year. */
router.post(
  '/:id/bans',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const { room, access } = await moderateAccess(roomId, me);
    const userId = String(req.body?.userId || '');
    const hours = Math.floor(Number(req.body?.hours));
    if (!userId || !Number.isFinite(hours) || hours <= 0) {
      throw new HttpError(400, 'Invalid ban', 'invalid_ban');
    }
    const maxHours = access.canManage ? 24 * 365 : 2;
    if (hours > maxHours) {
      throw new HttpError(403, `المشرف يستطيع الحظر ${maxHours} ساعة كحد أقصى`, 'ban_too_long');
    }
    if (userId === room.owner_id) throw new HttpError(403, 'لا يمكن حظر صاحب الغرفة', 'cannot_ban_owner');
    const target = await one('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (!target) throw new HttpError(404, 'User not found', 'user_not_found');
    const staffRow = await one<{ role: string }>(
      'SELECT role FROM room_roles WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    if (staffRow && !access.canManage) {
      throw new HttpError(403, 'لا يمكن للمشرف حظر إدارة الغرفة', 'cannot_ban_staff');
    }
    await q(
      `INSERT INTO room_bans (room_id, user_id, until, banned_by)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval, $4)
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET until = EXCLUDED.until, banned_by = EXCLUDED.banned_by`,
      [roomId, userId, hours, me]
    );
    await q(
      'UPDATE room_mics SET user_id = NULL, joined_at = NULL, muted = false WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    await removeRoomMember(roomId, userId);
    emitToUser(userId, 'room:banned', { roomId, hours });
    broadcast('room', { roomId });
    broadcast('room_members', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/** Grant or revoke a delegated room role (owner only). */
router.post(
  '/:id/roles',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const room = await one<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [roomId]);
    if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');
    const access = await roomAccess(roomId, me, room.owner_id);
    // The room owner and official platform administration manage the staff.
    if (access.role !== 'owner' && access.role !== 'admin') {
      throw new HttpError(403, 'Only the room owner can do this', 'not_owner');
    }
    const userId = String(req.body?.userId || '');
    const role = String(req.body?.role || '');
    if (!userId) throw new HttpError(400, 'A member is required', 'missing_member');
    if (userId === room.owner_id) throw new HttpError(400, 'The owner already runs the room', 'owner');
    if (!role) {
      await q('DELETE FROM room_roles WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
    } else if (role === 'admin' || role === 'supervisor') {
      // Staff seats are limited by the room's level, so the panel cannot over-appoint.
      const staff = await roomStaff(roomId);
      const current = await one<{ role: string }>(
        'SELECT role FROM room_roles WHERE room_id = $1 AND user_id = $2',
        [roomId, userId]
      );
      if (current?.role !== role) {
        const limit = role === 'admin' ? staff.viceLimit : staff.supervisorLimit;
        const used = role === 'admin' ? staff.viceCount : staff.supervisorCount;
        if (used >= limit) {
          throw new HttpError(
            409,
            role === 'admin'
              ? `الحد الأقصى لنواب المالك ${limit} — يُفتح عند وصول مستوى الغرفة إلى 40000`
              : `الحد الأقصى للمشرفين ${limit} — رقّي الغرفة لزيادة عدد المشرفين`,
            'staff_limit',
            { role, limit, used, level: staff.level }
          );
        }
      }
      await q(
        `INSERT INTO room_roles (room_id, user_id, role, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by`,
        [roomId, userId, role, me]
      );
      await notify(
        userId,
        'room_role',
        role === 'admin' ? 'تم تعيينك مديراً للغرفة' : 'تم تعيينك مشرفاً في الغرفة',
        '',
        { roomId, role }
      );
    } else {
      throw new HttpError(400, 'Unknown role', 'invalid_role');
    }
    broadcast('room', { roomId });
    // The member panel shows each role, so it refreshes with the staff change.
    broadcast('room_members', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/**
 * Member list, capacity and the heart — everything the room image opens.
 * Presence (visitors) is pushed separately over the websocket.
 */
router.get(
  '/:id/members',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await roomMembershipSnapshot(req.params.id, reqUser(req).id));
  })
);

/**
 * Room notes (ملاحظات الغرفة): the upgrades the room owns and the gifts sent
 * inside it. Members only — a visitor in the room gets 403.
 */
router.get(
  '/:id/notes',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    // Members and the room's own staff (owner, vice-owner, supervisor) only.
    const access = await one<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)
           OR EXISTS (SELECT 1 FROM rooms WHERE id = $1 AND (owner_id = $2 OR created_by = $2))
           OR EXISTS (SELECT 1 FROM room_roles WHERE room_id = $1 AND user_id = $2) AS ok`,
      [roomId, me]
    );
    if (!access?.ok) throw new HttpError(403, 'Notes are for room members only', 'not_member');

    const upgrades = await q<{ name: string; price_paid: number; created_at: string }>(
      `SELECT t.name, u.price_paid, u.created_at
       FROM room_upgrades u
       JOIN room_upgrade_tiers t ON t.id = u.tier_id
       WHERE u.room_id = $1
       ORDER BY u.created_at DESC
       LIMIT 30`,
      [roomId]
    );
    const gifts = await q<{
      id: string;
      gift_name: string;
      quantity: number;
      coins: number;
      currency: string;
      created_at: string;
      sender_name: string | null;
      recipient_name: string | null;
    }>(
      `SELECT g.id, g.gift_name, g.quantity, g.coins, g.currency, g.created_at,
              s.display_name AS sender_name, r.display_name AS recipient_name
       FROM gift_sends g
       JOIN users s ON s.id = g.sender_id
       JOIN users r ON r.id = g.recipient_id
       WHERE g.room_id = $1
       ORDER BY g.created_at DESC
       LIMIT 40`,
      [roomId]
    );

    res.json({
      upgrades: upgrades.map((row) => ({
        name: row.name,
        price: Number(row.price_paid),
        at: row.created_at,
      })),
      gifts: gifts.map((row) => ({
        id: row.id,
        name: row.gift_name,
        quantity: Number(row.quantity),
        coins: Number(row.coins),
        currency: row.currency,
        sender: row.sender_name || '',
        recipient: row.recipient_name || '',
        at: row.created_at,
      })),
    });
  })
);

/** Join the room as a member. The capacity check runs server-side. */
router.post(
  '/:id/members/join',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    await joinRoomMember(roomId, me);
    broadcast('room_members', { roomId });
    broadcast('room', { roomId });
    res.status(201).json(await roomMembershipSnapshot(roomId, me));
  })
);

/** Leave the membership (the user stays a visitor while the room is open). */
router.post(
  '/:id/members/leave',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    await leaveRoomMember(roomId, me);
    broadcast('room_members', { roomId });
    res.json(await roomMembershipSnapshot(roomId, me));
  })
);

/** «حفظ الغرفة» — pins the room to the app's floating bubble. Toggles on each call. */
router.post(
  '/:id/save',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const removed = await q(
      'DELETE FROM saved_rooms WHERE user_id = $1 AND room_id = $2 RETURNING room_id',
      [me, roomId]
    );
    if (removed.length) {
      res.json({ saved: false });
      return;
    }
    const room = await one('SELECT 1 FROM rooms WHERE id = $1 AND is_active = true', [roomId]);
    if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');
    await q('INSERT INTO saved_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me, roomId]);
    res.json({ saved: true });
  })
);

/** The heart in the member list. */
router.post(
  '/:id/like',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    const state = await toggleRoomLike(roomId, reqUser(req).id);
    broadcast('room_members', { roomId });
    res.json(state);
  })
);

/** Remove a member from the room (owner / vice-owner). Frees their mic too. */
router.post(
  '/:id/members/:userId/remove',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const room = await one<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [roomId]);
    if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');
    const access = await roomAccess(roomId, me, room.owner_id);
    if (!access.canManage) throw new HttpError(403, 'Room management only', 'not_manager');

    const userId = req.params.userId;
    await removeRoomMember(roomId, userId);
    emitToUser(userId, 'room:removed', { roomId });
    broadcast('room_members', { roomId });
    broadcast('room', { roomId });
    res.json(await roomMembershipSnapshot(roomId, me));
  })
);

/** The room's own store: the admin-defined upgrades and what the room owns. */
router.get(
  '/:id/store',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await roomStoreSnapshot(req.params.id, reqUser(req).id));
  })
);

/** Buy an upgrade with diamonds (room owner only). */
router.post(
  '/:id/store/:tierId/purchase',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const tier = await purchaseRoomUpgrade(roomId, req.params.tierId, me);
    broadcast('room', { roomId });
    broadcast('room_members', { roomId });
    emitToUser(me, 'wallet:update', {});
    res.status(201).json({ ...(await roomStoreSnapshot(roomId, me)), purchased: { id: tier.id, name: tier.name } });
  })
);

/** Room stage settings: background, shared music, country/language (staff only). */
router.post(
  '/:id/settings',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const room = await one<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [roomId]);
    if (!room) throw new HttpError(404, 'Room not found', 'room_not_found');
    const access = await roomAccess(roomId, me, room.owner_id);
    if (!access.canManage) throw new HttpError(403, 'Only room management can do this', 'not_manager');

    const name = req.body?.name === undefined ? null : String(req.body.name).trim().slice(0, 60);
    if (name !== null && name.length < 2) throw new HttpError(400, 'اسم الغرفة قصير جداً', 'missing_name');
    if (name) {
      const nameCheck = await moderateTextForUser({ userId: me, text: name, surface: 'room' });
      if (!nameCheck.allowed) {
        throw new HttpError(422, nameCheck.reason || 'اسم الغرفة مخالف لسياسة السلامة', 'content_blocked', {
          category: nameCheck.category,
          strike: nameCheck.strike,
          until: nameCheck.until,
        });
      }
    }

    const background = req.body?.background === undefined ? null : String(req.body.background).slice(0, 500);
    const coverUrl = req.body?.coverUrl === undefined ? null : String(req.body.coverUrl).trim().slice(0, 500);
    const avatarUrl = req.body?.avatarUrl === undefined ? null : String(req.body.avatarUrl).trim().slice(0, 500);
    const musicUrl =
      req.body?.musicUrl === undefined ? null : String(req.body.musicUrl).trim().slice(0, 500) || '';
    const country = req.body?.country === undefined ? null : String(req.body.country).trim().slice(0, 60);
    const language = req.body?.language === undefined ? null : String(req.body.language).trim().slice(0, 60);

    await q(
      `UPDATE rooms SET
         name = COALESCE(NULLIF($7, ''), name),
         background = COALESCE($2, background),
         cover_url = CASE WHEN $3::text IS NULL THEN cover_url ELSE NULLIF($3, '') END,
         avatar_url = CASE WHEN $8::text IS NULL THEN avatar_url ELSE NULLIF($8, '') END,
         music_url = CASE WHEN $4::text IS NULL THEN music_url ELSE NULLIF($4, '') END,
         country = COALESCE(NULLIF($5, ''), country),
         language = COALESCE(NULLIF($6, ''), language)
       WHERE id = $1`,
      [roomId, background, coverUrl, musicUrl, country, language, name, avatarUrl]
    );
    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

/** Invite a user to the room through an in-app notification. */
router.post(
  '/:id/invite',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const userId = String(req.body?.userId || '');
    if (!userId || userId === me) throw new HttpError(400, 'Pick a user to invite', 'invalid_recipient');
    const room = await one<{ name: string; is_active: boolean }>(
      'SELECT name, is_active FROM rooms WHERE id = $1',
      [roomId]
    );
    if (!room?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
    const target = await one('SELECT 1 FROM users WHERE id = $1 AND is_banned = false', [userId]);
    if (!target) throw new HttpError(404, 'User not found', 'user_not_found');

    await notify(userId, 'room_invite', `دعوة إلى غرفة «${room.name}»`, '', {
      roomId,
      roomName: room.name,
      from: me,
    });
    res.status(201).json({ ok: true });
  })
);

/** Clear the whole room chat — owner or vice-owner only. */
router.post(
  '/:id/messages/clear',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const { access } = await moderateAccess(roomId, me);
    if (!access.canManage) {
      throw new HttpError(403, 'Only the owner or a vice-owner can clear the chat', 'not_room_manager');
    }
    await q('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
    broadcast('room_messages_cleared', { roomId });
    res.json({ ok: true });
  })
);

/** Delete one room message (staff only). */
router.post(
  '/:id/messages/:messageId/delete',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    await moderateAccess(roomId, me);
    const deleted = await q(
      'DELETE FROM room_messages WHERE id = $1 AND room_id = $2 RETURNING id',
      [req.params.messageId, roomId]
    );
    if (!deleted.length) throw new HttpError(404, 'Message not found', 'message_not_found');
    broadcast('room_message_deleted', { roomId, messageId: req.params.messageId });
    res.json({ ok: true });
  })
);

export default router;
