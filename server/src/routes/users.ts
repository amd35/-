import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { getFreeCallState } from '../freecalls';
import { notify } from '../notify';
import { FRAME_FIELDS, RANK_FIELDS, frameJoins, rankJoins, toPublicUser } from '../serializers';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();

interface FeedRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  country: string | null;
  age: number | null;
  last_seen_at: string | null;
  created_at: string;
  is_favorite: boolean;
  is_friend: boolean;
  is_following: boolean;
  is_blocked: boolean;
}

const FEED_SELECT = `
  SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.gender, u.country, u.age,
         u.last_seen_at, u.created_at, ${FRAME_FIELDS}, ${RANK_FIELDS},
    EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = $1 AND f.target_id = u.id) AS is_favorite,
    EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted'
            AND ((fr.requester_id = $1 AND fr.addressee_id = u.id)
              OR (fr.requester_id = u.id AND fr.addressee_id = $1))) AS is_friend,
    EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = $1 AND fo.following_id = u.id) AS is_following,
    EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = $1 AND b.blocked_id = u.id) AS is_blocked
  FROM users u
  ${frameJoins('u')}
  ${rankJoins('u')}
  WHERE u.id <> $1 AND u.is_banned = false AND u.is_bot = false
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users bb
      WHERE (bb.user_id = $1 AND bb.blocked_id = u.id)
         OR (bb.user_id = u.id AND bb.blocked_id = $1)
    )`;

function decorate(row: FeedRow) {
  return {
    ...toPublicUser(row),
    isFavorite: row.is_favorite,
    isFriend: row.is_friend,
    isFollowing: row.is_following,
    isBlocked: row.is_blocked,
  };
}

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const search = String(req.query.q || '').trim();
    const filter = String(req.query.filter || 'all');
    const limit = intParam(req.query.limit, 60, 1, 200);
    const params: unknown[] = [me];
    let sql = FEED_SELECT;
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
    }
    sql += ' ORDER BY u.last_seen_at DESC NULLS LAST LIMIT 200';

    const rows = await q<FeedRow>(sql, params);
    let list = rows.map(decorate);
    if (filter === 'online') list = list.filter((user) => user.online);
    if (filter === 'favorites') list = list.filter((user) => user.isFavorite);
    if (filter === 'friends') list = list.filter((user) => user.isFriend);
    list.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime();
    });
    res.json({ users: list.slice(0, limit) });
  })
);

router.get(
  '/suggestions',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q<FeedRow>(
      `${FEED_SELECT} AND NOT EXISTS (
         SELECT 1 FROM friendships f2 WHERE f2.status = 'accepted'
           AND ((f2.requester_id = $1 AND f2.addressee_id = u.id)
             OR (f2.requester_id = u.id AND f2.addressee_id = $1)))
       ORDER BY u.last_seen_at DESC NULLS LAST LIMIT 8`,
      [me]
    );
    res.json({ users: rows.map(decorate) });
  })
);

router.get(
  '/friends/requests',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q<FeedRow & { request_id: string; requested_at: string }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.gender, u.country, u.age,
              u.last_seen_at, u.created_at, ${FRAME_FIELDS},
              fr.id AS request_id, fr.created_at AS requested_at,
              false AS is_favorite, false AS is_friend, false AS is_following, false AS is_blocked
       FROM friendships fr JOIN users u ON u.id = fr.requester_id
       ${frameJoins('u')}
       WHERE fr.addressee_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [me]
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.request_id,
        requestedAt: row.requested_at,
        user: toPublicUser(row),
      })),
    });
  })
);

router.post(
  '/friends/:id/accept',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const request = await one<{ id: string; requester_id: string }>(
      `UPDATE friendships SET status = 'accepted', responded_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id, requester_id`,
      [req.params.id, me]
    );
    if (!request) throw new HttpError(404, 'Friend request not found', 'request_not_found');
    await notify(request.requester_id, 'friend_accepted', 'تم قبول طلب الصداقة', '', { userId: me });
    res.json({ ok: true });
  })
);

