import fs from 'node:fs';
import path from 'node:path';
import { one, q, tx } from './db';
import { broadcast } from './realtime';
import { HttpError } from './utils';
import { UPLOAD_DIR } from './routes/uploads';

/**
 * App-wide artwork managed from the admin panel.
 *
 * Every screen reads its image from a named slot, so the General Admin can change
 * any background (main app, Yalla cover, login, splash, page sections) without a
 * new build: publishing writes a row and every client picks it up on its next
 * load or through the realtime `backgrounds` event.
 *
 * Each slot keeps its whole history. Only the published row is live; older rows
 * stay in the table so a previous background can be restored with one click.
 */

export interface BackgroundSlot {
  key: string;
  label: string;
  hint: string;
}

export const BACKGROUND_SLOTS: BackgroundSlot[] = [
  { key: 'app_main', label: 'خلفية التطبيق الرئيسية', hint: 'تظهر خلف جميع شاشات التطبيق' },
  { key: 'yalla_cover', label: 'غلاف Yalla Phone', hint: 'بانر الغلاف أعلى الصفحة الرئيسية' },
  { key: 'login', label: 'شاشة تسجيل الدخول', hint: 'خلفية شاشات الدخول والتسجيل' },
  { key: 'splash', label: 'شاشة البداية والترحيب', hint: 'خلفية شاشة الترحيب قبل الدخول' },
  { key: 'pages', label: 'خلفيات الصفحات (عامة)', hint: 'تُستخدم لأي صفحة بلا خلفية خاصة' },
  { key: 'page_home', label: 'الصفحة الرئيسية', hint: 'خلفية صفحة اكتشف الناس' },
  { key: 'page_chats', label: 'صفحة الدردشات', hint: 'خلفية قائمة المحادثات' },
  { key: 'page_rooms', label: 'صفحة الغرف الصوتية', hint: 'خلفية قائمة الغرف' },
  { key: 'page_wallet', label: 'صفحة المحفظة', hint: 'خلفية المحفظة والشحن' },
  { key: 'page_profile', label: 'صفحة الملف الشخصي', hint: 'خلفية الملف الشخصي' },
  { key: 'page_settings', label: 'صفحة الإعدادات', hint: 'خلفية الإعدادات' },
];

const SLOT_KEYS = new Set(BACKGROUND_SLOTS.map((slot) => slot.key));

export interface BackgroundRow {
  id: string;
  slot: string;
  title: string;
  image_url: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeBackground(row: BackgroundRow) {
  return {
    id: row.id,
    slot: row.slot,
    title: row.title,
    imageUrl: row.image_url,
    isActive: row.is_active,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBackgrounds(): Promise<BackgroundRow[]> {
  return q<BackgroundRow>('SELECT * FROM app_backgrounds ORDER BY created_at DESC');
}

function isLive(row: BackgroundRow, now: number): boolean {
  const start = row.starts_at ? new Date(row.starts_at).getTime() : null;
  const end = row.ends_at ? new Date(row.ends_at).getTime() : null;
  if (start !== null && start > now) return false;
  if (end !== null && end < now) return false;
  return true;
}

/**
 * Picks the background each slot currently shows. The published row wins while
 * its schedule window is open; a scheduled or expired row falls back to the
 * newest saved row that is live right now (which is how "restore previous"
 * keeps working after a schedule ends).
 */
export function resolveLive(rows: BackgroundRow[]): Record<string, BackgroundRow> {
  const now = Date.now();
  const out: Record<string, BackgroundRow> = {};
  for (const row of rows) {
    if (!isLive(row, now)) continue;
    const current = out[row.slot];
    if (row.is_active) {
      if (!current || !current.is_active) out[row.slot] = row;
      continue;
    }
    // Only previously published rows can come back as a fallback; saved-only drafts stay hidden.
    if (!current && row.published_at) out[row.slot] = row;
  }
  return out;
}

/** What every client needs: the live image of each slot. Public, no auth. */
export async function publicBackgrounds() {
  const live = resolveLive(await listBackgrounds());
  return Object.entries(live).map(([slot, row]) => ({
    slot,
    url: row.image_url,
    title: row.title,
  }));
}

export async function adminBackgroundsOverview() {
  const rows = await listBackgrounds();
  const live = resolveLive(rows);
  return {
    slots: BACKGROUND_SLOTS,
    backgrounds: rows.map(serializeBackground),
    live: Object.fromEntries(Object.entries(live).map(([slot, row]) => [slot, row.id])),
  };
}

function readSlot(value: unknown): string {
  const slot = String(value ?? '').trim();
  if (!SLOT_KEYS.has(slot)) throw new HttpError(400, 'Unknown background slot', 'invalid_slot');
  return slot;
}

function readTitle(value: unknown): string {
  return String(value ?? '').trim().slice(0, 120);
}

function readImageUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url) throw new HttpError(400, 'Upload an image first', 'missing_image');
  if (!url.startsWith('/uploads/') && !/^https?:\/\//.test(url)) {
    throw new HttpError(400, 'Image URL is not valid', 'invalid_image');
  }
  return url;
}

function readDate(value: unknown, message: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new HttpError(400, message, 'invalid_date');
  return date.toISOString();
}

function readWindow(body: Record<string, unknown>) {
  const startsAt = readDate(body.startsAt, 'Invalid start date');
  const endsAt = readDate(body.endsAt, 'Invalid end date');
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new HttpError(400, 'The end date must be after the start date', 'invalid_window');
  }
  return { startsAt, endsAt };
}

