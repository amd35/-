import { Router } from 'express';
import { one, q } from '../db';
import { reqAdmin, requireAdmin } from '../auth';
import { notify } from '../notify';
import { broadcast, emitToUser } from '../realtime';
import {
  ensureSupportTicket,
  logSupportEvent,
  sendSupportReply,
  supportUserId,
} from '../support';
import { HttpError, asyncHandler, intParam } from '../utils';
import { adUpload } from './uploads';

const router = Router();
router.use(requireAdmin());

const BROADCAST_CATEGORIES = new Set([
  'update',
  'feature',
  'announcement',
  'maintenance',
  'contest',
  'gift',
]);

function cleanBody(value: unknown, max = 4000): string {
  return String(value ?? '').slice(0, max);
}

/** Support inbox: ticket list, counters and search by user ID or name. */
router.get(
  '/support/overview',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'all');
    const search = String(req.query.q || '').trim();
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (status === 'open' || status === 'closed') {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
    }
    const tickets = await q(
      `SELECT t.id, t.status, t.unread_admin, t.last_message_at, t.created_at, t.closed_at,
              u.id AS user_id, u.username, u.display_name, u.avatar_url, u.is_banned,
              lm.body AS last_body, lm.type AS last_type, lm.sender_id AS last_sender,
              lm.created_at AS last_at
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN LATERAL (
           SELECT body, type, sender_id, created_at FROM messages m
            WHERE m.conversation_id = t.conversation_id
            ORDER BY m.created_at DESC LIMIT 1
         ) lm ON true
         ${where}
         ORDER BY (t.unread_admin > 0) DESC, t.last_message_at DESC
         LIMIT 200`,
      params
    );
    const stats = await one<{
      open: number;
      closed: number;
      unread: number;
      today: number;
    }>(
      `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
              count(*) FILTER (WHERE status = 'closed')::int AS closed,
              COALESCE(sum(unread_admin), 0)::int AS unread,
              count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today
         FROM support_tickets`
    );
    const supportId = await supportUserId();
    res.json({
      supportId,
      stats: {
        open: Number(stats?.open ?? 0),
        closed: Number(stats?.closed ?? 0),
        unread: Number(stats?.unread ?? 0),
        today: Number(stats?.today ?? 0),
      },
      tickets: tickets.map((row) => ({
        id: row.id,
        status: row.status,
        unread: Number(row.unread_admin || 0),
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        closedAt: row.closed_at,
        user: {
          id: row.user_id,
          username: row.username,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          banned: row.is_banned,
        },
        lastMessage: row.last_at
          ? {
              body: row.last_body,
              type: row.last_type,
              mine: row.last_sender === supportId,
              createdAt: row.last_at,
            }
          : null,
      })),
    });
  })
);

