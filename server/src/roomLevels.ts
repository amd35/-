import { q, tx } from './db';
import { broadcast, isOnline } from './realtime';
import { iraqDateStr } from './utils';

/**
 * Room levels.
 *
 * A room's level comes only from real, server-observed activity inside it:
 * a chat message that passed moderation (`kind = 'chat'`) and each full minute
 * someone actually sits on a mic while connected (`kind = 'mic_minute'`).
 * Nothing is client-claimed, and `room_xp_events`'s unique
 * (room_id, kind, ref_id) index makes a retried request or a replayed tick
 * count exactly once.
 *
 * The level is a function of the stored XP (`rooms.level_xp`), so it can always
 * be recomputed — there is no separate "level" value that could drift.
 *
 * The level decides how many mic seats the room has: 5 from the start, 10 from
 * level 10, and 15 from level 50, up to level 100.
 */

export const ROOM_MAX_LEVEL = 100;
/** XP for one accepted room chat message. */
export const ROOM_CHAT_XP = 2;
/** XP for one full minute seated on a mic while connected. */
export const ROOM_MIC_MINUTE_XP = 3;
/** A single chat message can never earn room XP more than this per user, per room, per Baghdad day. */
export const ROOM_CHAT_DAILY_CAP = 200;
/** A single mic session credits at most this many minutes; re-seating starts a new session. */
export const ROOM_MIC_SESSION_MINUTE_CAP = 240;

/** Total room XP needed to be at `level` (level 1 = 0 XP). */
export function xpForRoomLevel(level: number): number {
  const steps = Math.max(0, Math.min(ROOM_MAX_LEVEL, Math.floor(Number(level) || 1)) - 1);
  return 100 * steps + 10 * steps * steps;
}

export function roomLevelForXp(xp: number): number {
  const value = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < ROOM_MAX_LEVEL && value >= xpForRoomLevel(level + 1)) level += 1;
  return level;
}

/** Mic seats the level unlocks. */
export function micSlotsForLevel(level: number): number {
  const value = Math.max(1, Math.floor(Number(level) || 1));
  if (value >= 50) return 15;
  if (value >= 10) return 10;
  return 5;
}

/** Everything the client shows about the room level. */
export function roomLevelInfo(xp: number) {
  const totalXp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = roomLevelForXp(totalXp);
  const floor = xpForRoomLevel(level);
  const next = level >= ROOM_MAX_LEVEL ? null : xpForRoomLevel(level + 1);
  return {
    level,
    levelXp: totalXp,
    levelXpFloor: floor,
    levelXpNext: next,
    micSlots: micSlotsForLevel(level),
  };
}

/**
 * Grows (or trims empty seats back to) the room's mic grid for its level.
 * Seats above the allowance are only removed while nobody is sitting on them,
 * so a level change can never kick someone off stage.
 */
export async function syncRoomMics(roomId: string, level: number): Promise<number> {
  const target = micSlotsForLevel(level);
  return tx(async (client) => {
    await client.query(
      'DELETE FROM room_mics WHERE room_id = $1 AND user_id IS NULL AND position > $2',
      [roomId, target]
    );
    const counted = await client.query<{ total: string; max_position: number }>(
      'SELECT count(*)::text AS total, COALESCE(MAX(position), 0)::int AS max_position FROM room_mics WHERE room_id = $1',
      [roomId]
    );
    let total = Number(counted.rows[0]?.total ?? 0);
    let position = Number(counted.rows[0]?.max_position ?? 0);
    let added = 0;
    while (total < target) {
      position += 1;
      total += 1;
      await client.query(
        'INSERT INTO room_mics (room_id, position, label, kind) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [roomId, position, position === 1 ? 'المايك الرئيسي' : `مايك ${position}`, position === 1 ? 'host' : 'speaker']
      );
      added += 1;
    }
    return added;
  });
}

/** Broadcasts the new stage whenever a level change added (or removed) seats. */
async function applyLevelChange(roomId: string, beforeXp: number, afterXp: number): Promise<void> {
  const before = roomLevelForXp(beforeXp);
  const after = roomLevelForXp(afterXp);
  if (after === before) return;
  await syncRoomMics(roomId, after);
  broadcast('room', { roomId });
  console.log(`[room-xp] room ${roomId} reached level ${after}`);
}

