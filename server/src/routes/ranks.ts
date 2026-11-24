import { Router, type NextFunction, type Request, type Response } from 'express';
import { one, q, tx } from '../db';
import {
  bearerToken,
  currentAdmin,
  currentUser,
  reqUser,
  requireAuth,
  verifyToken,
} from '../auth';
import {
  ADMIN_ACTOR,
  RANK_PERMISSIONS,
  activeRankFor,
  agentPanel,
  audit,
  claimDailyBox,
  grantRank,
  hasPermission,
  manageOverview,
  rankOverview,
  revokeRank,
  serializeBox,
  serializeRank,
  type RankActor,
  type RankBoxExtra,
  type RankRow,
} from '../ranks';
import { HttpError, asyncHandler } from '../utils';
import { upload } from './uploads';

const router = Router();

type RankRequest = Request & { rankActor: RankActor };

function rankActor(req: Request): RankActor {
  return (req as RankRequest).rankActor;
}

/**
 * Accepts either an admin session or an app user whose active rank carries one
 * of the required permissions. This is what keeps a customer-service account
 * from ever reaching rank management.
 */
function requireRankManager(required: string | string[]) {
  const list = Array.isArray(required) ? required : [required];
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req);
      if (!token) throw new HttpError(401, 'Authentication required', 'unauthenticated');
      const payload = verifyToken(token);
      if (payload.kind === 'admin') {
        const admin = await currentAdmin(req);
        (req as RankRequest).rankActor = ADMIN_ACTOR(admin.id, admin.username);
        next();
        return;
      }
      const user = await currentUser(req);
      (req as Request & { user: typeof user }).user = user;
      const rank = await activeRankFor(user.id);
      if (!rank || !list.some((permission) => hasPermission(rank, permission))) {
        throw new HttpError(403, 'You do not have permission for this action', 'forbidden');
      }
      (req as RankRequest).rankActor = {
        kind: 'user',
        id: user.id,
        name: user.display_name,
        power: Number(rank.power),
        isSuper: hasPermission(rank, '*'),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/* ------------------------------------------------------------------ user API */

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await rankOverview(reqUser(req).id));
  })
);

router.post(
  '/box/claim',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const result = await claimDailyBox(reqUser(req).id);
    res.status(201).json(result);
  })
);

router.get(
  '/agent',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await agentPanel(reqUser(req).id));
  })
);

/* --------------------------------------------------------------- management */

router.get(
  '/manage/overview',
  requireRankManager(['manage_ranks', 'manage_boxes', 'view_users']),
  asyncHandler(async (_req, res) => {
    res.json(await manageOverview());
  })
);

function readPermissions(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, 'Permissions must be a list', 'invalid_permissions');
  const allowed = new Set<string>(['*', ...RANK_PERMISSIONS]);
  const list = [...new Set(value.map((item) => String(item)))];
  for (const permission of list) {
    if (!allowed.has(permission)) {
      throw new HttpError(400, `Unknown permission: ${permission}`, 'invalid_permissions');
    }
  }
  return list;
}

