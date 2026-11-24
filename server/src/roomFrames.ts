import { q } from './db';

/** Every gifted room frame stays exactly one minute; only the server sets it. */
export const ROOM_FRAME_DURATION_SECONDS = 60;

export interface RoomFrameRow {
  id: string;
  name: string;
  name_en: string;
  image_url: string;
  price: number;
  duration_seconds: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface RoomFrame {
  id: string;
  name: string;
  nameEn: string;
  imageUrl: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
}

/** A frame currently worn by one member of a room. */
export interface ActiveRoomFrame {
  userId: string;
  frameId: string;
  name: string;
  imageUrl: string;
  /** ISO timestamp kept for debugging; the client uses `remainingMs`. */
  expiresAt: string;
  /** Server-computed time left, so a wrong device clock cannot extend a frame. */
  remainingMs: number;
}

export function serializeRoomFrame(row: RoomFrameRow): RoomFrame {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    imageUrl: row.image_url,
    price: Number(row.price),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
  };
}

/** The catalog the room sheet shows: active frames only, in admin order. */
export async function listRoomFrames(): Promise<RoomFrame[]> {
  const rows = await q<RoomFrameRow>(
    'SELECT * FROM room_frames WHERE is_active = true ORDER BY sort_order, created_at'
  );
  return rows.map(serializeRoomFrame);
}

/**
 * Frames still running in a room, one per recipient (the newest send wins).
 * Rows are filtered by `now()` in SQL, so an expired frame never comes back
 * when a member leaves the room and rejoins.
 */
export async function activeRoomFrames(roomId: string): Promise<ActiveRoomFrame[]> {
  const rows = await q<{
    recipient_id: string;
    frame_id: string;
    name: string;
    image_url: string;
    expires_at: string;
    remaining_ms: number;
  }>(
    `SELECT DISTINCT ON (s.recipient_id)
            s.recipient_id, s.frame_id, f.name, f.image_url, s.expires_at,
            CEIL(EXTRACT(EPOCH FROM (s.expires_at - now())) * 1000)::int AS remaining_ms
       FROM room_frame_sends s
       JOIN room_frames f ON f.id = s.frame_id
      WHERE s.room_id = $1 AND s.expires_at > now()
      ORDER BY s.recipient_id, s.expires_at DESC`,
    [roomId]
  );
  return rows.map((row) => ({
    userId: row.recipient_id,
    frameId: row.frame_id,
    name: row.name,
    imageUrl: row.image_url,
    expiresAt: row.expires_at,
    remainingMs: Math.max(0, Number(row.remaining_ms)),
  }));
}
