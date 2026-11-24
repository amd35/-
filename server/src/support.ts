import { one, q, tx } from './db';
import { emitToAdmins, emitToUser } from './realtime';
import { notify } from './notify';

/**
 * "الدعم الفني" — the official support account. It is a real `users` row flagged
 * `is_support`, so the existing chat, uploads, realtime and notifications all
 * work unchanged; the admin panel answers through the same conversation.
 */
// Accounts carry a 6-digit ID generated from 1xxxxx; the leading zeros are reserved.
export const SUPPORT_USERNAME = '000002';
export const SUPPORT_DISPLAY_NAME = 'الدعم الفني';

const SUPPORT_AVATAR =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/>` +
      `</linearGradient></defs>` +
      `<circle cx="48" cy="48" r="48" fill="url(#g)"/>` +
      `<path d="M48 15l23 8v19c0 15-10 25-23 31-13-6-23-16-23-31V23l23-8Z" fill="#0f0b1a" opacity="0.28"/>` +
      `<path d="M34 52v-4a14 14 0 0 1 28 0v4" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<rect x="27" y="50" width="9" height="16" rx="4.5" fill="#fff"/>` +
      `<rect x="60" y="50" width="9" height="16" rx="4.5" fill="#fff"/>` +
      `<path d="M64 67c-2 5-7 8-14 8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>` +
      `<circle cx="47" cy="75" r="3.5" fill="#fff"/>` +
      `</svg>`
  );

const WELCOME =
  'أهلاً بك في الدعم الفني لـ Yalla Phone 💜\nاكتب مشكلتك أو استفسارك هنا، وتقدر ترسل صورة أو فيديو أو تسجيل صوتي. فريقنا يرد عليك بأقرب وقت.';

let cachedSupportId: string | null = null;

export async function ensureSupportUser(): Promise<string> {
  if (cachedSupportId) return cachedSupportId;
  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE is_support = true OR username = $1 LIMIT 1',
    [SUPPORT_USERNAME]
  );
  if (existing) {
    await q(
      `UPDATE users SET is_support = true, is_bot = false, username = $2,
         display_name = $3, avatar_url = COALESCE(NULLIF(avatar_url, ''), $4)
       WHERE id = $1`,
      [existing.id, SUPPORT_USERNAME, SUPPORT_DISPLAY_NAME, SUPPORT_AVATAR]
    );
    cachedSupportId = existing.id;
    return existing.id;
  }
  const rows = await q<{ id: string }>(
    `INSERT INTO users (username, display_name, avatar_url, bio, is_support, provider)
     VALUES ($1, $2, $3, $4, true, 'support')
     RETURNING id`,
    [SUPPORT_USERNAME, SUPPORT_DISPLAY_NAME, SUPPORT_AVATAR, 'الدعم الرسمي لتطبيق Yalla Phone — نحن هنا لمساعدتك']
  );
  cachedSupportId = rows[0].id;
  return cachedSupportId;
}

export function supportUserId(): Promise<string> {
  return ensureSupportUser();
}

export interface SupportTicketRef {
  ticketId: string;
  conversationId: string;
  supportId: string;
  status: string;
}

/** Returns the user's ticket with support, creating the conversation once if needed. */
export async function ensureSupportTicket(userId: string): Promise<SupportTicketRef> {
  const supportId = await ensureSupportUser();
  const existing = await one<{ id: string; conversation_id: string; status: string }>(
    'SELECT id, conversation_id, status FROM support_tickets WHERE user_id = $1',
    [userId]
  );
  if (existing) {
    return {
      ticketId: existing.id,
      conversationId: existing.conversation_id,
      supportId,
      status: existing.status,
    };
  }

  const direct = await one<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
     WHERE c.type = 'direct' LIMIT 1`,
    [userId, supportId]
  );
  const conversationId =
    direct?.id ??
    (await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO conversations (type) VALUES ('direct') RETURNING id`
      );
      const id = rows[0].id;
      await c.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
        [id, userId, supportId]
      );
      return id;
    }));

  const ticket = await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO support_tickets (user_id, conversation_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING RETURNING id`,
      [userId, conversationId]
    );
    if (!rows[0]) {
      const again = await c.query<{ id: string }>(
        'SELECT id FROM support_tickets WHERE user_id = $1',
        [userId]
      );
      return again.rows[0].id as string;
    }
    const { rows: counted } = await c.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM messages WHERE conversation_id = $1',
      [conversationId]
    );
    if (Number(counted[0].count) === 0) {
      await c.query(
        'INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)',
        [conversationId, supportId, WELCOME]
      );
      await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [
        conversationId,
      ]);
    }
    return rows[0].id;
  });

  await logSupportEvent('system', 'ticket_created', { ticketId: ticket, userId });
  return { ticketId: ticket, conversationId, supportId, status: 'open' };
}

/** Links an already-created direct conversation with support to a ticket row. */
export async function registerSupportConversation(userId: string, conversationId: string): Promise<void> {
  await q(
    `INSERT INTO support_tickets (user_id, conversation_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, conversationId]
  );
}