router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const targetId = req.params.id;
    // The discovery feed excludes your own account, so the profile page needs a
    // separate read to show your own stats and earnings.
    const row =
      targetId === me
        ? await one<FeedRow>(
            `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.gender, u.country,
                    u.age, u.last_seen_at, u.created_at, ${FRAME_FIELDS}, ${RANK_FIELDS},
                    false AS is_favorite, false AS is_friend, false AS is_following,
                    false AS is_blocked
             FROM users u ${frameJoins('u')} ${rankJoins('u')} WHERE u.id = $1`,
            [me]
          )
        : await one<FeedRow>(`${FEED_SELECT} AND u.id = $2`, [me, targetId]);
    if (!row) throw new HttpError(404, 'User not found', 'user_not_found');

    const counts = await one<{ friends: string; followers: string; following: string }>(
      `SELECT
        (SELECT count(*)::text FROM friendships f WHERE f.status = 'accepted'
          AND (f.requester_id = $1 OR f.addressee_id = $1)) AS friends,
        (SELECT count(*)::text FROM follows f WHERE f.following_id = $1) AS followers,
        (SELECT count(*)::text FROM follows f WHERE f.follower_id = $1) AS following`,
      [row.id]
    );
    const earnings = await one<{ total: string; calls: string }>(
      `SELECT COALESCE(SUM(coins), 0)::text AS total, count(*)::text AS calls
       FROM earnings WHERE user_id = $1`,
      [row.id]
    );
    const isSelf = row.id === me;
    res.json({
      user: decorate(row),
      counts: {
        friends: Number(counts?.friends || 0),
        followers: Number(counts?.followers || 0),
        following: Number(counts?.following || 0),
      },
      earnings: isSelf
        ? { total: Number(earnings?.total || 0), calls: Number(earnings?.calls || 0) }
        : null,
      isSelf,
    });
  })
);

router.post(
  '/:id/follow',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const target = req.params.id;
    if (me === target) throw new HttpError(400, 'You cannot follow yourself', 'invalid_target');
    const existing = await one('SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2', [
      me,
      target,
    ]);
    if (existing) {
      await q('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [me, target]);
      res.json({ following: false });
      return;
    }
    await q('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [me, target]);
    await notify(target, 'new_follower', 'متابع جديد', '', { userId: me });
    res.json({ following: true });
  })
);

router.post(
  '/:id/favorite',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const target = req.params.id;
    if (me === target) throw new HttpError(400, 'Invalid target', 'invalid_target');
    const existing = await one(
      'SELECT 1 FROM favorites WHERE user_id = $1 AND target_id = $2',
      [me, target]
    );
    if (existing) {
      await q('DELETE FROM favorites WHERE user_id = $1 AND target_id = $2', [me, target]);
      res.json({ favorite: false });
      return;
    }
    await q('INSERT INTO favorites (user_id, target_id) VALUES ($1, $2)', [me, target]);
    res.json({ favorite: true });
  })
);

router.post(
  '/:id/friend',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const target = req.params.id;
    if (me === target) throw new HttpError(400, 'Invalid target', 'invalid_target');
    const targetUser = await one<{ is_banned: boolean }>(
      'SELECT is_banned FROM users WHERE id = $1',
      [target]
    );
    if (!targetUser) throw new HttpError(404, 'User not found', 'user_not_found');

    const existing = await one<{ id: string; requester_id: string; addressee_id: string; status: string }>(
      `SELECT * FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
       LIMIT 1`,
      [me, target]
    );
    if (existing?.status === 'accepted') {
      res.json({ status: 'accepted' });
      return;
    }
    if (existing && existing.requester_id === target) {
      await q(`UPDATE friendships SET status = 'accepted', responded_at = now() WHERE id = $1`, [
        existing.id,
      ]);
      await notify(target, 'friend_accepted', 'تم قبول طلب الصداقة', '', { userId: me });
      res.json({ status: 'accepted' });
      return;
    }
    if (existing) {
      res.json({ status: existing.status });
      return;
    }
    await q(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`, [
      me,
      target,
    ]);
    await notify(target, 'friend_request', 'طلب صداقة جديد', '', { userId: me });
    res.json({ status: 'pending' });
  })
);

router.post(
  '/:id/block',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const target = req.params.id;
    if (me === target) throw new HttpError(400, 'Invalid target', 'invalid_target');
    const existing = await one('SELECT 1 FROM blocked_users WHERE user_id = $1 AND blocked_id = $2', [
      me,
      target,
    ]);
    if (existing) {
      await q('DELETE FROM blocked_users WHERE user_id = $1 AND blocked_id = $2', [me, target]);
      res.json({ blocked: false });
      return;
    }
    await q('INSERT INTO blocked_users (user_id, blocked_id) VALUES ($1, $2)', [me, target]);
    res.json({ blocked: true });
  })
);

router.post(
  '/:id/report',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const target = req.params.id;
    const reason = String(req.body?.reason || '').trim().slice(0, 80);
    const details = String(req.body?.details || '').slice(0, 1000);
    if (!reason) throw new HttpError(400, 'Please choose a reason', 'missing_reason');
    if (me === target) throw new HttpError(400, 'Invalid target', 'invalid_target');
    await q(
      'INSERT INTO reports (reporter_id, target_id, reason, details) VALUES ($1, $2, $3, $4)',
      [me, target, reason, details]
    );
    res.json({ reported: true });
  })
);

router.get(
  '/me/free-calls',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await getFreeCallState(reqUser(req).id));
  })
);

router.get(
  '/me/blocked',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q<{ id: string; username: string; display_name: string; avatar_url: string | null }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM blocked_users b JOIN users u ON u.id = b.blocked_id
       WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
      [me]
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

export default router;