function readRankFields(body: Record<string, unknown>, base?: RankRow) {
  const pick = <T>(value: unknown, fallback: T): T => (value === undefined ? fallback : (value as T));
  const nameAr = String(pick(body.nameAr, base?.name_ar ?? '')).trim();
  if (!nameAr) throw new HttpError(400, 'Rank name is required', 'invalid_rank');
  const nameEn = String(pick(body.nameEn, base?.name_en ?? '')).trim();
  const kind = String(pick(body.kind, base?.kind ?? 'rank'));
  if (!['rank', 'position'].includes(kind)) {
    throw new HttpError(400, 'Rank kind must be rank or position', 'invalid_rank');
  }
  const tier = Math.min(5, Math.max(1, Number(pick(body.tier, base?.tier ?? 1)) || 1));
  const power = Math.min(1000, Math.max(0, Number(pick(body.power, base?.power ?? 10)) || 0));
  const dailyCoins = Math.max(0, Math.round(Number(pick(body.dailyCoins, base?.daily_coins ?? 0)) || 0));
  const commissionPercent = Math.min(
    100,
    Math.max(0, Math.round(Number(pick(body.commissionPercent, base?.commission_percent ?? 0)) || 0))
  );
  const durationDays = Math.max(
    0,
    Math.round(Number(pick(body.durationDays, base?.duration_days ?? 0)) || 0)
  );
  const color = String(pick(body.color, base?.color ?? '#ffc107')).trim().slice(0, 24) || '#ffc107';
  const badgeImageUrl =
    body.badgeImageUrl === undefined
      ? base?.badge_image_url ?? null
      : body.badgeImageUrl
        ? String(body.badgeImageUrl)
        : null;
  const description = String(pick(body.description, base?.description ?? '')).slice(0, 500);
  const permissions =
    body.permissions === undefined
      ? base?.permissions ?? []
      : readPermissions(body.permissions);
  const isActive = body.isActive === undefined ? base?.is_active ?? true : Boolean(body.isActive);
  const sortOrder = Math.round(Number(pick(body.sortOrder, base?.sort_order ?? 0)) || 0);
  return {
    name_ar: nameAr,
    name_en: nameEn,
    kind,
    tier,
    power,
    daily_coins: dailyCoins,
    commission_percent: commissionPercent,
    duration_days: durationDays,
    color,
    badge_image_url: badgeImageUrl,
    description,
    permissions,
    is_active: isActive,
    sort_order: sortOrder,
  };
}

router.post(
  '/manage/ranks',
  requireRankManager('manage_ranks'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = String(body.key ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(key)) {
      throw new HttpError(400, 'Key must be 2-40 latin letters, digits or _', 'invalid_key');
    }
    const fields = readRankFields(body);
    const created = await tx(async (c) => {
      const exists = await c.query('SELECT 1 FROM ranks WHERE key = $1', [key]);
      if (exists.rowCount) throw new HttpError(409, 'A rank with this key already exists', 'duplicate_key');
      const inserted = await c.query<RankRow>(
        `INSERT INTO ranks (key, name_ar, name_en, kind, tier, power, description, daily_coins,
                            commission_percent, color, badge_image_url, permissions, duration_days,
                            is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
         RETURNING *`,
        [
          key,
          fields.name_ar,
          fields.name_en,
          fields.kind,
          fields.tier,
          fields.power,
          fields.description,
          fields.daily_coins,
          fields.commission_percent,
          fields.color,
          fields.badge_image_url,
          JSON.stringify(fields.permissions),
          fields.duration_days,
          fields.is_active,
          fields.sort_order,
        ]
      );
      await c.query(
        `INSERT INTO rank_boxes (rank_key, name, coins) VALUES ($1, $2, $3)
         ON CONFLICT (rank_key) DO NOTHING`,
        [key, `بوكس ${fields.name_ar}`, fields.daily_coins]
      );
      await audit(c, {
        actor: rankActor(req),
        action: 'create',
        rankKey: key,
        details: { nameAr: fields.name_ar, kind: fields.kind },
      });
      return inserted.rows[0];
    });
    res.status(201).json({ rank: serializeRank(created) });
  })
);

