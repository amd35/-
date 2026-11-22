import { one } from './db';
import { isOnline } from './realtime';
import type { RankInfo } from './ranks';

export type { RankInfo };

export interface FrameInfo {
  id: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  country: string | null;
  age: number | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  /** The frame the user currently wears, or null. */
  frame: FrameInfo | null;
  /** The official rank the user currently holds, or null. */
  rank: RankInfo | null;
}

interface RankColumns {
  rank_key?: string | null;
  rank_name_ar?: string | null;
  rank_name_en?: string | null;
  rank_kind?: string | null;
  rank_tier?: number | null;
  rank_color?: string | null;
  rank_badge_url?: string | null;
}

interface FrameColumns {
  frame_id?: string | null;
  frame_design?: string | null;
  frame_kind?: string | null;
  frame_image_url?: string | null;
  frame_rarity?: string | null;
}

interface UserLike extends FrameColumns, RankColumns {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
  gender?: string | null;
  country?: string | null;
  age?: number | null;
  last_seen_at?: string | Date | null;
  created_at?: string | Date;
}

/**
 * SQL joins that resolve a user's equipped frame. The frame is only exposed while it
 * is active and the user still owns it (permanent or not expired).
 */
export function frameJoins(userAlias: string): string {
  return `
    LEFT JOIN avatar_frames af ON af.id = ${userAlias}.avatar_frame_id AND af.is_active = true
    LEFT JOIN user_avatar_frames uaf ON uaf.user_id = ${userAlias}.id AND uaf.frame_id = af.id
      AND (uaf.expires_at IS NULL OR uaf.expires_at > now())`;
}

/** Selected alongside `frameJoins()`: null unless the user actually owns the frame. */
export const FRAME_FIELDS = `
    CASE WHEN uaf.frame_id IS NULL THEN NULL ELSE af.id END AS frame_id,
    CASE WHEN uaf.frame_id IS NULL THEN NULL ELSE af.design END AS frame_design,
    CASE WHEN uaf.frame_id IS NULL THEN NULL ELSE af.kind END AS frame_kind,
    CASE WHEN uaf.frame_id IS NULL THEN NULL ELSE af.image_url END AS frame_image_url,
    CASE WHEN uaf.frame_id IS NULL THEN NULL ELSE af.rarity END AS frame_rarity`;

export function frameFromRow(row: FrameColumns): FrameInfo | null {
  if (!row.frame_id) return null;
  return {
    id: row.frame_id,
    design: row.frame_design ?? null,
    kind: row.frame_kind ?? 'design',
    imageUrl: row.frame_image_url ?? null,
    rarity: row.frame_rarity ?? 'common',
  };
}

/**
 * Joins the user's active official rank. Expired grants and paused ranks are
 * filtered out here, so a badge never outlives the grant that created it.
 */
export function rankJoins(userAlias: string): string {
  return `
    LEFT JOIN user_ranks ur ON ur.user_id = ${userAlias}.id AND ur.is_active
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
    LEFT JOIN ranks rk ON rk.key = ur.rank_key AND rk.is_active = true`;
}

/** Selected alongside `rankJoins()`. */
export const RANK_FIELDS = `
    rk.key AS rank_key,
    rk.name_ar AS rank_name_ar,
    rk.name_en AS rank_name_en,
    rk.kind AS rank_kind,
    rk.tier AS rank_tier,
    rk.color AS rank_color,
    rk.badge_image_url AS rank_badge_url`;

export function rankFromRow(row: RankColumns): RankInfo | null {
  if (!row.rank_key) return null;
  return {
    key: row.rank_key,
    nameAr: row.rank_name_ar ?? row.rank_key,
    nameEn: row.rank_name_en ?? '',
    kind: row.rank_kind ?? 'rank',
    tier: Number(row.rank_tier ?? 1),
    color: row.rank_color ?? '#ffc107',
    badgeImageUrl: row.rank_badge_url ?? null,
    jobTitle: row.rank_kind === 'position' ? row.rank_name_ar ?? null : null,
  };
}

function recentlySeen(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && Date.now() - ts < 90_000;
}

export function toPublicUser(row: UserLike): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio ?? null,
    gender: row.gender ?? null,
    country: row.country ?? null,
    age: row.age ?? null,
    online: isOnline(row.id) || recentlySeen(row.last_seen_at),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    frame: frameFromRow(row),
    rank: rankFromRow(row),
  };
}

export async function getPublicUser(userId: string): Promise<PublicUser | null> {
  const row = await one<UserLike>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.gender, u.country, u.age,
            u.last_seen_at, u.created_at, ${FRAME_FIELDS}, ${RANK_FIELDS}
     FROM users u ${frameJoins('u')} ${rankJoins('u')}
     WHERE u.id = $1`,
    [userId]
  );
  return row ? toPublicUser(row) : null;
}
