import { one, q, tx } from './db';
import { FrameRow, serializeFrame } from './frames';
import { notify } from './notify';
import { HttpError } from './utils';

/**
 * Royal administration identity.
 *
 * The five official positions own an admin-only design set (frame, name card,
 * chat bubble, room entry). `admin_looks` stores the design the General Admin
 * chose for each position; applying it writes real ownership + the equipped slot
 * for every active holder, so every screen that already renders cosmetics shows
 * the admin identity with no extra client work.
 */

export const ADMIN_LOOK_CATEGORIES = ['frame', 'namecard', 'bubble', 'entry'] as const;
export type AdminLookCategory = (typeof ADMIN_LOOK_CATEGORIES)[number];

const CATEGORY_COLUMN: Record<AdminLookCategory, 'frame_id' | 'namecard_id' | 'bubble_id' | 'entry_id'> = {
  frame: 'frame_id',
  namecard: 'namecard_id',
  bubble: 'bubble_id',
  entry: 'entry_id',
};

const HOLDERS_SQL = `
  SELECT ur.user_id FROM user_ranks ur
  JOIN ranks r ON r.key = ur.rank_key AND r.is_active = true
  WHERE ur.rank_key = $1 AND ur.is_active
    AND (ur.expires_at IS NULL OR ur.expires_at > now())`;

export interface AdminLookRow {
  rank_key: string;
  frame_id: string | null;
  namecard_id: string | null;
  bubble_id: string | null;
  entry_id: string | null;
  effects_enabled: boolean;
  updated_at: string;
}

/** The identity state the signed-in user wears, or null for a regular user. */
export async function adminLookForUser(userId: string) {
  const row = await one<{
    rank_key: string;
    rank_name: string;
    effects_enabled: boolean;
    frame_id: string | null;
    namecard_id: string | null;
    bubble_id: string | null;
    entry_id: string | null;
  }>(
    `SELECT ur.rank_key, r.name_ar AS rank_name, al.effects_enabled,
            al.frame_id, al.namecard_id, al.bubble_id, al.entry_id
     FROM user_ranks ur
     JOIN ranks r ON r.key = ur.rank_key AND r.is_active = true
     JOIN admin_looks al ON al.rank_key = ur.rank_key
     WHERE ur.user_id = $1 AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
     LIMIT 1`,
    [userId]
  );
  if (!row) return null;
  return {
    rankKey: row.rank_key,
    label: row.rank_name,
    effectsEnabled: Boolean(row.effects_enabled),
    frameId: row.frame_id,
    namecardId: row.namecard_id,
    bubbleId: row.bubble_id,
    entryId: row.entry_id,
  };
}

async function adminItem(itemId: string): Promise<FrameRow> {
  const item = await one<FrameRow>('SELECT * FROM avatar_frames WHERE id = $1 AND admin_only = true', [itemId]);
  if (!item) throw new HttpError(404, 'Admin design not found', 'admin_design_not_found');
  return item;
}

/** Hands one admin design to every active holder of a position. */
async function grantToHolders(c: import('pg').PoolClient, rankKey: string, item: FrameRow) {
  await c.query(
    `INSERT INTO user_avatar_frames (user_id, frame_id)
     SELECT h.user_id, $2 FROM (${HOLDERS_SQL}) h
     ON CONFLICT (user_id, frame_id) DO NOTHING`,
    [rankKey, item.id]
  );
  if (item.category === 'frame') {
    await c.query(`UPDATE users SET avatar_frame_id = $2 WHERE id IN (${HOLDERS_SQL})`, [rankKey, item.id]);
  } else {
    await c.query(
      `INSERT INTO user_cosmetics (user_id, category, item_id)
       SELECT h.user_id, $2, $3 FROM (${HOLDERS_SQL}) h
       ON CONFLICT (user_id, category)
       DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = now()`,
      [rankKey, item.category, item.id]
    );
  }
}

/** Removes the position's current design from its holders (only admin-only items). */
async function clearFromHolders(c: import('pg').PoolClient, rankKey: string, category: string) {
  if (category === 'frame') {
    await c.query(
      `UPDATE users u SET avatar_frame_id = NULL
       WHERE u.id IN (${HOLDERS_SQL})
         AND u.avatar_frame_id IN (SELECT id FROM avatar_frames WHERE admin_only = true)`,
      [rankKey]
    );
    return;
  }
  await c.query(
    `DELETE FROM user_cosmetics uc
     USING avatar_frames f
     WHERE uc.user_id IN (${HOLDERS_SQL}) AND uc.category = $2
       AND f.id = uc.item_id AND f.admin_only = true`,
    [rankKey, category]
  );
}

/** Applies the saved look of one position to every current holder. */
export async function applyAdminLook(rankKey: string) {
  const look = await one<AdminLookRow>('SELECT * FROM admin_looks WHERE rank_key = $1', [rankKey]);
  if (!look) throw new HttpError(404, 'No look saved for this position', 'look_not_found');
  const items = await q<FrameRow>(
    'SELECT * FROM avatar_frames WHERE id = ANY($1::uuid[]) AND admin_only = true',
    [ADMIN_LOOK_CATEGORIES.map((category) => look[CATEGORY_COLUMN[category]]).filter(Boolean)]
  );
  await tx(async (c) => {
    for (const category of ADMIN_LOOK_CATEGORIES) {
      const item = items.find((row) => row.id === look[CATEGORY_COLUMN[category]]);
      if (item) await grantToHolders(c, rankKey, item);
      else await clearFromHolders(c, rankKey, category);
    }
  });
  return { applied: true };
}

