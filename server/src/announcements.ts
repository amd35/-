import { one, q } from './db';
import { emitToUsers } from './realtime';
import { sendPushToUsers } from './push';
import { HttpError } from './utils';

/**
 * Announcement centre — YALLA PHONE.
 *
 * Publishing materialises one `announcement_recipients` row per target user,
 * which is what makes delivery idempotent (the primary key), gives exact
 * recipient/read/view stats, and lets each user keep a permanent read state.
 */
export interface AnnouncementCategory {
  key: string;
  labelAr: string;
  labelEn: string;
  color: string;
  icon: string;
}

export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = [
  { key: 'official', labelAr: 'إعلان رسمي', labelEn: 'Official', color: '#ffd75e', icon: 'shield' },
  { key: 'update', labelAr: 'تحديث جديد', labelEn: 'Update', color: '#8b7bff', icon: 'refresh' },
  { key: 'feature', labelAr: 'ميزة جديدة', labelEn: 'New feature', color: '#38d39f', icon: 'sparkle' },
  { key: 'maintenance', labelAr: 'صيانة', labelEn: 'Maintenance', color: '#ff9f43', icon: 'settings' },
  { key: 'event', labelAr: 'مسابقة/فعالية', labelEn: 'Event', color: '#ff5fa2', icon: 'star' },
  { key: 'offers', labelAr: 'عروض ومكافآت', labelEn: 'Offers', color: '#ffb347', icon: 'gift' },
  { key: 'alert', labelAr: 'تنبيه مهم', labelEn: 'Alert', color: '#ff4d4d', icon: 'alert' },
];

const CATEGORY_KEYS = new Set(ANNOUNCEMENT_CATEGORIES.map((item) => item.key));

/** Emoji reactions offered under every announcement (👍 is the classic "like"). */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '💜', '😍'];
const REACTION_SET = new Set(REACTION_EMOJIS);

export interface AdminActor {
  id: string | null;
  name: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: string;
  media_type: string;
  media_url: string | null;
  link_url: string | null;
  link_label: string | null;
  audience: string;
  status: string;
  is_pinned: boolean;
  comments_enabled: boolean;
  publish_at: string | null;
  published_at: string | null;
  created_by_name: string;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  category: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  audience: 'all' | 'selected';
  userIds: string[];
  commentsEnabled: boolean;
  isPinned: boolean;
}

function cleanUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return raw.slice(0, 500);
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 500);
  return null;
}