/** One ticket: header, full message history and its audit trail. */
router.get(
  '/support/tickets/:id',
  asyncHandler(async (req, res) => {
    const ticket = await one<{
      id: string;
      conversation_id: string;
      status: string;
      created_at: string;
      closed_at: string | null;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      is_banned: boolean;
    }>(
      `SELECT t.id, t.conversation_id, t.status, t.created_at, t.closed_at,
              u.id AS user_id, u.username, u.display_name, u.avatar_url, u.is_banned
         FROM support_tickets t JOIN users u ON u.id = t.user_id
        WHERE t.id = $1`,
      [req.params.id]
    );
    if (!ticket) throw new HttpError(404, 'Ticket not found', 'ticket_not_found');

    const supportId = await supportUserId();
    await q('UPDATE support_tickets SET unread_admin = 0 WHERE id = $1', [ticket.id]);
    await q(
      `UPDATE messages SET delivered_at = now()
        WHERE conversation_id = $1 AND sender_id <> $2 AND delivered_at IS NULL`,
      [ticket.conversation_id, supportId]
    );
    emitToUser(ticket.user_id, 'message:delivered', { conversationId: ticket.conversation_id });

    const messages = await q(
      `SELECT id, sender_id, body, type, attachment_url, attachment_name, created_at, delivered_at, read_at
         FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 500`,
      [ticket.conversation_id]
    );
    const events = await q(
      `SELECT id, actor, action, detail, created_at FROM support_events
        WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [ticket.id]
    );
    res.json({
      ticket: {
        id: ticket.id,
        status: ticket.status,
        createdAt: ticket.created_at,
        closedAt: ticket.closed_at,
        user: {
          id: ticket.user_id,
          username: ticket.username,
          displayName: ticket.display_name,
          avatarUrl: ticket.avatar_url,
          banned: ticket.is_banned,
        },
      },
      messages: messages.map((row) => ({
        id: row.id,
        body: row.body,
        type: row.type,
        attachmentUrl: row.attachment_url,
        attachmentName: row.attachment_name,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
        mine: row.sender_id === supportId,
      })),
      events,
    });
  })
);

/** Admin reply, sent as the official support account. */
router.post(
  '/support/tickets/:id/reply',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const ticket = await one<{ id: string; conversation_id: string; user_id: string }>(
      'SELECT id, conversation_id, user_id FROM support_tickets WHERE id = $1',
      [req.params.id]
    );
    if (!ticket) throw new HttpError(404, 'Ticket not found', 'ticket_not_found');

    const body = cleanBody(req.body?.body);
    const attachmentUrl = req.body?.attachmentUrl ? String(req.body.attachmentUrl) : null;
    if (!body.trim() && !attachmentUrl) {
      throw new HttpError(400, 'Message is empty', 'empty_message');
    }
    const message = await sendSupportReply({
      conversationId: ticket.conversation_id,
      ticketId: ticket.id,
      userId: ticket.user_id,
      body,
      type: String(req.body?.type || 'text'),
      attachmentUrl,
      attachmentName: req.body?.attachmentName ? String(req.body.attachmentName) : null,
      actor: admin.username,
    });
    res.status(201).json({ message });
  })
);

router.post(
  '/support/tickets/:id/status',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const status = String(req.body?.status || '');
    if (status !== 'open' && status !== 'closed') {
      throw new HttpError(400, 'Invalid status', 'invalid_status');
    }
    const ticket = await one<{ id: string; conversation_id: string; user_id: string; status: string }>(
      'SELECT id, conversation_id, user_id, status FROM support_tickets WHERE id = $1',
      [req.params.id]
    );
    if (!ticket) throw new HttpError(404, 'Ticket not found', 'ticket_not_found');
    await q(
      `UPDATE support_tickets
          SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END
        WHERE id = $1`,
      [ticket.id, status]
    );
    const title = status === 'closed' ? 'تم إغلاق بلاغك' : 'تم إعادة فتح بلاغك';
    const text =
      status === 'closed'
        ? 'إذا احتجت مساعدة أخرى أرسل رسالة جديدة في نفس المحادثة.'
        : 'الدعم الفني أعاد فتح محادثتك، تفضل بكتابة ما تحتاجه.';
    await notify(ticket.user_id, 'support_status', title, text, {
      conversationId: ticket.conversation_id,
      ticketId: ticket.id,
      status,
    });
    emitToUser(ticket.user_id, 'support:status', {
      conversationId: ticket.conversation_id,
      ticketId: ticket.id,
      status,
    });
    await logSupportEvent(admin.username, status === 'closed' ? 'close' : 'open', {
      ticketId: ticket.id,
      userId: ticket.user_id,
    });
    res.json({ status });
  })
);

/** User lookup for individual messages (ID or name). */
router.get(
  '/support/users',
  asyncHandler(async (req, res) => {
    const search = String(req.query.q || '').trim();
    if (!search) {
      res.json({ users: [] });
      return;
    }
    const rows = await q(
      `SELECT id, username, display_name, avatar_url FROM users
        WHERE is_bot = false AND is_support = false AND (username ILIKE $1 OR display_name ILIKE $1)
        ORDER BY display_name LIMIT 20`,
      [`%${search}%`]
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      })),
    });
  })
);

/** Opens (or reuses) a user's support thread and sends one message from support. */
router.post(
  '/support/message',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const userId = String(req.body?.userId || '');
    const body = cleanBody(req.body?.body);
    const attachmentUrl = req.body?.attachmentUrl ? String(req.body.attachmentUrl) : null;
    if (!userId) throw new HttpError(400, 'Choose a user', 'missing_user');
    if (!body.trim() && !attachmentUrl) {
      throw new HttpError(400, 'Message is empty', 'empty_message');
    }
    const user = await one<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 AND is_bot = false AND is_support = false',
      [userId]
    );
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');

    const { ticketId, conversationId } = await ensureSupportTicket(userId);
    const message = await sendSupportReply({
      conversationId,
      ticketId,
      userId,
      body,
      type: String(req.body?.type || 'text'),
      attachmentUrl,
      attachmentName: req.body?.attachmentName ? String(req.body.attachmentName) : null,
      actor: admin.username,
    });
    res.status(201).json({ message, ticketId });
  })
);

/** Official broadcast: one notification per active user, pushed live. */
router.post(
  '/support/broadcast',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const category = String(req.body?.category || 'announcement');
    if (!BROADCAST_CATEGORIES.has(category)) {
      throw new HttpError(400, 'Invalid category', 'invalid_category');
    }
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = cleanBody(req.body?.body, 500);
    const link = String(req.body?.link || '').trim().slice(0, 300) || null;
    const imageUrl = String(req.body?.imageUrl || '').trim().slice(0, 400) || null;
    if (!title) throw new HttpError(400, 'Title is required', 'missing_title');

    const rows = await q<{ user_id: string }>(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT id, 'support_broadcast', $1, $2, $3::jsonb
         FROM users
        WHERE is_bot = false AND is_support = false AND is_banned = false
       RETURNING user_id`,
      [title, body, JSON.stringify({ category, link, imageUrl })]
    );
    broadcast('support:broadcast', { title, body, category, link, imageUrl });
    await logSupportEvent(admin.username, 'broadcast', {
      detail: `${category}: ${title} (${rows.length} مستخدم)`,
    });
    res.json({ sent: rows.length });
  })
);

/** Full audit trail of support actions. */
router.get(
  '/support/events',
  asyncHandler(async (req, res) => {
    const limit = intParam(req.query.limit, 100, 1, 300);
    const rows = await q(
      `SELECT e.id, e.actor, e.action, e.detail, e.created_at,
              u.display_name AS user_name, u.username AS user_username
         FROM support_events e LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.created_at DESC LIMIT ${limit}`
    );
    res.json({
      events: rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        detail: row.detail,
        createdAt: row.created_at,
        userName: row.user_name,
        userUsername: row.user_username,
      })),
    });
  })
);

/** Attachment upload for support replies (image or short video). */
router.post(
  '/support/upload',
  adUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    const extension = req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase();
    const mediaType = ['.mp4', '.webm', '.mov'].includes(extension)
      ? 'video'
      : ['.mp3', '.m4a', '.ogg', '.wav'].includes(extension)
        ? 'audio'
        : 'image';
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mediaType,
      size: req.file.size,
    });
  })
);

export default router;
