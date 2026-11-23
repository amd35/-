import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { botIntro, botUserId, ensureBotConversation, scheduleBotReply } from '../bot';
import { emitToUser, isOnline } from '../realtime';
import { notify } from '../notify';
import {
  FRAME_FIELDS,
  RANK_FIELDS,
  VIP_FIELDS,
  frameFromRow,
  frameJoins,
  rankFromRow,
  rankJoins,
  toPublicUser,
  vipFromRow,
  vipJoins,
} from '../serializers';
import { GIFT_MESSAGE_FIELDS, GIFT_MESSAGE_JOINS, giftFromMessageRow } from '../gifts';
import { awardXpSafe, getXpSettings } from '../progression';
import {
  markSupportReadByUser,
  noteUserSupportMessage,
  registerSupportConversation,
  supportUserId,
} from '../support';
import { HttpError, asyncHandler, intParam, isUuid } from '../utils';
import {
  assertCapability,
  detectSpamBurst,
  moderateAttachmentForUser,
  moderateTextForUser,
} from '../security/service';

const router = Router();

async function assertMember(conversationId: string, userId: string) {
  if (!isUuid(conversationId)) throw new HttpError(404, 'Conversation not found', 'conversation_not_found');
  const member = await one<{ conversation_id: string }>(
    'SELECT conversation_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!member) throw new HttpError(404, 'Conversation not found', 'conversation_not_found');
}

// Lina, the in-app companion: her intro card and her private chat.
router.get(
  '/bot',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await botIntro(reqUser(req).id));
  })
);

router.get(
  '/conversations',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await ensureBotConversation(me);
    const rows = await q(
      `SELECT c.id, c.last_message_at,
              peer.id AS peer_id, peer.username AS peer_username, peer.display_name AS peer_name,
              peer.avatar_url AS peer_avatar, peer.last_seen_at AS peer_last_seen, peer.level AS peer_level,
              peer.is_support AS peer_is_support,
              ${FRAME_FIELDS},
              ${RANK_FIELDS}, ${VIP_FIELDS},
              lm.body AS last_body, lm.type AS last_type, lm.sender_id AS last_sender,
              lm.created_at AS last_at, lm.attachment_url AS last_attachment,
              (SELECT count(*)::int FROM messages m2
                 WHERE m2.conversation_id = c.id AND m2.sender_id <> $1 AND m2.read_at IS NULL) AS unread
       FROM conversations c
       JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = $1
       JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id <> $1
       JOIN users peer ON peer.id = other.user_id
       ${frameJoins('peer')}
       ${rankJoins('peer')}
       ${vipJoins('peer')}
       LEFT JOIN LATERAL (
         SELECT body, type, sender_id, created_at, attachment_url
         FROM messages m WHERE m.conversation_id = c.id
         ORDER BY m.created_at DESC LIMIT 1
       ) lm ON true
       ORDER BY peer.is_support DESC, c.last_message_at DESC
       LIMIT 100`,
      [me]
    );
    res.json({
      conversations: rows.map((row) => ({
        id: row.id,
        lastMessageAt: row.last_message_at,
        unread: Number(row.unread || 0),
        peer: {
          id: row.peer_id,
          username: row.peer_username,
          displayName: row.peer_name,
          avatarUrl: row.peer_avatar,
          frame: frameFromRow(row),
          rank: rankFromRow(row),
          level: Number(row.peer_level ?? 1) || 1,
          vip: vipFromRow(row),
          online: isOnline(row.peer_id),
          lastSeenAt: row.peer_last_seen,
          isSupport: Boolean(row.peer_is_support),
        },
        lastMessage: row.last_at
          ? {
              body: row.last_body,
              type: row.last_type,
              attachmentUrl: row.last_attachment,
              mine: row.last_sender === me,
              createdAt: row.last_at,
            }
          : null,
      })),
    });
  })
);