/** Awards room XP for one accepted chat message. Safe to retry. */
export async function awardRoomChatXp(roomId: string, userId: string, messageId: string): Promise<void> {
  try {
    const dayStart = new Date(`${iraqDateStr()}T00:00:00+03:00`);
    const change = await tx(async (client) => {
      const counted = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM room_xp_events
          WHERE room_id = $1 AND kind = 'chat' AND user_id = $2 AND created_at >= $3`,
        [roomId, userId, dayStart]
      );
      if (Number(counted.rows[0]?.total ?? 0) >= ROOM_CHAT_DAILY_CAP) return null;
      const inserted = await client.query(
        `INSERT INTO room_xp_events (room_id, user_id, kind, ref_id, xp)
         VALUES ($1, $2, 'chat', $3, $4)
         ON CONFLICT (room_id, kind, ref_id) DO NOTHING
         RETURNING id`,
        [roomId, userId, messageId, ROOM_CHAT_XP]
      );
      if (!inserted.rowCount) return null;
      const updated = await client.query<{ level_xp: number }>(
        'UPDATE rooms SET level_xp = level_xp + $2 WHERE id = $1 RETURNING level_xp',
        [roomId, ROOM_CHAT_XP]
      );
      const afterXp = Number(updated.rows[0]?.level_xp ?? 0);
      return { beforeXp: afterXp - ROOM_CHAT_XP, afterXp };
    });
    if (change) await applyLevelChange(roomId, change.beforeXp, change.afterXp);
  } catch (error) {
    console.error('[room-xp] chat award failed', (error as Error).message);
  }
}

interface SeatedMicRow {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  xp_minutes: number;
}

/**
 * Credits one minute of room XP to every seat that is still occupied by a
 * connected user. Runs on the server clock; the client can neither claim nor
 * skip minutes. Each session is capped, and `room_mics.xp_minutes` (reset by a
 * trigger whenever the seat changes hands) says how far the session is paid.
 */
export async function creditMicMinutes(
  options: { isActive?: (userId: string) => boolean } = {}
): Promise<void> {
  const isActive = options.isActive ?? isOnline;
  const seated = await q<SeatedMicRow>(
    `SELECT id, room_id, user_id, joined_at, xp_minutes
       FROM room_mics
      WHERE user_id IS NOT NULL AND joined_at IS NOT NULL`
  );
  const due = seated
    .map((row) => {
      if (!isActive(row.user_id)) return null;
      const elapsed = Math.floor((Date.now() - new Date(row.joined_at).getTime()) / 60_000);
      const target = Math.min(ROOM_MIC_SESSION_MINUTE_CAP, Math.max(0, elapsed));
      const paid = Number(row.xp_minutes) || 0;
      if (target <= paid) return null;
      return { row, from: paid + 1, to: target, epoch: Math.floor(new Date(row.joined_at).getTime() / 1000) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (!due.length) return;

  const changes = await tx(async (client) => {
    const perRoom = new Map<string, { beforeXp: number; afterXp: number }>();
    for (const item of due) {
      const refs: string[] = [];
      for (let minute = item.from; minute <= item.to; minute += 1) {
        refs.push(`${item.row.id}:${item.epoch}:${minute}`);
      }
      const credited = await client.query<{ room_id: string; total: string }>(
        `WITH inserted AS (
           INSERT INTO room_xp_events (room_id, user_id, kind, ref_id, xp)
           SELECT $1, $2, 'mic_minute', ref, $4
             FROM unnest($3::text[]) AS ref
           ON CONFLICT (room_id, kind, ref_id) DO NOTHING
           RETURNING room_id, xp
         )
         SELECT room_id, COALESCE(sum(xp), 0)::text AS total FROM inserted GROUP BY room_id`,
        [item.row.room_id, item.row.user_id, refs, ROOM_MIC_MINUTE_XP]
      );
      await client.query('UPDATE room_mics SET xp_minutes = $2 WHERE id = $1', [item.row.id, item.to]);
      const gained = Number(credited.rows[0]?.total ?? 0);
      if (!gained) continue;
      const updated = await client.query<{ level_xp: number }>(
        'UPDATE rooms SET level_xp = level_xp + $2 WHERE id = $1 RETURNING level_xp',
        [item.row.room_id, gained]
      );
      const afterXp = Number(updated.rows[0]?.level_xp ?? 0);
      const beforeXp = afterXp - gained;
      const existing = perRoom.get(item.row.room_id);
      perRoom.set(item.row.room_id, {
        beforeXp: existing ? existing.beforeXp : beforeXp,
        afterXp,
      });
    }
    return perRoom;
  });

  for (const [roomId, change] of changes) {
    await applyLevelChange(roomId, change.beforeXp, change.afterXp);
  }
}

/** Brings every existing room's seat grid in line with its level (called at boot). */
export async function syncAllRoomMics(): Promise<void> {
  const rooms = await q<{ id: string; level_xp: number }>('SELECT id, level_xp FROM rooms');
  for (const room of rooms) {
    try {
      const added = await syncRoomMics(room.id, roomLevelForXp(room.level_xp));
      if (added) console.log(`[room-xp] room ${room.id} seats synced (+${added})`);
    } catch (error) {
      console.error('[room-xp] seat sync failed', room.id, (error as Error).message);
    }
  }
}

let levelLoop: ReturnType<typeof setInterval> | null = null;

export function startRoomLevelLoop(): void {
  if (levelLoop) return;
  const run = () =>
    creditMicMinutes().catch((error) => console.error('[room-xp] tick failed', (error as Error).message));
  setTimeout(run, 20_000).unref();
  levelLoop = setInterval(run, 60_000);
  levelLoop.unref();
}