router.patch(
  '/manage/ranks/:key',
  requireRankManager('manage_ranks'),
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    const existing = await one<RankRow>('SELECT * FROM ranks WHERE key = $1', [key]);
    if (!existing) throw new HttpError(404, 'Rank not found', 'rank_not_found');
    const fields = readRankFields((req.body ?? {}) as Record<string, unknown>, existing);
    const updated = await tx(async (c) => {
      const result = await c.query<RankRow>(
        `UPDATE ranks SET name_ar = $2, name_en = $3, kind = $4, tier = $5, power = $6,
                          description = $7, daily_coins = $8, commission_percent = $9, color = $10,
                          badge_image_url = $11, permissions = $12::jsonb, duration_days = $13,
                          is_active = $14, sort_order = $15, updated_at = now()
         WHERE key = $1 RETURNING *`,
        [
          key,
          fields.name_ar,
          fields.name_en,
          fields.kind,
          fields.tier,
          fields.power,
          fields.description,
          fields.daily_coins,
          fields.commission_percent,
          fields.color,
          fields.badge_image_url,
          JSON.stringify(fields.permissions),
          fields.duration_days,
          fields.is_active,
          fields.sort_order,
        ]
      );
      // The box is the source of truth for the reward; keep the displayed amount aligned.
      await c.query('UPDATE rank_boxes SET coins = $2, updated_at = now() WHERE rank_key = $1', [
        key,
        fields.daily_coins,
      ]);
      await audit(c, {
        actor: rankActor(req),
        action: 'update',
        rankKey: key,
        details: { nameAr: fields.name_ar, dailyCoins: fields.daily_coins, isActive: fields.is_active },
      });
      return result.rows[0];
    });
    res.json({ rank: serializeRank(updated) });
  })
);

router.delete(
  '/manage/ranks/:key',
  requireRankManager('manage_ranks'),
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    const existing = await one<RankRow>('SELECT * FROM ranks WHERE key = $1', [key]);
    if (!existing) throw new HttpError(404, 'Rank not found', 'rank_not_found');
    const holders = await one<{ count: string }>(
      `SELECT count(*)::text AS count FROM user_ranks
       WHERE rank_key = $1 AND is_active AND (expires_at IS NULL OR expires_at > now())`,
      [key]
    );
    if (Number(holders?.count || 0) > 0) {
      throw new HttpError(409, 'Revoke this rank from its holders first', 'rank_in_use');
    }
    await tx(async (c) => {
      await c.query('DELETE FROM ranks WHERE key = $1', [key]);
      await audit(c, { actor: rankActor(req), action: 'delete', rankKey: key, details: { nameAr: existing.name_ar } });
    });
    res.json({ ok: true });
  })
);

function readBoxExtras(value: unknown): RankBoxExtra[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, 'Extras must be a list', 'invalid_extras');
  const extras: RankBoxExtra[] = [];
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>;
    if (item.type === 'coins') {
      const amount = Math.round(Number(item.amount) || 0);
      if (amount > 0) extras.push({ type: 'coins', amount: Math.min(10_000_000, amount) });
    } else if (item.type === 'cosmetic') {
      const itemId = String(item.itemId ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
        throw new HttpError(400, 'Invalid cosmetic item', 'invalid_extras');
      }
      extras.push({ type: 'cosmetic', itemId });
    } else {
      throw new HttpError(400, 'Unknown extra type', 'invalid_extras');
    }
  }
  return extras;
}

router.post(
  '/manage/boxes',
  requireRankManager('manage_boxes'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rankKey = String(body.rankKey ?? '');
    const rank = await one<RankRow>('SELECT * FROM ranks WHERE key = $1', [rankKey]);
    if (!rank) throw new HttpError(404, 'Rank not found', 'rank_not_found');
    const name = String(body.name ?? `بوكس ${rank.name_ar}`).trim() || `بوكس ${rank.name_ar}`;
    const coins = Math.max(0, Math.round(Number(body.coins ?? 0) || 0));
    const extras = readBoxExtras(body.extras);
    for (const extra of extras) {
      if (extra.type === 'cosmetic') {
        const item = await one('SELECT 1 FROM avatar_frames WHERE id = $1', [extra.itemId]);
        if (!item) throw new HttpError(400, 'Cosmetic item not found', 'invalid_extras');
      }
    }
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
    const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
    const box = await tx(async (c) => {
      const saved = await c.query(
        `INSERT INTO rank_boxes (rank_key, name, coins, extras, image_url, is_active)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (rank_key) DO UPDATE SET
           name = EXCLUDED.name, coins = EXCLUDED.coins, extras = EXCLUDED.extras,
           image_url = EXCLUDED.image_url, is_active = EXCLUDED.is_active, updated_at = now()
         RETURNING *`,
        [rankKey, name, coins, JSON.stringify(extras), imageUrl, isActive]
      );
      await c.query('UPDATE ranks SET daily_coins = $2, updated_at = now() WHERE key = $1', [
        rankKey,
        coins,
      ]);
      await audit(c, {
        actor: rankActor(req),
        action: 'box_update',
        rankKey,
        details: { coins, extras: extras.length, isActive },
      });
      return saved.rows[0];
    });
    res.status(201).json({ box: serializeBox(box as never) });
  })
);

