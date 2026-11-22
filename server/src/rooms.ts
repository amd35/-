import type { PoolClient } from 'pg';
import { one, q } from './db';
import { isOnline } from './realtime';
import {
  FRAME_FIELDS,
  RANK_FIELDS,
  VIP_FIELDS,
  frameFromRow,
  frameJoins,
  rankFromRow,
  rankJoins,
  vipFromRow,
  vipJoins,
  type FrameInfo,
  type RankInfo,
} from './serializers';
import { HttpError } from './utils';

export const MIC_KINDS = ['host', 'speaker', 'audience'] as const;
export type MicKind = (typeof MIC_KINDS)[number];

export interface RoomRow {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  rules: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface MicRow {
  id: string;
  room_id: string;
  position: number;
  label: string;
  kind: string;
  is_locked: boolean;
  user_id: string | null;
  joined_at: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  frame_id?: string | null;
  frame_design?: string | null;
  frame_kind?: string | null;
  frame_image_url?: string | null;
  frame_rarity?: string | null;
  rank_key?: string | null;
  rank_name_ar?: string | null;
  rank_name_en?: string | null;
  rank_kind?: string | null;
  rank_tier?: number | null;
  rank_color?: string | null;
  rank_badge_url?: string | null;
  level?: number | null;
  vip_tier?: number | null;
  vip_name_ar?: string | null;
  vip_name_en?: string | null;
  vip_color?: string | null;
  vip_title_ar?: string | null;
  vip_title_en?: string | null;
  vip_badge_url?: string | null;
  vip_frame_url?: string | null;
  vip_bubble_url?: string | null;
  vip_source?: string | null;
  vip_expires_at?: string | null;
}

export interface SeatUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  frame: FrameInfo | null;
  rank: RankInfo | null;
  level: number;
  vip: import('./progression').VipInfo | null;
}

export function serializeRoom(row: RoomRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    coverUrl: row.cover_url,
    rules: row.rules,
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
  };
}

export function serializeMic(row: MicRow, meId: string) {
  const user: SeatUser | null = row.user_id
    ? {
        id: row.user_id,
        username: row.username ?? '',
        displayName: row.display_name ?? '',
        avatarUrl: row.avatar_url,
        online: isOnline(row.user_id),
        frame: frameFromRow(row),
        rank: rankFromRow(row),
        level: Number(row.level ?? 1) || 1,
        vip: vipFromRow(row),
      }
    : null;
  return {
    id: row.id,
    position: Number(row.position),
    label: row.label,
    kind: row.kind,
    isLocked: row.is_locked,
    mine: Boolean(row.user_id && row.user_id === meId),
    user,
  };
}

const MIC_SELECT = `
  SELECT m.id, m.room_id, m.position, m.label, m.kind, m.is_locked, m.user_id, m.joined_at,
         u.username, u.level, u.display_name, u.avatar_url, ${FRAME_FIELDS}, ${RANK_FIELDS}, ${VIP_FIELDS}
  FROM room_mics m
  LEFT JOIN users u ON u.id = m.user_id
  ${frameJoins('u')}
  ${rankJoins('u')}
  ${vipJoins('u')}`;

export async function roomMics(roomId: string, meId: string) {
  const rows = await q<MicRow>(`${MIC_SELECT} WHERE m.room_id = $1 ORDER BY m.position ASC`, [roomId]);
  return rows.map((row) => serializeMic(row, meId));
}

