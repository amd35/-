import type { PoolClient } from 'pg';
import { one, q } from './db';
import { activeRankFor, isOfficialAdmin } from './ranks';
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

/** Mic seat designs selectable from the admin panel (all transparent). */
export const MIC_STYLES = ['fire', 'glass', 'crystal', 'neon', 'gold', 'ice'] as const;

export interface RoomRow {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  rules: string;
  is_active: boolean;
  sort_order: number;
  owner_id: string | null;
  created_by: string | null;
  background: string;
  music_url: string | null;
  country: string;
  language: string;
  mic_style: string;
  mic_color: string;
  created_at: string;
}

export interface MicRow {
  id: string;
  room_id: string;
  position: number;
  label: string;
  kind: string;
  is_locked: boolean;
  muted: boolean;
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

/** Short numeric room code shown in the stage header (stable, derived from the id). */
export function roomCode(id: string): string {
  const digits = id.replace(/[^0-9]/g, '');
  return (digits.slice(-5) || id.slice(0, 5)).padStart(5, '0');
}

export function serializeRoom(row: RoomRow) {
  return {
    id: row.id,
    code: roomCode(row.id),
    name: row.name,
    description: row.description,
    coverUrl: row.cover_url,
    rules: row.rules,
    isActive: row.is_active,
    sortOrder: Number(row.sort_order),
    background: row.background || 'fire',
    musicUrl: row.music_url,
    country: row.country || 'العراق',
    language: row.language || 'العربية',
    micStyle: row.mic_style || 'fire',
    micColor: row.mic_color || '#ff3b0f',
    ownerId: row.owner_id,
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
    muted: Boolean(row.muted),
    mine: Boolean(row.user_id && row.user_id === meId),
    user,
  };
}

const MIC_SELECT = `
  SELECT m.id, m.room_id, m.position, m.label, m.kind, m.is_locked, m.muted, m.user_id, m.joined_at,
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

export type RoomRole = 'owner' | 'admin' | 'supervisor' | 'member';

export interface RoomAccess {
  role: RoomRole;
  /** Owner/admin: background, roles, room settings. */
  canManage: boolean;
  /** Owner/admin/supervisor: lock, mute, kick, delete messages. */
  canModerate: boolean;
}

export async function roomAccess(
  roomId: string,
  userId: string,
  ownerId: string | null
): Promise<RoomAccess> {
  if (ownerId && ownerId === userId) return { role: 'owner', canManage: true, canModerate: true };
  const granted = await one<{ role: 'admin' | 'supervisor' }>(
    'SELECT role FROM room_roles WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
  if (granted) {
    return {
      role: granted.role,
      canManage: granted.role === 'admin',
      canModerate: true,
    };
  }
  // Official platform administration can moderate any room.
  const rank = await activeRankFor(userId);
  if (isOfficialAdmin(rank)) {
    return { role: 'admin', canManage: true, canModerate: true };
  }
  return { role: 'member', canManage: false, canModerate: false };
}

interface RoomOwnerRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
  rank_key?: string | null;
  rank_name_ar?: string | null;
  rank_name_en?: string | null;
  rank_kind?: string | null;
  rank_tier?: number | null;
  rank_color?: string | null;
  rank_badge_url?: string | null;
  frame_id?: string | null;
  frame_design?: string | null;
  frame_kind?: string | null;
  frame_image_url?: string | null;
  frame_rarity?: string | null;
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

/** The owner's public identity (avatar, rank, frame) shown in the room header. */
export async function roomOwner(ownerId: string | null) {
  if (!ownerId) return null;
  const row = await one<RoomOwnerRow>(
    `SELECT u.id, u.username, u.level, u.display_name, u.avatar_url,
            ${FRAME_FIELDS}, ${RANK_FIELDS}, ${VIP_FIELDS}
     FROM users u
     ${frameJoins('u')}
     ${rankJoins('u')}
     ${vipJoins('u')}
     WHERE u.id = $1`,
    [ownerId]
  );
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name || row.username || '',
    avatarUrl: row.avatar_url,
    online: isOnline(row.id),
    frame: frameFromRow(row),
    rank: rankFromRow(row),
    level: Number(row.level ?? 1) || 1,
    vip: vipFromRow(row),
  };
}

export async function getRoomDetail(roomId: string, meId: string) {
  const room = await one<RoomRow>('SELECT * FROM rooms WHERE id = $1', [roomId]);
  if (!room || !room.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');
  const [mics, owner, access, roles] = await Promise.all([
    roomMics(roomId, meId),
    roomOwner(room.owner_id),
    roomAccess(roomId, meId, room.owner_id),
    roomRoles(roomId),
  ]);
  return { ...serializeRoom(room), owner, ...access, roles, mics };
}

export interface RoomRoleEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'supervisor';
}

export async function roomRoles(roomId: string): Promise<RoomRoleEntry[]> {
  const rows = await q<{
    user_id: string;
    role: 'admin' | 'supervisor';
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  }>(
    `SELECT rr.user_id, rr.role, u.display_name, u.username, u.avatar_url
     FROM room_roles rr JOIN users u ON u.id = rr.user_id
     WHERE rr.room_id = $1 ORDER BY rr.created_at ASC`,
    [roomId]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name || row.username || '',
    avatarUrl: row.avatar_url,
    role: row.role,
  }));
}

export async function listRooms(userId?: string | null) {
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
    mine: Boolean(userId && row.created_by === userId),
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
  is_announcement: boolean;
  rank_key?: string | null;
  rank_name_ar?: string | null;
  rank_name_en?: string | null;
  rank_kind?: string | null;
  rank_tier?: number | null;
  rank_color?: string | null;
  rank_badge_url?: string | null;
  gift_send_id: string | null;
  gift_coins: string | null;
  gift_recipient_coins: string | null;
  gift_quantity: number | null;
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
    isAnnouncement: Boolean(row.is_announcement),
    rank: rankFromRow(row),
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
          quantity: Number(row.gift_quantity ?? 1),
        }
      : null,
  };
}

const ROOM_MESSAGE_SELECT = `
  SELECT rm.id, rm.room_id, rm.user_id, rm.body, rm.type, rm.created_at, rm.is_announcement,
         u.display_name, u.username, u.avatar_url, ${RANK_FIELDS},
         gs.id AS gift_send_id, gs.coins AS gift_coins, gs.recipient_coins AS gift_recipient_coins,
         gs.quantity AS gift_quantity,
         gs.gift_name AS gift_send_name, g.slug AS gift_slug, g.name AS gift_name,
         g.name_en AS gift_name_en, g.design AS gift_design, g.video_url AS gift_video_url,
         g.cover_url AS gift_cover_url, g.rarity AS gift_rarity
  FROM room_messages rm
  JOIN users u ON u.id = rm.user_id
  ${rankJoins('u')}
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