export interface AdminLookInput {
  frameId?: string | null;
  namecardId?: string | null;
  bubbleId?: string | null;
  entryId?: string | null;
  effectsEnabled?: boolean;
}

/** Saves a position's identity and applies it to its holders at once. */
export async function saveAdminLook(rankKey: string, input: AdminLookInput) {
  const rank = await one('SELECT key FROM ranks WHERE key = $1', [rankKey]);
  if (!rank) throw new HttpError(404, 'Position not found', 'rank_not_found');

  const next = {
    frame_id: input.frameId ?? null,
    namecard_id: input.namecardId ?? null,
    bubble_id: input.bubbleId ?? null,
    entry_id: input.entryId ?? null,
    effects_enabled: input.effectsEnabled !== false,
  };
  for (const category of ADMIN_LOOK_CATEGORIES) {
    const id = next[CATEGORY_COLUMN[category]];
    if (!id) continue;
    const item = await adminItem(id);
    if (item.category !== category) {
      throw new HttpError(400, 'Design does not belong to this section', 'wrong_category');
    }
  }
  await q(
    `INSERT INTO admin_looks (rank_key, frame_id, namecard_id, bubble_id, entry_id, effects_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (rank_key) DO UPDATE SET frame_id = EXCLUDED.frame_id, namecard_id = EXCLUDED.namecard_id,
       bubble_id = EXCLUDED.bubble_id, entry_id = EXCLUDED.entry_id,
       effects_enabled = EXCLUDED.effects_enabled, updated_at = now()`,
    [rankKey, next.frame_id, next.namecard_id, next.bubble_id, next.entry_id, next.effects_enabled]
  );
  await applyAdminLook(rankKey);
  return { saved: true };
}

/** Gives one admin design to one user (kept in their collection). */
export async function grantLookItem(userId: string, itemId: string) {
  const item = await adminItem(itemId);
  await q(
    `INSERT INTO user_avatar_frames (user_id, frame_id) VALUES ($1, $2)
     ON CONFLICT (user_id, frame_id) DO UPDATE SET acquired_at = now()`,
    [userId, item.id]
  );
  await q(
    `INSERT INTO admin_look_grants (user_id, item_id) VALUES ($1, $2)
     ON CONFLICT (user_id, item_id) DO NOTHING`,
    [userId, item.id]
  );
  await notify(userId, 'cosmetic_granted', 'تصميم إداري جديد', `تم منحك "${item.name}" من الإدارة العامة`, {
    frameId: item.id,
  });
  return item;
}

/** Takes an admin design back: ownership, grant row and the equipped slot. */
export async function revokeLookItem(userId: string, itemId: string) {
  const item = await adminItem(itemId);
  await tx(async (c) => {
    await c.query('DELETE FROM admin_look_grants WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
    await c.query('DELETE FROM user_avatar_frames WHERE user_id = $1 AND frame_id = $2', [userId, itemId]);
    if (item.category === 'frame') {
      await c.query('UPDATE users SET avatar_frame_id = NULL WHERE id = $1 AND avatar_frame_id = $2', [
        userId,
        itemId,
      ]);
    } else {
      await c.query('DELETE FROM user_cosmetics WHERE user_id = $1 AND category = $2 AND item_id = $3', [
        userId,
        item.category,
        itemId,
      ]);
    }
  });
  return item;
}

/** Everything the «مظهر الإدارة» panel needs, in one read. */
export async function adminLookOverview() {
  const [positions, items, looks, grants] = await Promise.all([
    q<{ key: string; name_ar: string; color: string; holders: number }>(
      `SELECT r.key, r.name_ar, r.color,
         (SELECT count(*)::int FROM user_ranks ur
           WHERE ur.rank_key = r.key AND ur.is_active
             AND (ur.expires_at IS NULL OR ur.expires_at > now())) AS holders
       FROM ranks r
       WHERE r.key IN ('super_admin','admin_manager','admin_deputy','admin_supervisor','admin_official')
       ORDER BY r.sort_order ASC`
    ),
    q<FrameRow>(
      `SELECT * FROM avatar_frames
       WHERE admin_only = true AND is_active = true
       ORDER BY category, sort_order`
    ),
    q<AdminLookRow>('SELECT * FROM admin_looks'),
    q<{
      user_id: string;
      username: string;
      display_name: string;
      item_id: string;
      item_name: string;
      category: string;
      granted_at: string;
    }>(
      `SELECT g.user_id, u.username, u.display_name, g.item_id, f.name AS item_name, f.category, g.granted_at
       FROM admin_look_grants g
       JOIN users u ON u.id = g.user_id
       JOIN avatar_frames f ON f.id = g.item_id
       ORDER BY g.granted_at DESC LIMIT 100`
    ),
  ]);

  return {
    positions: positions.map((row) => {
      const look = looks.find((entry) => entry.rank_key === row.key);
      return {
        key: row.key,
        nameAr: row.name_ar,
        color: row.color,
        holders: Number(row.holders),
        look: {
          frameId: look?.frame_id ?? null,
          namecardId: look?.namecard_id ?? null,
          bubbleId: look?.bubble_id ?? null,
          entryId: look?.entry_id ?? null,
          effectsEnabled: look ? Boolean(look.effects_enabled) : true,
        },
      };
    }),
    items: ADMIN_LOOK_CATEGORIES.reduce<Record<string, ReturnType<typeof serializeFrame>[]>>(
      (grouped, category) => {
        grouped[category] = items.filter((item) => item.category === category).map(serializeFrame);
        return grouped;
      },
      {}
    ),
    grants: grants.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      itemId: row.item_id,
      itemName: row.item_name,
      category: row.category,
      grantedAt: row.granted_at,
    })),
  };
}