export async function getRoomDetail(roomId: string, meId: string) {
  const room = await one<RoomRow>('SELECT * FROM rooms WHERE id = $1', [roomId]);
  if (!room || !room.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
  return { ...serializeRoom(room), mics: await roomMics(roomId, meId) };
}

export async function listRooms() {
  const rows = await q<RoomRow & { mic_count: string; occupied: string }>(
    `SELECT r.*,
       (SELECT count(*)::text FROM room_mics m WHERE m.room_id = r.id) AS mic_count,
       (SELECT count(*)::text FROM room_mics m WHERE m.room_id = r.id AND m.user_id IS NOT NULL) AS occupied
     FROM rooms r
     WHERE r.is_active = true
     ORDER BY r.sort_order ASC, r.created_at ASC`
  );
  return rows.map((row) => ({
    ...serializeRoom(row),
    micCount: Number(row.mic_count),
    occupied: Number(row.occupied),
  }));
}

/** Admin view: every room (active or not) with its seats and current occupants. */
export async function allRoomsWithMics() {
  const rooms = await q<RoomRow>('SELECT * FROM rooms ORDER BY sort_order ASC, created_at ASC');
  const mics = await q<MicRow>(`${MIC_SELECT} ORDER BY m.room_id, m.position ASC`);
  return rooms.map((room) => ({
    ...serializeRoom(room),
    mics: mics.filter((mic) => mic.room_id === room.id).map((mic) => serializeMic(mic, '')),
  }));
}

export interface RoomMessageRow {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  type: string;
  created_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  gift_send_id: string | null;
  gift_coins: string | null;
  gift_recipient_coins: string | null;
  gift_send_name: string | null;
  gift_slug: string | null;
  gift_name: string | null;
  gift_name_en: string | null;
  gift_design: string | null;
  gift_video_url: string | null;
  gift_cover_url: string | null;
  gift_rarity: string | null;
}

export function serializeRoomMessage(row: RoomMessageRow) {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name || row.username || '',
    avatarUrl: row.avatar_url,
    body: row.body,
    type: row.type,
    createdAt: row.created_at,
    gift: row.gift_send_id
      ? {
          id: row.gift_send_id,
          name: row.gift_name || row.gift_send_name || 'Gift',
          nameEn: row.gift_name_en || row.gift_send_name || 'Gift',
          slug: row.gift_slug,
          design: row.gift_design,
          videoUrl: row.gift_video_url,
          coverUrl: row.gift_cover_url,
          rarity: row.gift_rarity || 'common',
          price: Number(row.gift_coins ?? 0),
          recipientCoins: Number(row.gift_recipient_coins ?? 0),
        }
      : null,
  };
}

const ROOM_MESSAGE_SELECT = `
  SELECT rm.id, rm.room_id, rm.user_id, rm.body, rm.type, rm.created_at,
         u.display_name, u.username, u.avatar_url,
         gs.id AS gift_send_id, gs.coins AS gift_coins, gs.recipient_coins AS gift_recipient_coins,
         gs.gift_name AS gift_send_name, g.slug AS gift_slug, g.name AS gift_name,
         g.name_en AS gift_name_en, g.design AS gift_design, g.video_url AS gift_video_url,
         g.cover_url AS gift_cover_url, g.rarity AS gift_rarity
  FROM room_messages rm
  JOIN users u ON u.id = rm.user_id
  LEFT JOIN gift_sends gs ON gs.id = rm.gift_send_id
  LEFT JOIN gifts g ON g.id = gs.gift_id`;

/** Latest messages of a room, oldest first so the client can append at the bottom. */
export async function roomMessages(roomId: string) {
  const rows = await q<RoomMessageRow>(
    `${ROOM_MESSAGE_SELECT} WHERE rm.room_id = $1 ORDER BY rm.created_at DESC LIMIT 60`,
    [roomId]
  );
  return rows.reverse().map(serializeRoomMessage);
}

export async function roomMessageById(messageId: string) {
  const row = await one<RoomMessageRow>(`${ROOM_MESSAGE_SELECT} WHERE rm.id = $1`, [messageId]);
  return row ? serializeRoomMessage(row) : null;
}

/**
 * Re-numbers a room's seats to 1..n. Positions are shifted to negative values first so
 * the (room_id, position) unique index never collides halfway through the rewrite.
 */
export async function packMicPositions(client: PoolClient, roomId: string): Promise<void> {
  const rows = await client.query<{ id: string }>(
    'SELECT id FROM room_mics WHERE room_id = $1 ORDER BY position ASC, created_at ASC',
    [roomId]
  );
  await client.query('UPDATE room_mics SET position = -position - 1000000 WHERE room_id = $1', [roomId]);
  let position = 1;
  for (const row of rows.rows) {
    await client.query('UPDATE room_mics SET position = $2 WHERE id = $1', [row.id, position]);
    position += 1;
  }
}
