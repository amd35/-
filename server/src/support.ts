import { one, q, tx } from './db';
import { emitToUser } from './realtime';

/**
 * YALLA PHONE — the official, verified support account.
 *
 * It is a real `users` row flagged `is_support`, so the chat list, thread,
 * unread badges and realtime all work without a parallel code path. The row is
 * seeded at boot, hidden from discovery and admin lists, and the user routes
 * refuse to block or report it.
 */
export const SUPPORT_USERNAME = '000000';
export const SUPPORT_DISPLAY_NAME = 'YALLA PHONE | الدعم الفني';
export const SUPPORT_BIO =
  'الحساب الرسمي الموثق لدعم YALLA PHONE 💜 نستقبل استفساراتكم وملاحظاتكم وردودكم على الإعلانات على مدار الساعة.';

const SUPPORT_AVATAR =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#2a0f3d"/><stop offset="1" stop-color="#5b1e8a"/>` +
      `</linearGradient>` +
      `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffe28a"/><stop offset="1" stop-color="#d99b1f"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<circle cx="48" cy="48" r="48" fill="url(#bg)"/>` +
      `<circle cx="48" cy="48" r="37" fill="none" stroke="url(#gold)" stroke-width="3"/>` +
      `<path d="M30 40v18c0 2 2 4 4 4h4l9 7v-40l-9 7h-4c-2 0-4 2-4 4Z" fill="url(#gold)"/>` +
      `<path d="M55 38a13 13 0 0 1 0 20M61 32a22 22 0 0 1 0 32" stroke="url(#gold)" stroke-width="3.4" fill="none" stroke-linecap="round"/>` +
      `<circle cx="70" cy="30" r="8" fill="#25d366"/>` +
      `<path d="M66.5 30.2l2.4 2.5 4.6-5" stroke="#0b2e17" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`
  );

let cachedSupportId: string | null = null;

export async function ensureSupportUser(): Promise<string> {
  if (cachedSupportId) return cachedSupportId;
  const existing = await one<{ id: string }>(
    'SELECT id FROM users WHERE is_support = true OR username = $1 LIMIT 1',
    [SUPPORT_USERNAME]
  );
  if (existing) {
    await q(
      `UPDATE users SET is_support = true, is_bot = false, is_banned = false, ban_reason = NULL,
         username = $2, display_name = $3, bio = $4, phone_verified = true,
         avatar_url = COALESCE(NULLIF(avatar_url, ''), $5)
       WHERE id = $1`,
      [existing.id, SUPPORT_USERNAME, SUPPORT_DISPLAY_NAME, SUPPORT_BIO, SUPPORT_AVATAR]
    );
    cachedSupportId = existing.id;
    return existing.id;
  }
  const rows = await q<{ id: string }>(
    `INSERT INTO users (username, display_name, avatar_url, bio, gender, is_support, phone_verified, provider)
     VALUES ($1, $2, $3, $4, 'other', true, true, 'support')
     ON CONFLICT (username) DO UPDATE SET is_support = true, phone_verified = true
     RETURNING id`,
    [SUPPORT_USERNAME, SUPPORT_DISPLAY_NAME, SUPPORT_AVATAR, SUPPORT_BIO]
  );
  cachedSupportId = rows[0].id;
  return cachedSupportId;
}

export async function supportUserId(): Promise<string> {
  return ensureSupportUser();
}

const WELCOME =
  'أهلاً بك في دعم YALLA PHONE الرسمي 💜\n' +
  'اكتب استفسارك أو ملاحظتك هنا وسيصلك رد الفريق. تقدر أيضاً ترد على أي إعلان من صفحة «إعلانات يلا فون» وبتوصل رسالتك لنا مباشرة.';

/** Creates (once) the private conversation between a user and the support account. */
export async function ensureSupportConversation(
  userId: string
): Promise<{ supportId: string; conversationId: string }> {
  const supportId = await ensureSupportUser();
  const existing = await one<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
     WHERE c.type = 'direct' LIMIT 1`,
    [userId, supportId]
  );
  if (existing) return { supportId, conversationId: existing.id };

  const conversationId = await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO conversations (type) VALUES ('direct') RETURNING id`
    );
    const id = rows[0].id;
    await c.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [id, userId, supportId]
    );
    await c.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)', [
      id,
      supportId,
      WELCOME,
    ]);
    return id;
  });
  return { supportId, conversationId };
}

/**
 * Sends the user's announcement reply into the support thread, then posts an
 * acknowledgement from the official account so the thread is never a dead end.
 */
export async function replyToAnnouncement(
  userId: string,
  announcementId: string,
  title: string,
  message: string
): Promise<string> {
  const { supportId, conversationId } = await ensureSupportConversation(userId);
  const body = message.trim()
    ? `بخصوص إعلان «${title}»:\n${message.trim().slice(0, 1500)}`
    : `أرغب بالرد على إعلان «${title}»`;
  const rows = await q<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [conversationId, userId, body]
  );
  await q('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
  emitToUser(userId, 'message:new', {
    id: rows[0].id,
    conversationId,
    senderId: userId,
    body,
    type: 'text',
    attachmentUrl: null,
    attachmentName: null,
    createdAt: rows[0].created_at,
    readAt: null,
    mine: true,
  });
  scheduleSupportReply(userId, conversationId, announcementId);
  return conversationId;
}

/** Acknowledgement from the official account, after a short "typing" beat. */
export function scheduleSupportReply(
  userId: string,
  conversationId: string,
  announcementId?: string
): void {
  void (async () => {
    try {
      const supportId = await ensureSupportUser();
      emitToUser(userId, 'chat:typing', { conversationId, userId: supportId });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const body =
        'وصلتنا رسالتك بخصوص الإعلان ✅ شكراً لتواصلك مع YALLA PHONE — سيراجع الفريق رسالتك ويرد عليك هنا في أقرب وقت.';
      const rows = await q<{ id: string; body: string; created_at: string }>(
        `INSERT INTO messages (conversation_id, sender_id, body, type)
         VALUES ($1, $2, $3, 'text') RETURNING id, body, created_at`,
        [conversationId, supportId, body]
      );
      await q('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
      emitToUser(userId, 'message:new', {
        id: rows[0].id,
        conversationId,
        senderId: supportId,
        body: rows[0].body,
        type: 'text',
        attachmentUrl: null,
        attachmentName: null,
        createdAt: rows[0].created_at,
        readAt: null,
        mine: false,
        ...(announcementId ? { announcementId } : {}),
      });
    } catch (error) {
      console.error('[support] reply failed', (error as Error).message);
    }
  })();
}
