import { Router } from 'express';
import { one, q } from '../db';
import { reqUser, requireAuth } from '../auth';
import { emitToUser, emitToUsers } from '../realtime';
import {
  ANNOUNCEMENT_CATEGORIES,
  REACTION_EMOJIS,
  announcementRecipientIds,
  isReactionEmoji,
  markAllAnnouncementsRead,
  serializeAnnouncement,
  unreadAnnouncementCount,
  type AnnouncementRow,
} from '../announcements';
import { replyToAnnouncement } from '../support';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();

/** All-audience announcements are visible to every user, including new signups. */
async function ensureVisibleRows(userId: string): Promise<void> {
  await q(
    `INSERT INTO announcement_recipients (announcement_id, user_id)
     SELECT a.id, $1 FROM announcements a
     WHERE a.status = 'published' AND a.audience = 'all'
     ON CONFLICT DO NOTHING`,
    [userId]
  );
}

async function visibleAnnouncement(id: string, userId: string): Promise<AnnouncementRow> {
  const row = await one<AnnouncementRow>(
    `SELECT a.* FROM announcements a
     WHERE a.id = $1 AND a.status = 'published'
       AND (a.audience = 'all' OR EXISTS (
         SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.user_id = $2))`,
    [id, userId]
  );
  if (!row) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');
  return row;
}

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const limit = intParam(req.query.limit, 100, 1, 200);
    await ensureVisibleRows(me);

    const rows = await q<AnnouncementRow & {
      my_reaction: string | null;
      read_at: string | null;
      first_viewed_at: string | null;
      view_count: number;
      reaction_count: number;
      comment_count: number;
      recipient_count: number;
      read_count: number;
      total_views: number;
    }>(
      `SELECT a.*,
              (SELECT r.emoji FROM announcement_reactions r
                WHERE r.announcement_id = a.id AND r.user_id = $1) AS my_reaction,
              ar.read_at, ar.first_viewed_at, COALESCE(ar.view_count, 0) AS view_count,
              (SELECT count(*)::int FROM announcement_reactions r
                WHERE r.announcement_id = a.id) AS reaction_count,
              (SELECT count(*)::int FROM announcement_comments c
                WHERE c.announcement_id = a.id) AS comment_count,
              (SELECT count(*)::int FROM announcement_recipients rc
                WHERE rc.announcement_id = a.id) AS recipient_count,
              (SELECT count(*)::int FROM announcement_recipients rc
                WHERE rc.announcement_id = a.id AND rc.read_at IS NOT NULL) AS read_count,
              (SELECT COALESCE(sum(rc.view_count), 0)::int FROM announcement_recipients rc
                WHERE rc.announcement_id = a.id) AS total_views
       FROM announcements a
       LEFT JOIN announcement_recipients ar ON ar.announcement_id = a.id AND ar.user_id = $1
       WHERE a.status = 'published'
         AND (a.audience = 'all' OR EXISTS (
           SELECT 1 FROM announcement_targets t WHERE t.announcement_id = a.id AND t.user_id = $1))
       ORDER BY a.is_pinned DESC, a.published_at DESC NULLS LAST, a.created_at DESC
       LIMIT ${limit}`,
      [me]
    );

    const breakdown = await q<{ announcement_id: string; emoji: string; count: number }>(
      `SELECT announcement_id, emoji, count(*)::int AS count
       FROM announcement_reactions GROUP BY announcement_id, emoji`
    );
    const byAnnouncement = new Map<string, Record<string, number>>();
    for (const item of breakdown) {
      const bucket = byAnnouncement.get(item.announcement_id) ?? {};
      bucket[item.emoji] = Number(item.count);
      byAnnouncement.set(item.announcement_id, bucket);
    }

    res.json({
      categories: ANNOUNCEMENT_CATEGORIES,
      emojis: REACTION_EMOJIS,
      unread: await unreadAnnouncementCount(me),
      announcements: rows.map((row) => ({
        ...serializeAnnouncement(row),
        myReaction: row.my_reaction,
        reactions: byAnnouncement.get(row.id) ?? {},
        reactionCount: Number(row.reaction_count || 0),
        commentCount: Number(row.comment_count || 0),
        recipientCount: Number(row.recipient_count || 0),
        readCount: Number(row.read_count || 0),
        views: Number(row.total_views || 0),
        read: Boolean(row.read_at),
        viewed: Boolean(row.first_viewed_at),
      })),
    });
  })
);

router.post(
  '/read-all',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await markAllAnnouncementsRead(me);
    emitToUser(me, 'announcement:read', { all: true });
    res.json({ ok: true, unread: 0 });
  })
);

