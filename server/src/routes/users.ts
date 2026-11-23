import { Router } from 'express';
import { one, q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { getFreeCallState } from '../freecalls';
import { getSettings } from '../settings';
import { notify } from '../notify';
import {
  FRAME_FIELDS,
  RANK_FIELDS,
  VIP_FIELDS,
  frameJoins,
  rankJoins,
  toPublicUser,
  vipJoins,
} from '../serializers';
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
  is_support?: boolean;
}

const FEED_SELECT = `
  SELECT u.id, u.username, u.level, u.display_name, u.avatar_url, u.bio, u.gender, u.country, u.age,
         u.last_seen_at, u.created_at, u.phone_verified, u.email_verified, u.is_support,
         ${FRAME_FIELDS}, ${RANK_FIELDS}, ${VIP_FIELDS},
    EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = $1 AND f.target_id = u.id) AS is_favorite,
    EXISTS (SELECT 1 FROM friendships fr WHERE fr.status = 'accepted'
            AND ((fr.requester_id = $1 AND fr.addressee_id = u.id)
              OR (fr.requester_id = u.id AND fr.addressee_id = $1))) AS is_friend,
    EXISTS (SELECT 1 FROM follows fo WHERE fo.follower_id = $1 AND fo.following_id = u.id) AS is_following,
    EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = $1 AND b.blocked_id = u.id) AS is_blocked
  FROM users u
  ${frameJoins('u')}
  ${rankJoins('u')}
  ${vipJoins('u')}
  WHERE u.id <> $1 AND u.is_banned = false AND u.is_bot = false AND u.is_support = false
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users bb
      WHERE (bb.user_id = $1 AND bb.blocked_id = u.id)
         OR (bb.user_id = u.id AND bb.blocked_id = $1)
    )`;