export interface BackgroundInput {
  slot: unknown;
  title: unknown;
  imageUrl: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  publish?: boolean;
}

export async function createBackground(input: BackgroundInput) {
  const slot = readSlot(input.slot);
  const title = readTitle(input.title);
  const imageUrl = readImageUrl(input.imageUrl);
  const { startsAt, endsAt } = readWindow({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });

  const row = await tx(async (client) => {
    if (input.publish) {
      await client.query('UPDATE app_backgrounds SET is_active = false WHERE slot = $1 AND is_active', [slot]);
    }
    const result = await client.query<BackgroundRow>(
      `INSERT INTO app_backgrounds (slot, title, image_url, is_active, starts_at, ends_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [slot, title, imageUrl, Boolean(input.publish), startsAt, endsAt, input.publish ? new Date() : null]
    );
    return result.rows[0];
  });

  broadcast('backgrounds', { slot });
  return row;
}

export async function updateBackground(id: string, body: Record<string, unknown>) {
  const current = await one<BackgroundRow>('SELECT * FROM app_backgrounds WHERE id = $1', [id]);
  if (!current) throw new HttpError(404, 'Background not found', 'background_not_found');

  const title = body.title === undefined ? current.title : readTitle(body.title);
  const imageUrl = body.imageUrl === undefined ? current.image_url : readImageUrl(body.imageUrl);
  const { startsAt, endsAt } = readWindow({
    startsAt: body.startsAt === undefined ? current.starts_at : body.startsAt,
    endsAt: body.endsAt === undefined ? current.ends_at : body.endsAt,
  });

  const row = await one<BackgroundRow>(
    `UPDATE app_backgrounds
     SET title = $2, image_url = $3, starts_at = $4, ends_at = $5, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, title, imageUrl, startsAt, endsAt]
  );
  broadcast('backgrounds', { slot: current.slot });
  return row!;
}

/** Publishes one row for its slot; the slot's other rows stay saved as history. */
export async function publishBackground(id: string) {
  const row = await one<BackgroundRow>('SELECT * FROM app_backgrounds WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'Background not found', 'background_not_found');

  await tx(async (client) => {
    await client.query('UPDATE app_backgrounds SET is_active = false WHERE slot = $1 AND id <> $2', [
      row.slot,
      id,
    ]);
    await client.query(
      `UPDATE app_backgrounds
       SET is_active = true, published_at = COALESCE(published_at, now()), updated_at = now()
       WHERE id = $1`,
      [id]
    );
  });

  broadcast('backgrounds', { slot: row.slot });
  return { ...row, is_active: true };
}

export async function deleteBackground(id: string) {
  const row = await one<BackgroundRow>('SELECT * FROM app_backgrounds WHERE id = $1', [id]);
  if (!row) throw new HttpError(404, 'Background not found', 'background_not_found');

  await q('DELETE FROM app_backgrounds WHERE id = $1', [id]);
  await removeUnusedFile(row.image_url);
  broadcast('backgrounds', { slot: row.slot });
  return row;
}

/** Deletes the uploaded file once no background row points at it any more. */
async function removeUnusedFile(imageUrl: string) {
  if (!imageUrl.startsWith('/uploads/')) return;
  const used = await one<{ count: string }>(
    'SELECT count(*)::text AS count FROM app_backgrounds WHERE image_url = $1',
    [imageUrl]
  );
  if (Number(used?.count || 0) > 0) return;
  const name = path.basename(imageUrl);
  const filePath = path.join(UPLOAD_DIR, name);
  if (path.dirname(filePath) !== path.resolve(UPLOAD_DIR)) return;
  fs.promises.unlink(filePath).catch(() => undefined);
}