router.post(
  '/:id/view',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const announcement = await visibleAnnouncement(req.params.id, me);
    await q(
      `INSERT INTO announcement_recipients (announcement_id, user_id, read_at, first_viewed_at, view_count)
       VALUES ($1, $2, now(), now(), 1)
       ON CONFLICT (announcement_id, user_id) DO UPDATE SET
         read_at = COALESCE(announcement_recipients.read_at, now()),
         first_viewed_at = COALESCE(announcement_recipients.first_viewed_at, now()),
         view_count = announcement_recipients.view_count + 1`,
      [announcement.id, me]
    );
    // Other devices of the same account update their badge immediately.
    emitToUser(me, 'announcement:read', { announcementId: announcement.id });
    res.json({ ok: true, unread: await unreadAnnouncementCount(me) });
  })
);

router.post(
  '/:id/reaction',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const announcement = await visibleAnnouncement(req.params.id, me);
    const emoji = String(req.body?.emoji || '');
    if (!isReactionEmoji(emoji)) throw new HttpError(400, 'تفاعل غير معروف', 'invalid_reaction');

    const existing = await one<{ emoji: string }>(
      'SELECT emoji FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2',
      [announcement.id, me]
    );
    let mine: string | null = emoji;
    if (existing?.emoji === emoji) {
      await q('DELETE FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2', [
        announcement.id,
        me,
      ]);
      mine = null;
    } else {
      await q(
        `INSERT INTO announcement_reactions (announcement_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (announcement_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`,
        [announcement.id, me, emoji]
      );
    }

    const counts = await q<{ emoji: string; count: number }>(
      `SELECT emoji, count(*)::int AS count FROM announcement_reactions
       WHERE announcement_id = $1 GROUP BY emoji`,
      [announcement.id]
    );
    const reactions: Record<string, number> = {};
    for (const item of counts) reactions[item.emoji] = Number(item.count);

    const recipients = await announcementRecipientIds(announcement.id);
    emitToUsers(recipients, 'announcement:reaction', {
      announcementId: announcement.id,
      reactions,
      reactionCount: Object.values(reactions).reduce((sum, value) => sum + value, 0),
      userId: me,
      emoji: mine,
    });
    res.json({ myReaction: mine, reactions });
  })
);

router.get(
  '/:id/comments',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const announcement = await visibleAnnouncement(req.params.id, me);
    const rows = await q<{
      id: string;
      body: string;
      created_at: string;
      user_id: string;
      display_name: string;
      username: string;
      avatar_url: string | null;
    }>(
      `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.display_name, u.username, u.avatar_url
       FROM announcement_comments c JOIN users u ON u.id = c.user_id
       WHERE c.announcement_id = $1
       ORDER BY c.created_at ASC LIMIT 200`,
      [announcement.id]
    );
    res.json({
      commentsEnabled: announcement.comments_enabled,
      comments: rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        mine: row.user_id === me,
        user: {
          id: row.user_id,
          displayName: row.display_name,
          username: row.username,
          avatarUrl: row.avatar_url,
        },
      })),
    });
  })
);

router.post(
  '/:id/comments',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const announcement = await visibleAnnouncement(req.params.id, me);
    if (!announcement.comments_enabled) {
      throw new HttpError(403, 'التعليقات معطّلة على هذا الإعلان', 'comments_disabled');
    }
    const body = String(req.body?.body || '').trim().slice(0, 500);
    if (!body) throw new HttpError(400, 'اكتب تعليقاً أولاً', 'empty_comment');
    const rows = await q<{ id: string; created_at: string }>(
      `INSERT INTO announcement_comments (announcement_id, user_id, body)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [announcement.id, me, body]
    );
    const user = await one<{ display_name: string; username: string; avatar_url: string | null }>(
      'SELECT display_name, username, avatar_url FROM users WHERE id = $1',
      [me]
    );
    const comment = {
      id: rows[0].id,
      body,
      createdAt: rows[0].created_at,
      mine: true,
      user: {
        id: me,
        displayName: user?.display_name ?? '',
        username: user?.username ?? '',
        avatarUrl: user?.avatar_url ?? null,
      },
    };
    const recipients = await announcementRecipientIds(announcement.id);
    emitToUsers(recipients, 'announcement:comment', {
      announcementId: announcement.id,
      comment,
      userId: me,
    });
    res.status(201).json({ comment });
  })
);

/** Reply to an announcement in the official support conversation. */
router.post(
  '/:id/reply',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const announcement = await visibleAnnouncement(req.params.id, me);
    const message = String(req.body?.message || '').slice(0, 1500);
    const conversationId = await replyToAnnouncement(me, announcement.id, announcement.title, message);
    res.status(201).json({ conversationId });
  })
);

export default router;