export function normalizeAnnouncementInput(body: Record<string, unknown>): AnnouncementInput {
  const title = String(body.title ?? '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'العنوان مطلوب', 'missing_title');
  const text = String(body.body ?? '').trim().slice(0, 4000);
  const category = CATEGORY_KEYS.has(String(body.category)) ? String(body.category) : 'official';
  const rawMedia = String(body.mediaType ?? 'none');
  const mediaType: AnnouncementInput['mediaType'] =
    rawMedia === 'image' || rawMedia === 'video' ? rawMedia : 'none';
  const mediaUrl = mediaType === 'none' ? null : cleanUrl(body.mediaUrl);
  if (mediaType !== 'none' && !mediaUrl) {
    throw new HttpError(400, 'رابط الصورة أو الفيديو غير صالح', 'invalid_media');
  }
  const audience = String(body.audience) === 'selected' ? 'selected' : 'all';
  const userIds = Array.isArray(body.userIds)
    ? [...new Set(body.userIds.map((id) => String(id)).filter(Boolean))]
    : [];
  if (audience === 'selected' && userIds.length === 0) {
    throw new HttpError(400, 'اختر مستخدماً واحداً على الأقل', 'missing_targets');
  }
  return {
    title,
    body: text,
    category,
    mediaType,
    mediaUrl,
    linkUrl: cleanUrl(body.linkUrl),
    linkLabel: body.linkLabel ? String(body.linkLabel).trim().slice(0, 60) : null,
    audience,
    userIds,
    commentsEnabled: body.commentsEnabled !== false,
    isPinned: body.isPinned === true,
  };
}

export function serializeAnnouncement(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    audience: row.audience,
    status: row.status,
    isPinned: row.is_pinned,
    commentsEnabled: row.comments_enabled,
    publishAt: row.publish_at,
    publishedAt: row.published_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function logAnnouncementEvent(
  announcementId: string,
  admin: AdminActor,
  action: string,
  detail = ''
): Promise<void> {
  await q(
    `INSERT INTO announcement_events (announcement_id, admin_id, admin_name, action, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [announcementId, admin.id, admin.name, action, detail.slice(0, 300)]
  );
}

async function replaceTargets(announcementId: string, userIds: string[]): Promise<void> {
  await q('DELETE FROM announcement_targets WHERE announcement_id = $1', [announcementId]);
  if (userIds.length === 0) return;
  await q(
    `INSERT INTO announcement_targets (announcement_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.id = ANY($2::uuid[]) AND u.is_bot = false AND u.is_support = false
     ON CONFLICT DO NOTHING`,
    [announcementId, userIds]
  );
}

export async function createAnnouncement(
  input: AnnouncementInput,
  admin: AdminActor,
  action: 'draft' | 'publish' | 'schedule',
  publishAt: string | null
): Promise<{ id: string; status: string; recipients: number }> {
  // `publish` inserts as a draft and lets publishAnnouncement do the delivery,
  // so recipient rows, notifications and the audit entry happen in one place.
  const status = action === 'schedule' ? 'scheduled' : 'draft';
  const rows = await q<{ id: string }>(
    `INSERT INTO announcements
       (title, body, category, media_type, media_url, link_url, link_label, audience, status,
        is_pinned, comments_enabled, publish_at, published_at, created_by_name, created_by_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      input.title,
      input.body,
      input.category,
      input.mediaType,
      input.mediaUrl,
      input.linkUrl,
      input.linkLabel,
      input.audience,
      status,
      input.isPinned,
      input.commentsEnabled,
      action === 'schedule' ? publishAt : null,
      null,
      admin.name,
      admin.id,
    ]
  );
  const id = rows[0].id;
  if (input.audience === 'selected') await replaceTargets(id, input.userIds);
  await logAnnouncementEvent(id, admin, 'created', input.audience === 'all' ? 'الجمهور: جميع المستخدمين' : `الجمهور: ${input.userIds.length} مستخدم`);
  if (action === 'schedule' && publishAt) {
    await logAnnouncementEvent(id, admin, 'scheduled', `موعد النشر: ${publishAt}`);
  }
  if (action === 'publish') {
    const result = await publishAnnouncement(id, admin, 'published');
    return { id, status: 'published', recipients: result.recipients };
  }
  return { id, status, recipients: 0 };
}

export async function updateAnnouncement(
  id: string,
  input: AnnouncementInput,
  admin: AdminActor,
  action: 'draft' | 'publish' | 'schedule',
  publishAt: string | null
): Promise<{ id: string; status: string; recipients: number }> {
  const existing = await one<AnnouncementRow>('SELECT * FROM announcements WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');

  const nextStatus =
    existing.status === 'published'
      ? 'published'
      : action === 'schedule'
        ? 'scheduled'
        : 'draft';

  await q(
    `UPDATE announcements SET
       title = $2, body = $3, category = $4, media_type = $5, media_url = $6,
       link_url = $7, link_label = $8, audience = $9, status = $10, is_pinned = $11,
       comments_enabled = $12, publish_at = $13, updated_at = now()
     WHERE id = $1`,
    [
      id,
      input.title,
      input.body,
      input.category,
      input.mediaType,
      input.mediaUrl,
      input.linkUrl,
      input.linkLabel,
      input.audience,
      nextStatus,
      input.isPinned,
      input.commentsEnabled,
      action === 'schedule' ? publishAt : existing.publish_at,
    ]
  );
  if (input.audience === 'selected') await replaceTargets(id, input.userIds);
  else await q('DELETE FROM announcement_targets WHERE announcement_id = $1', [id]);

  await logAnnouncementEvent(id, admin, 'edited', `تم تعديل محتوى الإعلان (${input.title})`);
  // Editing a published announcement never re-notifies; the content updates live instead.
  if (existing.status === 'published') {
    const recipients = await q<{ user_id: string }>(
      'SELECT user_id FROM announcement_recipients WHERE announcement_id = $1',
      [id]
    );
    const fresh = await one<AnnouncementRow>('SELECT * FROM announcements WHERE id = $1', [id]);
    if (fresh) emitToUsers(recipients.map((row) => row.user_id), 'announcement:updated', serializeAnnouncement(fresh));
  }
  if (action === 'publish' && existing.status !== 'published') {
    const result = await publishAnnouncement(id, admin, 'published');
    return { id, status: 'published', recipients: result.recipients };
  }
  return { id, status: nextStatus, recipients: 0 };
}

/**
 * Publishes (or re-publishes) an announcement. Recipient rows are inserted with
 * ON CONFLICT DO NOTHING, so notifications and push are sent exactly once per user.
 */
export async function publishAnnouncement(
  id: string,
  admin: AdminActor,
  action = 'published'
): Promise<{ published: boolean; recipients: number }> {
  const row = await one<AnnouncementRow>('SELECT * FROM announcements WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');
  if (row.status === 'published') return { published: false, recipients: 0 };

  await q(
    `UPDATE announcements SET status = 'published', published_at = now(), updated_at = now()
     WHERE id = $1`,
    [id]
  );
  const delivered = await q<{ user_id: string }>(
    `INSERT INTO announcement_recipients (announcement_id, user_id)
     SELECT $1, u.id FROM users u
     WHERE u.is_banned = false AND u.is_bot = false AND u.is_support = false
       AND ($2 = 'all' OR EXISTS (
         SELECT 1 FROM announcement_targets t
         WHERE t.announcement_id = $1 AND t.user_id = u.id))
     ON CONFLICT DO NOTHING
     RETURNING user_id`,
    [id, row.audience]
  );
  const userIds = delivered.map((item) => item.user_id);

  if (userIds.length > 0) {
    await q(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT r.user_id, 'announcement', $2, $3,
              jsonb_build_object('announcementId', $6::text, 'category', $4::text)
       FROM announcement_recipients r
       WHERE r.announcement_id = $1::uuid AND r.user_id = ANY($5::uuid[])`,
      [id, row.title, row.body.slice(0, 160), row.category, userIds, id]
    );
    const fresh = await one<AnnouncementRow>('SELECT * FROM announcements WHERE id = $1', [id]);
    if (fresh) emitToUsers(userIds, 'announcement:new', serializeAnnouncement(fresh));
    void sendPushToUsers(userIds, {
      title: row.title,
      body: row.body.slice(0, 160) || 'إعلان جديد من YALLA PHONE',
      data: { type: 'announcement', announcementId: id, category: row.category },
    });
  }

  await logAnnouncementEvent(
    id,
    admin,
    action,
    `نُشر لـ ${userIds.length} مستخدم — ${row.audience === 'all' ? 'جميع المستخدمين' : 'مجموعة محددة'}`
  );
  return { published: true, recipients: userIds.length };
}

export async function announcementRecipientIds(id: string): Promise<string[]> {
  const rows = await q<{ user_id: string }>(
    'SELECT user_id FROM announcement_recipients WHERE announcement_id = $1',
    [id]
  );
  return rows.map((row) => row.user_id);
}

/** Marks every published announcement visible to the user as read (and delivered). */
export async function markAllAnnouncementsRead(userId: string): Promise<void> {
  await q(
    `INSERT INTO announcement_recipients (announcement_id, user_id, read_at)
     SELECT a.id, $1, now() FROM announcements a
     WHERE a.status = 'published' AND a.audience = 'all'
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  await q(
    `UPDATE announcement_recipients SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
}

export async function unreadAnnouncementCount(userId: string): Promise<number> {
  const row = await one<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM announcements a
     LEFT JOIN announcement_recipients r ON r.announcement_id = a.id AND r.user_id = $1
     WHERE a.status = 'published'
       AND (a.audience = 'all' OR EXISTS (
         SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.user_id = $1))
       AND r.read_at IS NULL`,
    [userId]
  );
  return Number(row?.count || 0);
}

export function isReactionEmoji(value: unknown): boolean {
  return REACTION_SET.has(String(value));
}

let loop: ReturnType<typeof setInterval> | null = null;

/** Publishes scheduled announcements when their time comes (checked every 20 s). */
export function startAnnouncementLoop(): void {
  if (loop) return;
  const tick = async () => {
    try {
      const due = await q<{ id: string }>(
        `SELECT id FROM announcements
         WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= now()
         ORDER BY publish_at LIMIT 20`
      );
      for (const row of due) {
        await publishAnnouncement(row.id, { id: null, name: 'النشر المجدول' }, 'published_scheduled');
      }
    } catch (error) {
      console.error('[announcements] scheduled publish failed', (error as Error).message);
    }
  };
  setTimeout(() => void tick(), 4000).unref?.();
  loop = setInterval(() => void tick(), 20_000);
  loop.unref?.();
  console.log('[announcements] scheduler ready');
}
