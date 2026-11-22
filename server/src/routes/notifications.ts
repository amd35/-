import { Router } from 'express';
import { q, one } from '../db';
import { reqUser, requireAuth } from '../auth';
import { asyncHandler, intParam } from '../utils';

const router = Router();

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const limit = intParam(req.query.limit, 50, 1, 100);
    const rows = await q(
      `SELECT id, type, title, body, data, read_at, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${limit}`,
      [me]
    );
    const unread = await one<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [me]
    );
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        data: row.data,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      unread: Number(unread?.count || 0),
    });
  })
);

router.post(
  '/read-all',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [me]);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/read',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await q('UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2', [
      req.params.id,
      me,
    ]);
    res.json({ ok: true });
  })
);

export default router;