router.post(
  '/conversations',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await assertCapability(me, 'chat');
    const peerId = String(req.body?.userId || '');
    if (!peerId || peerId === me) throw new HttpError(400, 'Invalid user', 'invalid_target');

    const peer = await one<{ id: string; is_banned: boolean }>(
      'SELECT id, is_banned FROM users WHERE id = $1',
      [peerId]
    );
    if (!peer || peer.is_banned) throw new HttpError(404, 'User not found', 'user_not_found');
    const blocked = await one(
      `SELECT 1 FROM blocked_users
       WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
      [me, peerId]
    );
    if (blocked) throw new HttpError(403, 'You cannot message this user', 'blocked');

    const existing = await one<{ id: string }>(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
       WHERE c.type = 'direct' LIMIT 1`,
      [me, peerId]
    );
    if (existing) {
      if (peerId === (await supportUserId())) {
        await registerSupportConversation(me, existing.id);
      }
      res.json({ conversationId: existing.id, created: false });
      return;
    }

    const created = await tx(async (c) => {
      const { rows } = await c.query('INSERT INTO conversations (type) VALUES ($1) RETURNING id', [
        'direct',
      ]);
      const conversationId = rows[0].id as string;
      await c.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
        [conversationId, me, peerId]
      );
      return conversationId;
    });
    if (peerId === (await supportUserId())) {
      await registerSupportConversation(me, created);
    }
    res.status(201).json({ conversationId: created, created: true });
  })
);

router.get(
  '/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const conversationId = req.params.id;
    await assertMember(conversationId, me);
    const limit = intParam(req.query.limit, 50, 1, 100);
    const before = req.query.before ? String(req.query.before) : null;
    const params: unknown[] = [conversationId];
    let sql = `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.type, m.attachment_url,
                      m.attachment_name, m.created_at, m.delivered_at, m.read_at, ${GIFT_MESSAGE_FIELDS}
               FROM messages m ${GIFT_MESSAGE_JOINS}
               WHERE m.conversation_id = $1`;
    if (before) {
      params.push(before);
      sql += ` AND m.created_at < $${params.length}`;
    }
    sql += ` ORDER BY m.created_at DESC LIMIT ${limit}`;
    const rows = await q(sql, params);
    const peer = await one<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      last_seen_at: string | null;
      frame_id: string | null;
      frame_design: string | null;
      frame_kind: string | null;
      frame_image_url: string | null;
      frame_rarity: string | null;
    }>(
      `SELECT u.id, u.username, u.level, u.display_name, u.avatar_url, u.last_seen_at, u.is_support, ${FRAME_FIELDS},
              ${RANK_FIELDS}, ${VIP_FIELDS}
       FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       ${frameJoins('u')}
       ${rankJoins('u')}
       ${vipJoins('u')}
       WHERE cm.conversation_id = $1 AND cm.user_id <> $2 LIMIT 1`,
      [conversationId, me]
    );
    res.json({
      messages: rows
        .map((row) => ({
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          body: row.body,
          type: row.type,
          attachmentUrl: row.attachment_url,
          attachmentName: row.attachment_name,
          createdAt: row.created_at,
          deliveredAt: row.delivered_at,
          readAt: row.read_at,
          mine: row.sender_id === me,
          gift: giftFromMessageRow(row),
        }))
        .reverse(),
      peer: peer ? toPublicUser(peer) : null,
      hasMore: rows.length === limit,
    });
  })
);