/** The official support account is protected: no block, no report, no removal. */
async function assertNotSupport(target: string): Promise<void> {
  const row = await one<{ is_support: boolean }>('SELECT is_support FROM users WHERE id = $1', [
    target,
  ]);
  if (row?.is_support) {
    throw new HttpError(
      403,
      'حساب الدعم الفني الرسمي محمي ولا يمكن حظره أو الإبلاغ عنه',
      'support_account_protected'
    );
  }
}

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
      `SELECT u.id, u.username, u.level, u.display_name, u.avatar_url, u.bio, u.gender, u.country, u.age,
              u.last_seen_at, u.created_at, ${FRAME_FIELDS}, ${VIP_FIELDS},
              fr.id AS request_id, fr.created_at AS requested_at,
              false AS is_favorite, false AS is_friend, false AS is_following, false AS is_blocked
       FROM friendships fr JOIN users u ON u.id = fr.requester_id
       ${frameJoins('u')} ${vipJoins('u')}
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
  '/:id/followers',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const targetId = String(req.params.id);
    const rows = await q<FeedRow>(
      `${FEED_SELECT} AND EXISTS (
         SELECT 1 FROM follows f WHERE f.following_id = $2 AND f.follower_id = u.id
       )
       ORDER BY u.last_seen_at DESC NULLS LAST LIMIT 100`,
      [me, targetId]
    );
    res.json({ users: rows.map(decorate) });
  })
);

router.get(
  '/:id/following',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const targetId = String(req.params.id);
    const rows = await q<FeedRow>(
      `${FEED_SELECT} AND EXISTS (
         SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id
       )
       ORDER BY u.last_seen_at DESC NULLS LAST LIMIT 100`,
      [me, targetId]
    );
    res.json({ users: rows.map(decorate) });
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
            `SELECT u.id, u.username, u.level, u.display_name, u.avatar_url, u.bio, u.gender, u.country,
                    u.age, u.last_seen_at, u.created_at, u.phone_verified, u.email_verified,
                    ${FRAME_FIELDS}, ${RANK_FIELDS}, ${VIP_FIELDS},
                    false AS is_favorite, false AS is_friend, false AS is_following,
                    false AS is_blocked
             FROM users u ${frameJoins('u')} ${rankJoins('u')} ${vipJoins('u')} WHERE u.id = $1`,
            [me]
          )
        : (await one<FeedRow>(`${FEED_SELECT} AND u.id = $2`, [me, targetId])) ??
          // The official support account is excluded from discovery but its profile
          // stays reachable from the chat list and the profile card.
          (await one<FeedRow>(
            `SELECT u.id, u.username, u.level, u.display_name, u.avatar_url, u.bio, u.gender, u.country,
                    u.age, u.last_seen_at, u.created_at, u.phone_verified, u.email_verified, u.is_support,
                    ${FRAME_FIELDS}, ${RANK_FIELDS}, ${VIP_FIELDS},
                    false AS is_favorite, false AS is_friend, false AS is_following, false AS is_blocked
             FROM users u ${frameJoins('u')} ${rankJoins('u')} ${vipJoins('u')}
             WHERE u.id = $1 AND u.is_support = true`,
            [targetId]
          ));
    if (!row) throw new HttpError(404, 'User not found', 'user_not_found');

    const counts = await one<{ friends: string; followers: string; following: string; rooms: string }>(
      `SELECT
        (SELECT count(*)::text FROM friendships f WHERE f.status = 'accepted'
          AND (f.requester_id = $1 OR f.addressee_id = $1)) AS friends,
        (SELECT count(*)::text FROM follows f WHERE f.following_id = $1) AS followers,
        (SELECT count(*)::text FROM follows f WHERE f.follower_id = $1) AS following,
        (SELECT count(*)::text FROM rooms r WHERE r.created_by = $1 OR r.owner_id = $1) AS rooms`,
      [row.id]
    );
    const earnings = await one<{ total: string; calls: string }>(
      `SELECT COALESCE(SUM(coins), 0)::text AS total, count(*)::text AS calls
       FROM earnings WHERE user_id = $1`,
      [row.id]
    );
    const isSelf = row.id === me;
    // Received-gift totals power the profile card and the gift gallery header.
    const gifts = await one<{ count: string; coins: string }>(
      `SELECT COALESCE(SUM(quantity), 0)::text AS count,
              COALESCE(SUM(coins), 0)::text AS coins
       FROM gift_sends WHERE recipient_id = $1`,
      [row.id]
    );
    const giftsSent = await one<{ count: string }>(
      'SELECT COALESCE(SUM(quantity), 0)::text AS count FROM gift_sends WHERE sender_id = $1',
      [row.id]
    );
    // The admin decides whether a coin balance is public on someone's profile.
    const settings = await getSettings();
    const wallet =
      isSelf || settings.profile_show_balances
        ? await one<{ balance: string }>('SELECT balance FROM wallets WHERE user_id = $1', [row.id])
        : null;
    const frames = await q<{
      id: string;
      name: string;
      design: string | null;
      kind: string;
      image_url: string | null;
      rarity: string;
    }>(
      `SELECT f.id, f.name, f.design, f.kind, f.image_url, f.rarity
       FROM user_avatar_frames uaf
       JOIN avatar_frames f ON f.id = uaf.frame_id AND f.is_active = true
       WHERE uaf.user_id = $1 AND (uaf.expires_at IS NULL OR uaf.expires_at > now())
       ORDER BY f.sort_order, f.price
       LIMIT 40`,
      [row.id]
    );
    res.json({
      user: decorate(row),
      counts: {
        friends: Number(counts?.friends || 0),
        followers: Number(counts?.followers || 0),
        following: Number(counts?.following || 0),
        rooms: Number(counts?.rooms || 0),
      },
      earnings: isSelf
        ? { total: Number(earnings?.total || 0), calls: Number(earnings?.calls || 0) }
        : null,
      gifts: {
        count: Number(gifts?.count || 0),
        coins: Number(gifts?.coins || 0),
        sent: Number(giftsSent?.count || 0),
      },
      balances: wallet ? { coins: Number(wallet.balance || 0) } : null,
      frames: frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        design: frame.design,
        kind: frame.kind,
        imageUrl: frame.image_url,
        rarity: frame.rarity,
      })),
      isSelf,
    });
  })
);

/**
 * The permanent gift gallery of one user: every gift they received, grouped by
 * gift with its copy count, latest sender and latest date, plus the totals.
 */
router.get(
  '/:id/gifts',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const targetId = req.params.id;
    // Same visibility rule as the profile itself: a block hides the gallery too.
    const visible = await one(
      `SELECT 1 FROM users u
       WHERE u.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM blocked_users b
           WHERE (b.user_id = $2 AND b.blocked_id = u.id)
              OR (b.user_id = u.id AND b.blocked_id = $2)
         )`,
      [targetId, me]
    );
    if (!visible) throw new HttpError(404, 'User not found', 'user_not_found');
    const rows = await q<{
      gift_id: string;
      name: string;
      name_en: string;
      design: string | null;
      video_url: string | null;
      cover_url: string | null;
      rarity: string;
      count: string;
      coins: string;
      last_at: string;
      last_sender_name: string | null;
      last_sender_avatar: string | null;
    }>(
      `SELECT g.id AS gift_id, g.name, g.name_en, g.design, g.video_url, g.cover_url, g.rarity,
              COALESCE(SUM(s.quantity), 0)::text AS count,
              COALESCE(SUM(s.coins), 0)::text AS coins,
              MAX(s.created_at) AS last_at,
              (array_agg(u.display_name ORDER BY s.created_at DESC))[1] AS last_sender_name,
              (array_agg(u.avatar_url ORDER BY s.created_at DESC))[1] AS last_sender_avatar
       FROM gift_sends s
       JOIN gifts g ON g.id = s.gift_id
       JOIN users u ON u.id = s.sender_id
       WHERE s.recipient_id = $1
       GROUP BY g.id
       ORDER BY MAX(s.created_at) DESC
       LIMIT 200`,
      [targetId]
    );
    const totals = rows.reduce(
      (sum, row) => ({
        count: sum.count + Number(row.count || 0),
        coins: sum.coins + Number(row.coins || 0),
      }),
      { count: 0, coins: 0 }
    );
    res.json({
      items: rows.map((row) => ({
        giftId: row.gift_id,
        name: row.name,
        nameEn: row.name_en,
        design: row.design,
        videoUrl: row.video_url,
        coverUrl: row.cover_url,
        rarity: row.rarity,
        count: Number(row.count || 0),
        coins: Number(row.coins || 0),
        lastReceivedAt: row.last_at,
        lastSender: row.last_sender_name
          ? { displayName: row.last_sender_name, avatarUrl: row.last_sender_avatar }
          : null,
      })),
      totals,
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
    await assertNotSupport(target);
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
    await assertNotSupport(target);
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
