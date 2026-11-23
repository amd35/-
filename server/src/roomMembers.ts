import type { PoolClient, QueryResultRow } from 'pg';
import { one, q, tx } from './db';
import { isOnline } from './realtime';
import { HttpError } from './utils';

/**
 * Room membership, likes and capacity.
 *
 * Presence (who has the room open) stays live over the websocket. Membership is
 * stored: it is what makes a visitor an «عضو», and the room's member limit comes
 * from the upgrade tier the room owns — a room with no upgrade seats 1000.
 */

/** Member limit of a room that has not bought any upgrade. */
export const FREE_ROOM_CAPACITY = 1000;

export type RoomMemberRole = 'owner' | 'admin' | 'supervisor' | 'member';

export interface RoomCapacity {
  count: number;
  limit: number;
  tierId: string | null;
  tierName: string | null;
}

export interface RoomMemberEntry {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  online: boolean;
  role: RoomMemberRole;
  joinedAt: string | null;
}

interface MemberRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  level: number | null;
  joined_at: string | null;
}

function run<T extends QueryResultRow>(
  client: PoolClient | undefined,
  sql: string,
  params: unknown[]
): Promise<T[]> {
  if (client) return client.query(sql, params).then((result) => result.rows as T[]);
  return q<T>(sql, params);
}

/** Current members and the limit their owned upgrade allows (locked inside a tx when given). */
export async function roomCapacity(roomId: string, client?: PoolClient): Promise<RoomCapacity> {
  const [top, counted] = await Promise.all([
    run<{ id: string; name: string; member_capacity: number }>(
      client,
      `SELECT t.id, t.name, t.member_capacity
         FROM room_upgrades u
         JOIN room_upgrade_tiers t ON t.id = u.tier_id
        WHERE u.room_id = $1 AND t.is_active = true
        ORDER BY t.member_capacity DESC
        LIMIT 1`,
      [roomId]
    ),
    run<{ total: string }>(
      client,
      `SELECT (
         (SELECT count(*) FROM room_members WHERE room_id = $1)
         + (SELECT CASE
                     WHEN owner_id IS NOT NULL AND NOT EXISTS (
                       SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = rooms.owner_id
                     ) THEN 1 ELSE 0
                   END
              FROM rooms WHERE id = $1)
       )::text AS total`,
      [roomId]
    ),
  ]);
  const best = top[0];
  return {
    count: Number(counted[0]?.total ?? 0),
    limit: Math.max(FREE_ROOM_CAPACITY, Number(best?.member_capacity ?? 0)),
    tierId: best?.id ?? null,
    tierName: best?.name ?? null,
  };
}

/** Every member of the room, oldest first; the owner is always part of the list. */
export async function roomMembers(roomId: string): Promise<RoomMemberEntry[]> {
  const [rows, room, roles] = await Promise.all([
    q<MemberRow>(
      `SELECT u.id, u.display_name, u.username, u.avatar_url, u.level, m.joined_at
         FROM room_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.room_id = $1
        ORDER BY m.joined_at ASC
        LIMIT 300`,
      [roomId]
    ),
    one<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [roomId]),
    q<{ user_id: string; role: 'admin' | 'supervisor' }>(
      'SELECT user_id, role FROM room_roles WHERE room_id = $1',
      [roomId]
    ),
  ]);

  const roleByUser = new Map(roles.map((row) => [row.user_id, row.role as RoomMemberRole]));
  const list: RoomMemberEntry[] = rows.map((row) => ({
    id: row.id,
    displayName: row.display_name || row.username || '',
    avatarUrl: row.avatar_url,
    level: Number(row.level ?? 1) || 1,
    online: isOnline(row.id),
    role: room?.owner_id === row.id ? 'owner' : roleByUser.get(row.id) ?? 'member',
    joinedAt: row.joined_at,
  }));

  // The owner counts as a member even before their first join row exists.
  const ownerId = room?.owner_id;
  if (ownerId && !list.some((entry) => entry.id === ownerId)) {
    const owner = await one<MemberRow>(
      'SELECT id, display_name, username, avatar_url, level FROM users WHERE id = $1',
      [ownerId]
    );
    if (owner) {
      list.unshift({
        id: owner.id,
        displayName: owner.display_name || owner.username || '',
        avatarUrl: owner.avatar_url,
        level: Number(owner.level ?? 1) || 1,
        online: isOnline(owner.id),
        role: 'owner',
        joinedAt: null,
      });
    }
  }
  return list;
}

export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const found = await one('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  return Boolean(found);
}

export async function roomLikeState(roomId: string, userId: string) {
  const [liked, total] = await Promise.all([
    one('SELECT 1 FROM room_likes WHERE room_id = $1 AND user_id = $2', [roomId, userId]),
    one<{ total: string }>('SELECT count(*)::text AS total FROM room_likes WHERE room_id = $1', [roomId]),
  ]);
  return { liked: Boolean(liked), likes: Number(total?.total ?? 0) };
}

/** Joins the caller as a member; refuses once the room's limit is reached. */
export async function joinRoomMember(roomId: string, userId: string): Promise<RoomCapacity> {
  return tx(async (client) => {
    // Locking the room row serialises joins, so the count can never pass the limit.
    const room = await client.query<{ is_active: boolean }>(
      'SELECT is_active FROM rooms WHERE id = $1 FOR UPDATE',
      [roomId]
    );
    if (!room.rows[0]?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

    const existing = await client.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    const capacity = await roomCapacity(roomId, client);
    if (!existing.rowCount) {
      if (capacity.count >= capacity.limit) {
        throw new HttpError(
          409,
          `الغرفة ممتلئة (${capacity.limit} عضو) — رقّي الغرفة أو أزل بعض الأعضاء`,
          'room_full',
          capacity
        );
      }
      await client.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roomId, userId]
      );
    }
    return roomCapacity(roomId, client);
  });
}

export async function leaveRoomMember(roomId: string, userId: string): Promise<RoomCapacity> {
  await q('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  return roomCapacity(roomId);
}

/** Removes a member and frees any mic they hold. Returns the removed member's id. */
export async function removeRoomMember(roomId: string, userId: string): Promise<void> {
  await tx(async (client) => {
    const room = await client.query<{ owner_id: string | null }>(
      'SELECT owner_id FROM rooms WHERE id = $1',
      [roomId]
    );
    if (room.rows[0]?.owner_id === userId) {
      throw new HttpError(400, 'The room owner cannot be removed', 'owner');
    }
    await client.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
    await client.query(
      'UPDATE room_mics SET user_id = NULL, joined_at = NULL, muted = false WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    await client.query('DELETE FROM room_roles WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  });
}

/** Toggles the heart for the caller and returns the fresh state. */
export async function toggleRoomLike(roomId: string, userId: string) {
  const liked = await one('SELECT 1 FROM room_likes WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  if (liked) {
    await q('DELETE FROM room_likes WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  } else {
    await q('INSERT INTO room_likes (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      roomId,
      userId,
    ]);
  }
  return roomLikeState(roomId, userId);
}

/** Members list + capacity + heart state, everything the member panel needs. */
export async function roomMembershipSnapshot(roomId: string, meId: string) {
  const [members, capacity, likes, member] = await Promise.all([
    roomMembers(roomId),
    roomCapacity(roomId),
    roomLikeState(roomId, meId),
    isRoomMember(roomId, meId),
  ]);
  return { members, capacity, ...likes, member };
}
