import { Router } from 'express';
import { one, q } from '../db';
import { reqAdmin, requireAdmin } from '../auth';
import {
  ANNOUNCEMENT_CATEGORIES,
  createAnnouncement,
  logAnnouncementEvent,
  normalizeAnnouncementInput,
  publishAnnouncement,
  serializeAnnouncement,
  updateAnnouncement,
  type AnnouncementRow,
  type AdminActor,
} from '../announcements';
import { pushConfigured } from '../push';
import { HttpError, asyncHandler } from '../utils';
import { giftUpload } from './uploads';

const router = Router();
router.use(requireAdmin());

const STATS_SELECT = `
  (SELECT count(*)::int FROM announcement_recipients r WHERE r.announcement_id = a.id) AS recipients,
  (SELECT count(*)::int FROM announcement_recipients r WHERE r.announcement_id = a.id AND r.read_at IS NOT NULL) AS reads,
  (SELECT COALESCE(sum(r.view_count), 0)::int FROM announcement_recipients r WHERE r.announcement_id = a.id) AS views,
  (SELECT count(*)::int FROM announcement_reactions r WHERE r.announcement_id = a.id) AS reactions,
  (SELECT count(*)::int FROM announcement_comments c WHERE c.announcement_id = a.id) AS comments,
  (SELECT count(*)::int FROM announcement_targets t WHERE t.announcement_id = a.id) AS targets`;

type AdminRow = AnnouncementRow & {
  recipients: number;
  reads: number;
  views: number;
  reactions: number;
  comments: number;
  targets: number;
};

function adminShape(row: AdminRow) {
  return {
    ...serializeAnnouncement(row),
    stats: {
      recipients: Number(row.recipients || 0),
      reads: Number(row.reads || 0),
      views: Number(row.views || 0),
      reactions: Number(row.reactions || 0),
      comments: Number(row.comments || 0),
    },
    targetCount: Number(row.targets || 0),
  };
}

function actor(req: Parameters<typeof reqAdmin>[0]): AdminActor {
  const admin = reqAdmin(req);
  return { id: admin.id, name: admin.display_name || admin.username };
}

function parseAction(body: Record<string, unknown>): {
  action: 'draft' | 'publish' | 'schedule';
  publishAt: string | null;
} {
  const raw = String(body.action || 'publish');
  const action = raw === 'draft' || raw === 'schedule' ? raw : 'publish';
  if (action !== 'schedule') return { action, publishAt: null };
  const date = new Date(String(body.publishAt || ''));
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'حدد موعد النشر', 'invalid_publish_at');
  }
  return { action, publishAt: date.toISOString() };
}

router.get(
  '/announcements/push-status',
  asyncHandler(async (_req, res) => {
    res.json({ configured: pushConfigured() });
  })
);

router.post(
  '/announcements/media',
  giftUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'لم يتم استلام ملف', 'missing_file');
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  })
);

router.get(
  '/announcements',
  asyncHandler(async (_req, res) => {
    const rows = await q<AdminRow>(
      `SELECT a.*, ${STATS_SELECT}
       FROM announcements a
       ORDER BY a.created_at DESC LIMIT 200`
    );
    res.json({
      categories: ANNOUNCEMENT_CATEGORIES,
      pushConfigured: pushConfigured(),
      announcements: rows.map(adminShape),
    });
  })
);

router.get(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const row = await one<AdminRow>(
      `SELECT a.*, ${STATS_SELECT} FROM announcements a WHERE a.id = $1`,
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');
    const events = await q<{ id: string; action: string; detail: string; admin_name: string; created_at: string }>(
      `SELECT id, action, detail, admin_name, created_at FROM announcement_events
       WHERE announcement_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [row.id]
    );
    const comments = await q<{
      id: string;
      body: string;
      created_at: string;
      display_name: string;
      username: string;
    }>(
      `SELECT c.id, c.body, c.created_at, u.display_name, u.username
       FROM announcement_comments c JOIN users u ON u.id = c.user_id
       WHERE c.announcement_id = $1 ORDER BY c.created_at DESC LIMIT 200`,
      [row.id]
    );
    const targets = await q<{ id: string; display_name: string; username: string; avatar_url: string | null }>(
      `SELECT u.id, u.display_name, u.username, u.avatar_url
       FROM announcement_targets t JOIN users u ON u.id = t.user_id
       WHERE t.announcement_id = $1 ORDER BY u.display_name LIMIT 500`,
      [row.id]
    );
    const breakdown = await q<{ emoji: string; count: number }>(
      `SELECT emoji, count(*)::int AS count FROM announcement_reactions
       WHERE announcement_id = $1 GROUP BY emoji ORDER BY count DESC`,
      [row.id]
    );
    res.json({
      announcement: adminShape(row),
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        detail: event.detail,
        adminName: event.admin_name,
        createdAt: event.created_at,
      })),
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        displayName: comment.display_name,
        username: comment.username,
      })),
      targets: targets.map((target) => ({
        id: target.id,
        displayName: target.display_name,
        username: target.username,
        avatarUrl: target.avatar_url,
      })),
      reactions: breakdown.map((item) => ({ emoji: item.emoji, count: Number(item.count) })),
    });
  })
);

router.post(
  '/announcements',
  asyncHandler(async (req, res) => {
    const input = normalizeAnnouncementInput(req.body ?? {});
    const { action, publishAt } = parseAction(req.body ?? {});
    const result = await createAnnouncement(input, actor(req), action, publishAt);
    res.status(201).json(result);
  })
);

router.patch(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const input = normalizeAnnouncementInput(req.body ?? {});
    const { action, publishAt } = parseAction(req.body ?? {});
    const result = await updateAnnouncement(req.params.id, input, actor(req), action, publishAt);
    res.json(result);
  })
);

router.post(
  '/announcements/:id/publish',
  asyncHandler(async (req, res) => {
    const result = await publishAnnouncement(req.params.id, actor(req), 'published_manually');
    res.json(result);
  })
);

router.post(
  '/announcements/:id/pin',
  asyncHandler(async (req, res) => {
    const pinned = req.body?.pinned === true;
    const row = await one<{ id: string }>(
      'UPDATE announcements SET is_pinned = $2, updated_at = now() WHERE id = $1 RETURNING id',
      [req.params.id, pinned]
    );
    if (!row) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');
    await logAnnouncementEvent(row.id, actor(req), pinned ? 'pinned' : 'unpinned');
    res.json({ pinned });
  })
);

router.delete(
  '/announcements/:id',
  asyncHandler(async (req, res) => {
    const row = await one<{ id: string; title: string }>(
      'DELETE FROM announcements WHERE id = $1 RETURNING id, title',
      [req.params.id]
    );
    if (!row) throw new HttpError(404, 'الإعلان غير موجود', 'announcement_not_found');
    res.json({ deleted: true });
  })
);

export default router;