router.delete(
  '/manage/boxes/:id',
  requireRankManager('manage_boxes'),
  asyncHandler(async (req, res) => {
    const removed = await tx(async (c) => {
      const result = await c.query<{ rank_key: string }>(
        'DELETE FROM rank_boxes WHERE id = $1 RETURNING rank_key',
        [req.params.id]
      );
      if (!result.rowCount) throw new HttpError(404, 'Box not found', 'box_not_found');
      await audit(c, {
        actor: rankActor(req),
        action: 'box_delete',
        rankKey: result.rows[0].rank_key,
      });
      return result.rows[0];
    });
    res.json({ ok: true, rankKey: removed.rank_key });
  })
);

router.post(
  '/manage/grant',
  requireRankManager('manage_ranks'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    let userId = String(body.userId ?? '');
    if (!userId && body.username) {
      const found = await one<{ id: string }>(
        'SELECT id FROM users WHERE username = $1 AND is_bot = false',
        [String(body.username).trim()]
      );
      if (!found) throw new HttpError(404, 'User not found', 'user_not_found');
      userId = found.id;
    }
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new HttpError(400, 'Choose a user first', 'missing_user');
    }
    const rankKey = String(body.rankKey ?? '');
    if (!rankKey) throw new HttpError(400, 'Choose a rank', 'missing_rank');
    const result = await grantRank({
      actor: rankActor(req),
      userId,
      rankKey,
      durationDays: body.durationDays === undefined ? undefined : Number(body.durationDays),
      note: body.note ? String(body.note).slice(0, 300) : null,
    });
    res.status(201).json({ rank: serializeRank(result.rank), expiresAt: result.expiresAt });
  })
);

router.post(
  '/manage/revoke',
  requireRankManager('manage_ranks'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = String(body.userId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new HttpError(400, 'Choose a user first', 'missing_user');
    }
    const rank = await revokeRank({
      actor: rankActor(req),
      userId,
      reason: body.reason ? String(body.reason).slice(0, 300) : null,
    });
    res.json({ ok: true, rankKey: rank.key });
  })
);

router.get(
  '/manage/users',
  requireRankManager(['view_users', 'manage_ranks']),
  asyncHandler(async (req, res) => {
    const rankKey = req.query.rank ? String(req.query.rank) : null;
    const rows = await q(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, r.key AS rank_key,
              r.name_ar AS rank_name, r.color AS rank_color, ur.granted_at, ur.expires_at, ur.note
       FROM user_ranks ur
       JOIN users u ON u.id = ur.user_id
       JOIN ranks r ON r.key = ur.rank_key
       WHERE ur.is_active AND (ur.expires_at IS NULL OR ur.expires_at > now())
         AND ($1::text IS NULL OR ur.rank_key = $1)
       ORDER BY ur.granted_at DESC LIMIT 200`,
      [rankKey]
    );
    res.json({ users: rows });
  })
);

router.post(
  '/manage/upload',
  requireRankManager('manage_ranks'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) throw new HttpError(400, 'No file received', 'missing_file');
    res.status(201).json({ url: `/uploads/${file.filename}` });
  })
);

export default router;
