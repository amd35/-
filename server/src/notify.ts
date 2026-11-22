import type { PoolClient } from 'pg';
import { q } from './db';
import { emitToUser } from './realtime';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/**
 * Stores a notification and pushes it live to every open socket of that user.
 * `type` + `data` drive client-side localization; title/body are the fallback text.
 */

/**
 * Same as `notify`, but on the caller's transaction connection. Use this from
 * inside a transaction: inserting on a second pool connection would need a
 * shared lock on the user row the transaction already holds, and deadlock.
 */
export async function notifyWith(
  c: PoolClient,
  userId: string,
  type: string,
  title: string,
  body = '',
  data: Record<string, unknown> = {}
): Promise<NotificationRow> {
  const { rows } = await c.query<{ id: string; created_at: string }>(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, created_at`,
    [userId, type, title, body, JSON.stringify(data)]
  );
  const row: NotificationRow = {
    id: rows[0].id,
    type,
    title,
    body,
    data,
    createdAt: rows[0].created_at,
  };
  emitToUser(userId, 'notification', row);
  return row;
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body = '',
  data: Record<string, unknown> = {}
): Promise<NotificationRow> {
  const rows = await q<{ id: string; created_at: string }>(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, created_at`,
    [userId, type, title, body, JSON.stringify(data)]
  );
  const row: NotificationRow = {
    id: rows[0].id,
    type,
    title,
    body,
    data,
    createdAt: rows[0].created_at,
  };
  emitToUser(userId, 'notification', row);
  return row;
}