export async function logSupportEvent(
  actor: string,
  action: string,
  data: { ticketId?: string | null; userId?: string | null; detail?: string | null } = {}
): Promise<void> {
  await q(
    `INSERT INTO support_events (actor, action, ticket_id, user_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [actor, action, data.ticketId ?? null, data.userId ?? null, data.detail ?? null]
  );
}

/**
 * Called when a user writes into their support thread: bumps the admin unread
 * counter, reopens a closed ticket, and pings connected admin panels.
 */
export async function noteUserSupportMessage(input: {
  conversationId: string;
  userId: string;
  body: string;
  type: string;
}): Promise<void> {
  const ticket = await one<{ id: string; status: string }>(
    'SELECT id, status FROM support_tickets WHERE conversation_id = $1',
    [input.conversationId]
  );
  if (!ticket) return;
  const reopened = ticket.status !== 'open';
  await q(
    `UPDATE support_tickets
        SET unread_admin = unread_admin + 1, last_message_at = now(),
            status = 'open', closed_at = CASE WHEN status = 'open' THEN closed_at ELSE NULL END
      WHERE id = $1`,
    [ticket.id]
  );
  if (reopened) {
    await logSupportEvent('user', 'reopen', { ticketId: ticket.id, userId: input.userId });
  }
  emitToAdmins('support:message', {
    ticketId: ticket.id,
    userId: input.userId,
    body: input.body.slice(0, 120),
    type: input.type,
  });
}

/** Marks the support side of a thread as read (user opened it). */
export async function markSupportReadByUser(conversationId: string): Promise<void> {
  await q('UPDATE support_tickets SET unread_user = 0 WHERE conversation_id = $1', [conversationId]);
}

export interface SupportReplyInput {
  conversationId: string;
  ticketId: string;
  userId: string;
  body: string;
  type?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  actor: string;
}

/** Sends a reply as the official support account and notifies the user live. */
export async function sendSupportReply(input: SupportReplyInput): Promise<Record<string, unknown>> {
  const supportId = await ensureSupportUser();
  const type = ['text', 'image', 'file', 'video', 'audio'].includes(String(input.type))
    ? String(input.type)
    : 'text';
  const row = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO messages (conversation_id, sender_id, body, type, attachment_url, attachment_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.conversationId,
        supportId,
        input.body,
        type,
        input.attachmentUrl ?? null,
        input.attachmentName ?? null,
      ]
    );
    await c.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [
      input.conversationId,
    ]);
    await c.query(
      'UPDATE support_tickets SET last_message_at = now(), unread_user = unread_user + 1 WHERE id = $1',
      [input.ticketId]
    );
    return rows[0];
  });

  const payload = {
    id: row.id,
    conversationId: input.conversationId,
    senderId: supportId,
    body: row.body,
    type: row.type,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? null,
    readAt: null,
    mine: false,
  };
  emitToUser(input.userId, 'message:new', payload);
  await notify(input.userId, 'support_reply', 'رد من الدعم الفني', input.body.slice(0, 80) || 'مرفق', {
    conversationId: input.conversationId,
    ticketId: input.ticketId,
  });
  await logSupportEvent(input.actor, 'reply', {
    ticketId: input.ticketId,
    userId: input.userId,
    detail: input.body.slice(0, 120) || type,
  });
  return payload;
}