router.post(
  '/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const conversationId = req.params.id;
    await assertMember(conversationId, me);

    const peer = await one<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 LIMIT 1',
      [conversationId, me]
    );
    if (peer) {
      const blocked = await one(
        `SELECT 1 FROM blocked_users
         WHERE (user_id = $1 AND blocked_id = $2) OR (user_id = $2 AND blocked_id = $1)`,
        [me, peer.user_id]
      );
      if (blocked) throw new HttpError(403, 'You cannot message this user', 'blocked');
    }

    const body = String(req.body?.body || '').slice(0, 4000);
    const type = ['text', 'image', 'file', 'video', 'audio'].includes(String(req.body?.type))
      ? String(req.body.type)
      : 'text';
    const attachmentUrl = req.body?.attachmentUrl ? String(req.body.attachmentUrl) : null;
    const attachmentName = req.body?.attachmentName ? String(req.body.attachmentName) : null;
    if (!body.trim() && !attachmentUrl) {
      throw new HttpError(400, 'Message is empty', 'empty_message');
    }

    // YALLA PHONE AI SECURITY — the message is scanned before it is stored.
    await assertCapability(me, 'chat');
    if (body.trim()) {
      const spam = await detectSpamBurst({ userId: me, conversationId, body });
      if (!spam.allowed) {
        throw new HttpError(422, spam.reason || 'تم رفض الرسالة', 'content_blocked', {
          category: spam.category,
          strike: spam.strike,
          until: spam.until,
          violationId: spam.violationId,
        });
      }
      const moderation = await moderateTextForUser({ userId: me, text: body, surface: 'private_chat' });
      if (!moderation.allowed) {
        throw new HttpError(422, moderation.reason || 'تم رفض الرسالة لمخالفتها سياسة السلامة', 'content_blocked', {
          category: moderation.category,
          strike: moderation.strike,
          until: moderation.until,
          violationId: moderation.violationId,
        });
      }
    }
    if (attachmentUrl) {
      const media = await moderateAttachmentForUser({
        userId: me,
        url: attachmentUrl,
        filename: attachmentName,
        surface: 'private_chat',
      });
      if (!media.allowed) {
        throw new HttpError(422, media.reason || 'تم رفض المرفق', 'content_blocked', {
          category: 'media_blocked',
        });
      }
    }

    const message = await tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO messages (conversation_id, sender_id, body, type, attachment_url, attachment_name)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [conversationId, me, body, type, attachmentUrl, attachmentName]
      );
      await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [
        conversationId,
      ]);
      return rows[0];
    });

    // The recipient is online, so the message is delivered the moment it is sent.
    let deliveredAt: string | null = null;
    if (peer && isOnline(peer.user_id)) {
      const delivered = await one<{ delivered_at: string }>(
        'UPDATE messages SET delivered_at = now() WHERE id = $1 RETURNING delivered_at',
        [message.id]
      );
      deliveredAt = delivered?.delivered_at ?? null;
    }

    const payload = {
      id: message.id,
      conversationId,
      senderId: me,
      body: message.body,
      type: message.type,
      attachmentUrl: message.attachment_url,
      attachmentName: message.attachment_name,
      createdAt: message.created_at,
      deliveredAt,
      readAt: null,
      mine: false,
    };
    emitToUser(me, 'message:new', { ...payload, mine: true });
    if (peer && peer.user_id === (await botUserId())) {
      scheduleBotReply(me, conversationId, body || attachmentName || '');
    }
    if (peer && peer.user_id === (await supportUserId())) {
      // Support threads are answered from the admin panel, not by a chat participant.
      await noteUserSupportMessage({
        conversationId,
        userId: me,
        body: body || attachmentName || '',
        type,
      });
    } else if (peer) {
      emitToUser(peer.user_id, 'message:new', payload);
      await notify(peer.user_id, 'message', 'رسالة جديدة', body.slice(0, 80), {
        conversationId,
        senderId: me,
        preview: body.slice(0, 120),
        type,
      });
    }

    const xpSettings = await getXpSettings();
    await awardXpSafe({
      userId: me,
      kind: 'chat',
      refId: message.id,
      xp: xpSettings.chat_message ?? 0,
    });

    res.status(201).json({ message: { ...payload, mine: true } });
  })
);

router.post(
  '/conversations/:id/read',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const conversationId = req.params.id;
    await assertMember(conversationId, me);
    const rows = await q<{ sender_id: string }>(
      `UPDATE messages SET read_at = now(), delivered_at = COALESCE(delivered_at, now())
       WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL
       RETURNING sender_id`,
      [conversationId, me]
    );
    await markSupportReadByUser(conversationId);
    const senders = [...new Set(rows.map((row) => row.sender_id))];
    for (const sender of senders) {
      emitToUser(sender, 'message:read', { conversationId, readerId: me });
    }
    res.json({ read: rows.length });
  })
);

router.delete(
  '/conversations/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const conversationId = req.params.id;
    await assertMember(conversationId, me);
    const supportTicket = await one(
      'SELECT 1 FROM support_tickets WHERE conversation_id = $1',
      [conversationId]
    );
    if (supportTicket) {
      throw new HttpError(403, 'لا يمكن حذف محادثة الدعم الفني', 'support_conversation');
    }
    await q('DELETE FROM conversations WHERE id = $1', [conversationId]);
    res.json({ deleted: true });
  })
);

export default router;
